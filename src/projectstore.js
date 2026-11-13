// Proyectos guardados: la lógica (crear, guardar, abrir, duplicar, renombrar,
// eliminar, listar) sobre una interfaz chica de almacenamiento, para poder
// probarla en Node con memoryStorage(). En el navegador el almacenamiento es
// IndexedDB (idbstorage.js). Sin DOM ni textos de interfaz.
//
// Interfaz de almacenamiento:
//   list(): Promise<registro[]>
//   get(id): Promise<registro | null>
//   files(id): Promise<Map<clave, Blob>>
//   write(registro, {put: Map<clave, Blob>, remove: clave[]}): Promise<void>
//       guarda el registro y sus archivos en una sola operación (todo o nada)
//   remove(id): Promise<void>    el registro y todos sus archivos
//
// Registro: {id, name, created, modified, version, doc, counts, thumb}
//   doc: el documento de projectdoc.js; counts: {sheets, pieces}; thumb: Blob
//   (miniatura de la primera hoja) o null. Los archivos van por proyecto con
//   las claves de projectdoc.fileKeys().

import { DOC_VERSION, ProjectError, deserialize, fileKeys, counts } from './projectdoc.js';

/** Largo máximo del nombre de un proyecto. */
export const NAME_MAX = 80;

/** Id nuevo de proyecto («p» + tiempo + azar), único en la práctica. */
export const newProjectId = (now = Date.now(), random = Math.random) =>
  `p${now.toString(36)}${Math.floor(random() * 36 ** 6)
    .toString(36)
    .padStart(6, '0')}`;

/** Nombre limpio: sin espacios de más y a lo sumo NAME_MAX caracteres; vacío → `fallback`. */
export function cleanName(name, fallback) {
  const clean = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return clean || fallback;
}

/** Documento de un proyecto nuevo: una hoja vacía con los ajustes dados. */
export function emptyDoc({ paper = 'A4', landscape = false, margin = 10, gap = 5, rotate = true } = {}) {
  return { version: DOC_VERSION, paper, landscape, margin, gap, rotate, sheets: [{ id: 1 }], items: [], assets: {} };
}

/** Crea y guarda un proyecto (por omisión, vacío). Devuelve el registro. */
export async function createProject(storage, { id, name, now, doc = emptyDoc(), thumb = null }) {
  const record = { id, name, created: now, modified: now, version: doc.version, doc, counts: counts(doc), thumb };
  await storage.write(record, { put: new Map(), remove: [] });
  return record;
}

/**
 * Guarda el documento de un proyecto. `blobs`: Map clave → Blob con los
 * binarios disponibles en memoria; `stored`: las claves que ya están guardadas
 * (no se vuelven a escribir). Escribe solo lo que falta y borra lo que ya no
 * se usa, junto con el registro. `thumb`: miniatura nueva (undefined: se deja
 * la que había). Devuelve {record, stored} (las claves guardadas ahora).
 */
export async function saveProject(storage, { record, doc, blobs, stored = new Set(), thumb, now }) {
  const needed = fileKeys(doc);
  const put = new Map();
  for (const key of needed) {
    if (stored.has(key)) continue;
    const blob = blobs.get(key);
    if (!blob) throw new ProjectError('corrupt', `falta el archivo ${key}`);
    put.set(key, blob);
  }
  const remove = [...stored].filter((key) => !needed.includes(key));
  const next = {
    ...record,
    modified: now,
    version: doc.version,
    doc,
    counts: counts(doc),
    thumb: thumb === undefined ? (record.thumb ?? null) : thumb,
  };
  await storage.write(next, { put, remove });
  return { record: next, stored: new Set(needed) };
}

/**
 * Abre un proyecto: {record, doc, files}. Lanza ProjectError 'missing' si no
 * existe, 'newer' si es de una versión futura y 'corrupt' si el documento no
 * vale o le faltan archivos.
 */
export async function loadProject(storage, id) {
  const record = await storage.get(id);
  if (!record) throw new ProjectError('missing', id);
  const doc = deserialize(record.doc);
  const files = await storage.files(id);
  const missing = fileKeys(doc).filter((key) => !(files.get(key) instanceof Blob));
  if (missing.length) throw new ProjectError('corrupt', `faltan archivos: ${missing.join(', ')}`);
  return { record, doc, files };
}

