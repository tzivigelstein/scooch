// Proyectos guardados en el navegador (IndexedDB): el que está abierto, el
// guardado automático y abrir, crear, duplicar, renombrar y eliminar.
//
// Guardado: cada render compara la firma del documento con la guardada; si
// cambió, se guarda ~1 s después del último cambio, y enseguida si la pestaña
// se oculta (visibilitychange / pagehide). Solo se escriben los binarios que
// faltan. Nada sale del navegador.
//
// Varias pestañas (la solución más simple y segura): un proyecto tiene una
// sola pestaña que lo guarda. Abrirlo en otra pestaña se lo «pide» a la que lo
// tenía por BroadcastChannel: esa guarda lo pendiente, deja de guardar y avisa
// («Este proyecto se abrió en otra pestaña»); recién entonces la nueva lo lee
// del almacenamiento, así nunca pisa cambios sin saberlo. Desde la pestaña
// vieja, «Editar aquí» lo vuelve a pedir y lo recarga. Si una pestaña no
// contesta (congelada), se espera 3 s: igual ya había guardado al ocultarse.

import { LAST_PROJECT_STORAGE } from './config.js';
import { openIdbStorage } from './idbstorage.js';
import {
  newProjectId,
  cleanName,
  emptyDoc,
  createProject,
  saveProject,
  loadProject,
  duplicateProject,
  renameProject,
  deleteProject,
  listProjects,
  pickProject,
} from './projectstore.js';
import { serialize, fileKeys } from './projectdoc.js';
import { state, assets, render, replaceDocument, docState, sheetSize, itemsOn } from './store.js';
import { restoreAssets, assetBlob } from './assets.js';
import { storageGet, storageSet } from './util.js';
import { t } from './copy/index.js';

const SAVE_DELAY = 1000;
const THUMB_WIDTH = 220;

/**
 * Estado del proyecto abierto. `status`: 'loading', 'saved', 'pending',
 * 'saving', 'error', 'off' (este navegador no deja guardar) o 'readonly' (lo
 * guarda otra pestaña).
 */
export const session = {
  storage: null,
  record: null, // {id, name, created, modified, …}
  stored: new Set(), // claves de archivos ya guardadas
  savedSig: '',
  failedSig: '', // lo que no se pudo guardar: no se reintenta solo hasta que cambie algo
  thumbSig: '',
  status: 'loading',
  error: null,
};

let hooks = {};
let timer = 0;
let saving = null;
let persistAsked = false;
const tab = newProjectId();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('pliego-projects') : null;

const now = () => Date.now();
const untitled = () => t('projects.untitled');

function setStatus(status, error = null) {
  const recovered = session.status === 'error' && status === 'saved';
  session.status = status;
  session.error = error;
  hooks.statusChanged?.({ recovered });
}

// ---------- Inicio ----------

/**
 * Abre el almacenamiento y restaura el último proyecto (o crea uno «Sin
 * título»). `hooks`: `statusChanged({recovered})`, `notify(tipo, datos)` para
 * los avisos, `listChanged()` y `thumbImage(item)` (la <img> ya cargada de una
 * pieza, para la miniatura).
 */