/** Copia un proyecto con sus archivos. Devuelve el registro nuevo. */
export async function duplicateProject(storage, id, { newId, name, now }) {
  const record = await storage.get(id);
  if (!record) throw new ProjectError('missing', id);
  const files = await storage.files(id);
  const copy = { ...record, id: newId, name, created: now, modified: now };
  await storage.write(copy, { put: files, remove: [] });
  return copy;
}

/** Cambia el nombre (ya limpio) y la fecha de modificación. Devuelve el registro. */
export async function renameProject(storage, id, name, now) {
  const record = await storage.get(id);
  if (!record) throw new ProjectError('missing', id);
  const next = { ...record, name, modified: now };
  await storage.write(next, { put: new Map(), remove: [] });
  return next;
}

/** Elimina el proyecto y sus archivos (no se puede deshacer). */
export const deleteProject = (storage, id) => storage.remove(id);

/** ¿El documento del registro se puede abrir? (sin mirar los archivos) */
export function isDamaged(record) {
  try {
    deserialize(record.doc);
    return false;
  } catch {
    return true;
  }
}

/** Todos los proyectos, del más reciente al más viejo, con `damaged`. */
export async function listProjects(storage) {
  const records = await storage.list();
  return records
    .map((record) => ({ ...record, damaged: isDamaged(record) }))
    .sort((a, b) => (b.modified ?? 0) - (a.modified ?? 0));
}

/** Qué proyecto abrir al empezar: el último abierto si existe, si no el más reciente (o null). */
export function pickProject(list, lastId) {
  const usable = list.filter((record) => !record.damaged);
  return (usable.find((record) => record.id === lastId) ?? usable[0])?.id ?? null;
}

/**
 * Diario de último momento: al cerrarse o recargarse la pestaña, IndexedDB no
 * garantiza terminar de escribir (la conexión se cierra con la página), así que
 * el documento también se anota de forma síncrona (localStorage). Al abrir el
 * proyecto, si el diario es de ese proyecto y más nuevo que lo guardado, se usa
 * el diario. Las piezas cuyos archivos todavía no llegaron a guardarse (las
 * agregadas en el último segundo) se descartan, junto con sus assets.
 *
 * `journal`: {id, at, name, doc} (doc sin validar). Devuelve {doc, name} o
 * null si no corresponde o no sirve.
 */
export function recoverJournal(record, files, journal) {
  if (!journal || journal.id !== record.id || !(journal.at > (record.modified ?? 0))) return null;
  let doc;
  try {
    doc = deserialize(journal.doc);
  } catch {
    return null;
  }
  const has = (key) => files.get(key) instanceof Blob;
  const usable = new Set(
    Object.entries(doc.assets)
      .filter(([key, a]) => has(`src:${a.src}`) && has(`preview:${key}`) && (!(a.kind === 'image' && a.derived) || has(`bytes:${a.src}`)))
      .map(([key]) => key)
  );
  const items = doc.items.filter((item) => usable.has(item.asset));
  const assets = Object.fromEntries(Object.entries(doc.assets).filter(([key]) => items.some((item) => item.asset === key)));
  return { doc: { ...doc, items, assets }, name: typeof journal.name === 'string' ? journal.name : record.name };
}

/**
 * Almacenamiento en memoria con la misma interfaz (para pruebas). `fail(op)`
 * puede devolver un error para simular fallas (p. ej. cuota excedida).
 */
export function memoryStorage({ fail = () => null } = {}) {
  const records = new Map();
  const files = new Map(); // id → Map clave → Blob
  const check = (op) => {
    const error = fail(op);
    if (error) throw error;
  };
  return {
    async list() {
      check('list');
      return [...records.values()].map((record) => structuredClone(record));
    },
    async get(id) {
      check('get');
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async files(id) {
      check('files');
      return new Map(files.get(id) ?? []);
    },
    async write(record, { put = new Map(), remove = [] } = {}) {
      check('write');
      const next = new Map(files.get(record.id) ?? []);
      for (const [key, blob] of put) next.set(key, blob);
      for (const key of remove) next.delete(key);
      records.set(record.id, structuredClone(record));
      files.set(record.id, next);
    },
    async remove(id) {
      check('remove');
      records.delete(id);
      files.delete(id);
    },
  };
}