export async function initProjects(h) {
  hooks = h;
  channel?.addEventListener('message', onMessage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', () => flush());
  try {
    session.storage = await openIdbStorage();
  } catch (err) {
    console.warn('No se puede guardar en este navegador.', err);
    return startUnsaved();
  }
  // Los avisos de la apertura salen cuando el documento ya está en su lugar.
  const later = [];
  const notify = hooks.notify;
  hooks.notify = (...args) => later.push(args);
  try {
    await restoreLast();
  } finally {
    hooks.notify = notify;
    for (const args of later) notify(...args);
  }
}

async function restoreLast() {
  try {
    const list = await listProjects(session.storage);
    const lastId = storageGet(LAST_PROJECT_STORAGE);
    // El último abierto está dañado: no rompe nada; se avisa y se ofrece eliminarlo.
    const broken = list.find((record) => record.id === lastId && record.damaged);
    if (broken) hooks.notify('openFailed', { record: broken, error: Object.assign(new Error('dañado'), { code: 'corrupt' }) });
    const id = pickProject(list, lastId);
    if (id) {
      try {
        await openProject(id);
        return;
      } catch (err) {
        console.warn('No se pudo abrir el proyecto.', err);
        const record = list.find((r) => r.id === id);
        hooks.notify('openFailed', { record, error: err });
      }
    }
    await startNew();
  } catch (err) {
    // La base abrió pero no se puede leer ni escribir: sin guardado.
    console.warn('No se puede usar el almacenamiento.', err);
    session.storage = null;
    startUnsaved();
  }
}

// Sin almacenamiento: el proyecto vive en la pestaña; se avisa una vez.
function startUnsaved() {
  session.storage = null;
  session.record = { id: tab, name: untitled(), created: now(), modified: now() };
  session.savedSig = docSignature();
  setStatus('off');
  hooks.notify('unavailable');
}

async function startNew() {
  const doc = emptyDoc(currentSettings());
  replaceDocument(doc);
  const record = await createProject(session.storage, { id: newProjectId(), name: untitled(), now: now(), doc });
  adopt(record, new Set());
}

// El proyecto pasa a ser el abierto (ya guardado tal como está el documento).
function adopt(record, stored) {
  session.record = record;
  session.stored = stored;
  session.savedSig = docSignature();
  session.thumbSig = '';
  storageSet(LAST_PROJECT_STORAGE, record.id);
  setStatus('saved');
  render();
}

// Papel, margen y separación del proyecto actual (uno nuevo los conserva).
function currentSettings() {
  const { paper, landscape, margin, gap } = state;
  return { paper: typeof paper === 'string' ? paper : { ...paper }, landscape, margin, gap, rotate: true };
}

// ---------- Guardado automático ----------

function docSignature() {
  return JSON.stringify(serialize(docState(), assets));
}

/** Después de cada render: si el documento cambió, agenda el guardado. */
export function documentChanged() {
  if (!session.storage || !session.record || ['loading', 'readonly', 'off'].includes(session.status)) return;
  if (state.busy) return;
  const sig = docSignature();
  if (sig === session.savedSig) {
    if (session.status === 'pending') setStatus('saved');
    return;
  }
  if (session.status === 'error' && sig === session.failedSig) return; // espera «Reintentar» o un cambio nuevo
  if (session.status !== 'pending' && session.status !== 'saving') setStatus('pending');
  clearTimeout(timer);
  timer = setTimeout(() => save(), SAVE_DELAY);
}

/** Guarda ya lo pendiente (al ocultarse la pestaña, antes de cambiar de proyecto…). */
export function flush() {
  clearTimeout(timer);
  if (saving) return saving;
  if (!session.storage || session.status === 'readonly' || session.status === 'off') return Promise.resolve();
  if (docSignature() === session.savedSig && session.status !== 'error') return Promise.resolve();
  return save({ quick: document.visibilityState === 'hidden' });
}

/** Guarda el documento. `quick`: sin regenerar la miniatura (al irse de la pestaña). */
export function save({ quick = false } = {}) {
  clearTimeout(timer);
  if (saving) {
    // Uno a la vez: el siguiente toma lo que haya cambiado mientras tanto.
    return saving.then(() => (docSignature() !== session.savedSig ? save({ quick }) : undefined));
  }
  if (!session.storage || !session.record || session.status === 'readonly') return Promise.resolve();
  saving = (async () => {
    const record = session.record;
    try {
      const doc = serialize(docState(), assets);
      const sig = JSON.stringify(doc);
      session.failedSig = sig;
      const blobs = blobsFor(doc);
      const thumb = quick ? undefined : await thumbnail();
      setStatus('saving');
      const result = await saveProject(session.storage, { record, doc, blobs, stored: session.stored, thumb, now: now() });
      if (session.record?.id !== record.id) return; // se cambió de proyecto mientras tanto
      session.record = result.record;
      session.stored = result.stored;
      session.savedSig = sig;
      session.failedSig = '';
      setStatus(docSignature() === sig ? 'saved' : 'pending');
      if (session.status === 'pending') timer = setTimeout(() => save(), SAVE_DELAY);
      post({ type: 'changed' });
      askPersist(doc);
    } catch (err) {
      console.error('No se pudo guardar el proyecto.', err);
      if (session.record?.id !== record.id) return;
      setStatus('error', err);
      hooks.notify('saveFailed', { error: err });
    }
  })().finally(() => (saving = null));
  return saving;
}

/** Reintentar después de un error. */
export const retry = () => save();

// Binarios que todavía no están guardados (se crean recién ahora).
function blobsFor(doc) {
  const blobs = new Map();
  for (const key of fileKeys(doc)) {
    if (session.stored.has(key)) continue;
    const [kind, ref] = key.split(':');
    const asset =
      kind === 'preview' ? assets.get(ref) : [...assets.values()].find((a) => String(a.src) === ref && (kind !== 'bytes' || a.derived));
    if (asset) blobs.set(key, assetBlob(asset, kind === 'src' ? 'original' : kind));
  }
  return blobs;
}

// Pedir almacenamiento persistente (que el navegador no lo borre solo) la
// primera vez que se guarda un proyecto con piezas.
function askPersist(doc) {
  if (persistAsked || !doc.items.length || !navigator.storage?.persist) return;
  persistAsked = true;
  navigator.storage
    .persisted()
    .then((done) => done || navigator.storage.persist())
    .catch(() => {});
}

/** Miniatura de la primera hoja (Blob), o undefined si no cambió. */
async function thumbnail() {
  const [W, H] = sheetSize();
  const first = state.sheets[0];
  const items = itemsOn(first.id);
  const sig = JSON.stringify([W, H, items.map((item) => [item.asset, item.x, item.y, item.scale, item.r])]);
  if (sig === session.thumbSig) return undefined;
  const k = THUMB_WIDTH / W;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = Math.round(H * k);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const item of items) {
    const img = hooks.thumbImage?.(item);
    const asset = assets.get(item.asset);
    if (!img?.complete || !img.naturalWidth || !asset) continue;
    const w = asset.w * (item.scale / 100) * k;
    const h = asset.h * (item.scale / 100) * k;
    const turned = item.r % 180 !== 0;
    ctx.save();
    ctx.translate(item.x * k + (turned ? h : w) / 2, item.y * k + (turned ? w : h) / 2);
    ctx.rotate((item.r * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
  if (blob) session.thumbSig = sig;
  return blob ?? undefined;
}

// ---------- Abrir, crear, duplicar, renombrar, eliminar ----------

/** Lista para el diálogo (del más reciente al más viejo). */
export const list = () => (session.storage ? listProjects(session.storage) : Promise.resolve([]));

/**
 * Abre un proyecto: guarda el actual, se lo pide a otras pestañas que lo
 * tengan abierto y lo lee. Si falla, el proyecto actual queda como estaba.
 */
export async function openProject(id) {
  await flush();
  const previous = session.status;
  setStatus('loading');
  try {
    await claim(id);
    const { record, doc, files } = await loadProject(session.storage, id);
    const loaded = await restoreAssets(doc, files);
    replaceDocument(doc, loaded);
    adopt(record, new Set([...files.keys()]));
    return record;
  } catch (err) {
    setStatus(previous === 'loading' ? 'saved' : previous);
    throw err;
  }
}

/** «Nuevo proyecto»: el actual queda guardado y se abre uno en blanco. */
export async function newProject() {
  if (!session.storage) {
    replaceDocument(emptyDoc(currentSettings()));
    session.record = { id: newProjectId(), name: untitled(), created: now(), modified: now() };
    session.savedSig = docSignature();
    render();
    return session.record;
  }
  await flush();
  await startNew();
  post({ type: 'changed' });
  return session.record;
}

/** Duplica un proyecto (si es el abierto, con lo último). Devuelve el registro nuevo. */
export async function duplicate(id) {
  if (id === session.record?.id) await flush();
  const source = await session.storage.get(id);
  const name = cleanName(t('projects.copyName', { name: source?.name ?? untitled() }), untitled());
  const record = await duplicateProject(session.storage, id, { newId: newProjectId(), name, now: now() });
  post({ type: 'changed' });
  return record;
}

/** Cambia el nombre (vacío: queda el anterior). Devuelve el nombre final. */
export async function rename(id, name) {
  const current = id === session.record?.id ? session.record : await session.storage?.get(id);
  const clean = cleanName(name, current?.name ?? untitled());
  if (!session.storage) {
    session.record.name = clean;
    hooks.statusChanged?.({});
    return clean;
  }
  const record = await renameProject(session.storage, id, clean, now());
  if (id === session.record?.id) session.record = { ...session.record, name: record.name, modified: record.modified };
  hooks.statusChanged?.({});
  post({ type: 'renamed', project: id, name: record.name });
  return record.name;
}

/**
 * Elimina un proyecto (no se puede deshacer). Si es el abierto, se abre el
 * más reciente de los que quedan o uno nuevo.
 */
export async function remove(id) {
  const wasOpen = id === session.record?.id;
  if (wasOpen) clearTimeout(timer);
  await deleteProject(session.storage, id);
  post({ type: 'deleted', project: id });
  if (!wasOpen) return;
  const next = pickProject(await listProjects(session.storage), null);
  if (next) {
    try {
      await openProject(next);
      return;
    } catch (err) {
      console.warn(err);
    }
  }
  await startNew();
}

/** Espacio usado y disponible ({usage, quota} en bytes), si el navegador lo dice. */
export async function estimate() {
  try {
    return (await navigator.storage?.estimate?.()) ?? null;
  } catch {
    return null;
  }
}

/** Desde una pestaña que dejó de guardar: vuelve a pedir el proyecto y lo recarga. */
export const takeOver = () => openProject(session.record.id);

/** Guarda lo que hay en pantalla como un proyecto nuevo (p. ej. si se eliminó en otra pestaña). */
export async function saveAsNew() {
  const record = await createProject(session.storage, { id: newProjectId(), name: session.record?.name ?? untitled(), now: now() });
  session.record = record;
  session.stored = new Set();
  session.savedSig = '';
  storageSet(LAST_PROJECT_STORAGE, record.id);
  setStatus('pending');
  await save();
  post({ type: 'changed' });
}

// ---------- Varias pestañas ----------

const post = (message) => channel?.postMessage({ ...message, tab });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Pide un proyecto: las pestañas que lo tenían abierto guardan y lo sueltan.
async function claim(id) {
  if (!channel) return;
  const busy = new Set();
  let released = () => {};
  const listen = (e) => {
    const m = e.data;
    if (m?.project !== id || m.tab === tab) return;
    if (m.type === 'busy') busy.add(m.tab);
    if (m.type === 'released') {
      busy.delete(m.tab);
      if (!busy.size) released();
    }
  };
  channel.addEventListener('message', listen);
  post({ type: 'claim', project: id });
  await sleep(150);
  if (busy.size) await Promise.race([new Promise((resolve) => (released = resolve)), sleep(3000)]);
  channel.removeEventListener('message', listen);
}

async function onMessage(e) {
  const m = e.data;
  if (!m || m.tab === tab) return;
  const mine = m.project && m.project === session.record?.id;
  if (m.type === 'claim' && mine && session.status !== 'readonly' && session.status !== 'off') {
    post({ type: 'busy', project: m.project });
    try {
      await flush();
    } finally {
      clearTimeout(timer);
      setStatus('readonly');
      hooks.notify('takenOver');
      post({ type: 'released', project: m.project });
    }
  } else if (m.type === 'deleted' && mine) {
    clearTimeout(timer);
    session.stored = new Set();
    setStatus('readonly');
    hooks.notify('deletedElsewhere');
  } else if (m.type === 'renamed' && mine) {
    session.record = { ...session.record, name: m.name };
    hooks.statusChanged?.({});
  }
  if (['changed', 'renamed', 'deleted'].includes(m.type)) hooks.listChanged?.();
}
