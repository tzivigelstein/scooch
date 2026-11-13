// Projects saved in the browser (IndexedDB): the open one, autosave and
// opening, creating, duplicating, renaming and deleting.
//
// Saving: every document change compares the document's signature with the
// saved one; if it changed, it saves ~1 s after the last change, and right
// away when the tab gets hidden (visibilitychange / pagehide). Only missing
// binaries are written. Nothing leaves the browser.
//
// Several tabs (the simplest safe solution): a project has one tab that saves
// it. Opening it in another tab «asks» the tab that had it through a
// BroadcastChannel: that one saves what is pending, stops saving and says so
// («Este proyecto se abrió en otra pestaña»); only then the new one reads it
// from storage, so it never overwrites changes without knowing. From the old
// tab, «Editar aquí» asks for it again and reloads it. If a tab doesn't
// answer (frozen), it waits 3 s: it saved when it got hidden anyway.

import { JOURNAL_PREFIX, JOURNAL_STORAGE, LAST_PROJECT_STORAGE, TABS_CHANNEL } from '../config.ts';
import { DEFAULT_CUTS, ProjectError, fileKeys, nextIds, serialize } from '../core/projectdoc.js';
import {
  cleanName,
  createProject,
  deleteProject,
  duplicateProject,
  emptyDoc,
  listProjects,
  loadProject,
  newProjectId,
  pickProject,
  recoverJournal,
  renameProject,
  saveProject,
  touchProject,
  type Journal,
} from '../core/projectstore.js';
import type { ProjectDoc, ProjectRecord, ProjectStorage, StoredFile } from '../core/types.ts';
import { t } from '../copy/index.ts';
import { allAssets, findAsset, replaceAssets } from '../state/assets.ts';
import { getDocument, resetIds, setDocument, useDocument, type Piece } from '../state/document.ts';
import { resetHistory } from '../state/history.ts';
import { legacyAllowOverlap } from '../state/prefs.ts';
import { useProject, type SaveStatus } from '../state/project.ts';
import { itemsOn, sheetSize } from '../state/selectors.ts';
import { setView } from '../state/view.ts';
import { assetBlob, restoreAssets, withHashes, type AppAsset } from './assets.ts';
import { openIdbStorage } from './storage/idb.ts';
import { migrateLegacyProjects } from './storage/migrate.ts';
import { storageGet, storageJson, storageKeys, storageRemove, storageSet } from './storage/local.ts';
import { drawThumbnail, thumbnailSignature } from './thumbnail.ts';

const SAVE_DELAY = 1000;

export type ProjectNotice = 'unavailable' | 'saveFailed' | 'openFailed' | 'takenOver' | 'deletedElsewhere';

export interface ProjectHooks {
  /** The save status changed (`recovered`: it saved again after an error). */
  statusChanged?: (info: { recovered?: boolean }) => void;
  notify: (kind: ProjectNotice, data?: { error?: unknown; record?: Pick<ProjectRecord, 'id' | 'name'> | null }) => void;
  listChanged?: () => void;
  /** A piece's loaded <img>, for the thumbnail. */
  thumbImage?: (item: Piece) => HTMLImageElement | null;
  /** Another document replaced the open one (the view starts over at its first sheet). */
  documentReplaced?: () => void;
}

/** The open project. */
const session = {
  storage: null as ProjectStorage | null,
  record: null as ProjectRecord | null,
  stored: new Map<string, string>(), // key → hash of the files already saved
  savedSig: '',
  failedSig: '', // what couldn't be saved: it isn't retried on its own until something changes
  thumbSig: '',
  status: 'loading' as SaveStatus,
  error: null as unknown,
};

let hooks: ProjectHooks = { notify: () => {} };
let timer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | null = null;
let persistAsked = false;
const tab = newProjectId();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(TABS_CHANNEL) : null;

const now = () => Date.now();
const untitled = () => t('projects.untitled');

let failed = false; // there was an error and it hasn't saved since
let replacing = false; // a new document is being put in place: nothing to save yet

function publish() {
  useProject.setState({ id: session.record?.id ?? null, name: session.record?.name ?? null, status: session.status, storage: !!session.storage });
}

function setStatus(status: SaveStatus, error: unknown = null) {
  if (status === 'error') failed = true;
  const recovered = failed && status === 'saved';
  if (recovered || status === 'loading') failed = false;
  session.status = status;
  session.error = error;
  publish();
  hooks.statusChanged?.({ recovered });
}

export const projectSession = () => session;

// ---------- The document ----------

/** What gets saved of the document. */
function docState() {
  const { sheets, items, paper, landscape, margin, gap, cuts, rotate, allowOverlap } = getDocument();
  return { sheets, items, paper, landscape, margin, gap, cuts, rotate, allowOverlap };
}

const serialized = () => serialize(docState(), allAssets());
const docSignature = () => JSON.stringify(serialized());

/**
 * Replaces the whole document when opening or creating a project: releases
 * every previous asset, starts a new history and continues ids after the
 * document's own. `loaded`: key → asset (restoreAssets).
 */
function replaceDocument(doc: ProjectDoc, loaded: ReadonlyMap<string, AppAsset> = new Map()) {
  const ids = nextIds(doc);
  replaceAssets(loaded, ids.asset);
  setDocument({
    sheets: doc.sheets.map((sheet) => ({ ...sheet })),
    items: doc.items.map((item) => ({ ...item })),
    paper: typeof doc.paper === 'string' ? doc.paper : { ...doc.paper },
    landscape: doc.landscape,
    margin: doc.margin,
    gap: doc.gap,
    cuts: { ...(doc.cuts ?? DEFAULT_CUTS) },
    rotate: doc.rotate,
    allowOverlap: doc.allowOverlap,
    selection: [],
  });
  setView({ pinned: false, sheet: doc.sheets[0].id, flash: null });
  resetHistory();
  resetIds(ids);
  hooks.documentReplaced?.();
}

// ---------- Start ----------

/**
 * Opens the storage and restores the last project (or creates an «Sin
 * título» one). Notices from opening come out once the document is in place.
 */
export async function initProjects(h: ProjectHooks) {
  hooks = h;
  channel?.addEventListener('message', onMessage);
  useDocument.subscribe(documentChanged);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    writeJournal();
    void flush({ quick: true });
  });
  // When leaving (also on reload, with the tab still visible) it saves without
  // waiting for the thumbnail: the transaction has to start in this very event.
  window.addEventListener('pagehide', () => {
    writeJournal();
    void flush({ quick: true });
  });
  let idb: Awaited<ReturnType<typeof openIdbStorage>>;
  try {
    idb = await openIdbStorage();
    session.storage = idb;
  } catch (err) {
    console.warn('This browser cannot save projects.', err);
    return startUnsaved();
  }
  // The projects saved before the app was renamed (once; a failure keeps them for the next start).
  await migrateLegacyProjects(session.storage).catch((err: unknown) => console.warn('The projects saved under the former name could not be moved.', err));
  const later: Parameters<ProjectHooks['notify']>[] = [];
  const notify = hooks.notify;
  hooks.notify = (...args) => later.push(args);
  try {
    await restoreLast();
  } finally {
    hooks.notify = notify;
    for (const args of later) notify(...args);
  }
  // Once open: the rest of the files saved before binaries were shared become
  // shared (the open project's already did, see storage/idb.ts), then what
  // nothing references goes.
  void Promise.resolve(idb.convertAll?.())
    .then(() => idb.collectGarbage())
    .catch((err: unknown) => console.warn('The saved files could not be tidied.', err));
}

async function restoreLast() {
  const storage = session.storage!;
  try {
    const list = await listProjects(storage);
    forgetJournalsOtherThan(list);
    const lastId = storageGet(LAST_PROJECT_STORAGE);
    // The last one opened can't be opened: nothing breaks; it says so (and, if
    // it is damaged, offers to delete it; one saved by a newer version is left alone).
    const broken = list.find((record) => record.id === lastId && (record.damaged || record.newer));
    if (broken) hooks.notify('openFailed', { record: broken, error: Object.assign(new Error('unreadable'), { code: broken.newer ? 'newer' : 'corrupt' }) });
    const id = pickProject(list, lastId);
    // Another project opening in its place (the last one can't open here, or
    // isn't there yet: a newer version, a move from the former name that
    // failed) doesn't become the last opened: a later start tries it again.
    const remember = !lastId || id === lastId;
    if (id) {
      try {
        await openProject(id, { remember });
        return;
      } catch (err) {
        console.warn('The project could not be opened.', err);
        const record = list.find((r) => r.id === id);
        hooks.notify('openFailed', { record, error: err });
      }
    }
    await startNew({ remember: !lastId });
  } catch (err) {
    // The database opened but can't be read or written: no saving.
    console.warn('The storage cannot be used.', err);
    session.storage = null;
    startUnsaved();
  }
}

// Without storage: the project lives in the tab; it says so once.
function startUnsaved() {
  session.storage = null;
  session.record = placeholderRecord(tab);
  session.savedSig = docSignature();
  setStatus('off');
  hooks.notify('unavailable');
}

const placeholderRecord = (id: string): ProjectRecord => ({
  id,
  name: untitled(),
  created: now(),
  modified: now(),
  version: 0,
  doc: emptyDoc(),
  counts: { sheets: 1, pieces: 0 },
  thumb: null,
});

async function startNew({ remember = true } = {}) {
  const doc = emptyDoc(currentSettings());
  replacing = true;
  try {
    replaceDocument(doc);
    const record = await createProject(session.storage!, { id: newProjectId(), name: untitled(), now: now(), doc });
    adopt(record, new Map(), { remember });
  } finally {
    replacing = false;
  }
}

// The project becomes the open one (saved just as the document is) and, with
// `remember`, the one to open on the next start.
function adopt(record: ProjectRecord, stored: Map<string, string>, { remember = true } = {}) {
  session.record = record;
  session.stored = stored;
  session.savedSig = docSignature();
  session.thumbSig = '';
  if (remember) storageSet(LAST_PROJECT_STORAGE, record.id);
  setStatus('saved');
}

// The current project's settings (paper, margin, gap, «Girar si conviene»,
// «Permitir superposición», cut lines): a new one keeps them.
function currentSettings() {
  const { paper, landscape, margin, gap, rotate, allowOverlap, cuts } = getDocument();
  return { paper: typeof paper === 'string' ? paper : { ...paper }, landscape, margin, gap, rotate, allowOverlap, cuts: { ...cuts } };
}

/** What documents saved before a setting was the project's take (projectdoc.migrate). */
const migrationContext = () => ({ allowOverlap: legacyAllowOverlap() });

// ---------- Autosave ----------

/** After each document change: if it changed since the last save, schedules saving. */
function documentChanged() {
  if (replacing || !session.storage || !session.record || ['loading', 'readonly', 'off'].includes(session.status)) return;
  if (getDocument().busy) return;
  const doc = serialized();
  const sig = JSON.stringify(doc);
  if (sig === session.savedSig) {
    clearTimeout(timer); // back to what is saved: nothing left to write
    if (session.status === 'pending') setStatus('saved');
    return;
  }
  if (session.status === 'error' && sig === session.failedSig) return; // waits for «Reintentar» or a new change
  if (session.status !== 'pending' && session.status !== 'saving') setStatus('pending');
  clearTimeout(timer);
  // New files (just added) save right away, they are the costliest to lose; the
  // rest, ~1 s after the last change.
  const newFiles = fileKeys(doc).some((key) => !session.stored.has(key));
  timer = setTimeout(() => void save(), newFiles ? 0 : SAVE_DELAY);
}

/**
 * Saves what is pending now (when the tab gets hidden, before switching
 * project…). `quick`: without redrawing the thumbnail.
 */
export function flush({ quick = false } = {}): Promise<void> {
  clearTimeout(timer);
  if (saving) return saving;
  if (!session.storage || session.status === 'readonly' || session.status === 'off') return Promise.resolve();
  if (docSignature() === session.savedSig && session.status !== 'error') return Promise.resolve();
  return save({ quick });
}

/** Saves the document. `quick`: without redrawing the thumbnail (when leaving the tab). */
export function save({ quick = false } = {}): Promise<void> {
  clearTimeout(timer);
  if (saving) {
    // One at a time: the next one takes whatever changed meanwhile.
    return saving.then(() => (docSignature() !== session.savedSig ? save({ quick }) : undefined));
  }
  if (!session.storage || !session.record || session.status === 'readonly') return Promise.resolve();
  const storage = session.storage;
  saving = (async () => {
    const id = session.record!.id;
    try {
      const doc = serialized();
      const sig = JSON.stringify(doc);
      session.failedSig = sig;
      const files = filesFor(doc) ?? (await hashMissing(doc), filesFor(doc)!);
      setStatus('saving');
      // The document first, in a transaction that starts now (if the tab closes
      // right now, what matters is kept); the thumbnail goes after.
      const result = await saveProject(storage, { record: session.record!, doc, files, stored: session.stored, now: now() });
      if (session.record?.id !== id) return; // the project changed meanwhile
      if ([...session.stored.keys()].some((key) => !result.stored.has(key))) scheduleGarbage();
      session.stored = result.stored;
      const thumb = quick ? undefined : await thumbnail();
      if (thumb && session.record?.id === id) {
        const withThumb = { ...result.record, name: session.record.name, thumb };
        await storage.write(withThumb);
        result.record = withThumb;
      }
      if (session.record?.id !== id) return;
      // If the name changed while writing, the next save takes it.
      session.record = { ...result.record, name: session.record.name };
      session.savedSig = sig;
      session.failedSig = '';
      setStatus(docSignature() === sig ? 'saved' : 'pending');
      if (session.status === 'pending') timer = setTimeout(() => void save(), SAVE_DELAY);
      else clearJournal(id);
      post({ type: 'changed' });
      askPersist(doc);
    } catch (err) {
      if (session.record?.id !== id) return;
      if (err instanceof ProjectError && err.code === 'missing') return deletedElsewhere();
      console.error('The project could not be saved.', err);
      setStatus('error', err);
      hooks.notify('saveFailed', { error: err });
    }
  })().finally(() => (saving = null));
  return saving;
}

// Last-moment journal (see recoverJournal): the unsaved document is written
// synchronously, because IndexedDB may not finish when the page goes away.
// `base`: the stored record this tab last read or wrote.
function writeJournal() {
  if (!session.storage || !session.record || ['loading', 'readonly', 'off'].includes(session.status)) return;
  const doc = serialized();
  if (JSON.stringify(doc) === session.savedSig) return;
  const { id, modified, name } = session.record;
  storageSet(JOURNAL_PREFIX + id, JSON.stringify({ v: 2, id, base: modified, name, doc } satisfies Journal));
}

/** A project's journal: its own key, or the one every tab shared before. */
function readJournal(id: string) {
  const own = storageJson(JOURNAL_PREFIX + id) as Journal | null;
  if (own?.id === id) return own;
  const shared = storageJson(JOURNAL_STORAGE) as Journal | null;
  return shared?.id === id ? shared : null;
}

// Everything is saved: that project's journal is not needed.
function clearJournal(id: string) {
  storageRemove(JOURNAL_PREFIX + id);
  if ((storageJson(JOURNAL_STORAGE) as Journal | null)?.id === id) storageRemove(JOURNAL_STORAGE);
}

// Journals of projects that aren't there any more (deleted in a tab that closed meanwhile).
function forgetJournalsOtherThan(list: readonly Pick<ProjectRecord, 'id'>[]) {
  const ids = new Set(list.map((record) => record.id));
  for (const key of storageKeys(JOURNAL_PREFIX)) if (!ids.has(key.slice(JOURNAL_PREFIX.length))) storageRemove(key);
}

/** Retry after an error. */
export const retry = () => save();

// The files of the document that aren't saved yet (created only now), with
// their hashes; null when an asset doesn't know its hashes yet (hashMissing).
function filesFor(doc: ProjectDoc) {
  const files = new Map<string, StoredFile>();
  for (const key of fileKeys(doc)) {
    if (session.stored.has(key)) continue;
    const found = assetOfFile(key);
    if (!found) continue;
    const hash = found.asset.hashes?.[found.kind === 'original' ? 'src' : found.kind];
    if (!hash) return null;
    files.set(key, { blob: assetBlob(found.asset, found.kind), hash });
  }
  return files;
}

// The asset a file key belongs to, and which of its binaries it is.
function assetOfFile(key: string) {
  const [kind, ref] = key.split(':');
  const asset =
    kind === 'preview' ? findAsset(ref) : [...allAssets().values()].find((a) => String(a.src) === ref && (kind !== 'bytes' || (a.kind === 'image' && a.derived)));
  return asset ? { asset, kind: kind === 'src' ? ('original' as const) : (kind as 'bytes' | 'preview') } : null;
}

// Hashes the binaries of the document's assets that don't have them yet.
async function hashMissing(doc: ProjectDoc) {
  const assets = new Set(fileKeys(doc).map((key) => assetOfFile(key)?.asset).filter((asset) => !!asset && !asset.hashes));
  await Promise.all([...assets].map((asset) => withHashes(asset!)));
}

// Asks for persistent storage (so the browser doesn't clear it on its own) the
// first time a project with pieces is saved.
function askPersist(doc: ProjectDoc) {
  if (persistAsked || !doc.items.length || !navigator.storage?.persist) return;
  persistAsked = true;
  navigator.storage
    .persisted()
    .then((done) => done || navigator.storage.persist())
    .catch(() => {});
}

/** The thumbnail of the first sheet (Blob), or undefined if it didn't change. */
async function thumbnail() {
  const [W, H] = sheetSize();
  const items = itemsOn(getDocument().sheets[0].id);
  const sig = thumbnailSignature(W, H, items);
  if (sig === session.thumbSig) return undefined;
  const blob = await drawThumbnail(W, H, items, findAsset, (item) => hooks.thumbImage?.(item) ?? null);
  if (blob) session.thumbSig = sig;
  return blob ?? undefined;
}

// ---------- Open, create, duplicate, rename, delete ----------

/** The list for the dialog (the last opened first). */
export const list = () => (session.storage ? listProjects(session.storage) : Promise.resolve([]));

/**
 * Opens a project: saves the current one, asks other tabs that have it open
 * and reads it. If it fails, the current project stays as it was.
 */
export async function openProject(id: string, { remember = true } = {}) {
  await flush();
  const previous = session.status;
  setStatus('loading');
  try {
    await claim(id);
    const stored = await loadProject(session.storage!, id, migrationContext());
    const { doc, files } = stored;
    // Opened now: first in «Proyectos» (only that changes: it isn't saved as a change).
    const record = (await touchProject(session.storage!, id, now())) ?? stored.record;
    // What was journaled when the tab closed, if newer than what was saved.
    const recovered = recoverJournal(record, files, readJournal(id), migrationContext());
    const use = recovered?.doc ?? doc;
    const loaded = await restoreAssets(use, files);
    replaceDocument(use, loaded);
    adopt(recovered ? { ...record, name: recovered.name } : record, new Map([...files].map(([key, file]) => [key, file.hash])), { remember });
    if (recovered) {
      // It differs from what was saved: autosave writes it.
      session.savedSig = JSON.stringify(doc);
      documentChanged();
    } else clearJournal(id);
    return record;
  } catch (err) {
    setStatus(previous === 'loading' ? 'saved' : previous);
    throw err;
  }
}

/** «Nuevo proyecto»: the current one stays saved and a blank one opens. */
export async function newProject() {
  if (!session.storage) {
    replaceDocument(emptyDoc(currentSettings()));
    session.record = placeholderRecord(newProjectId());
    session.savedSig = docSignature();
    publish();
    return session.record;
  }
  await flush();
  // The new document shows right away; until it is stored, the status says so.
  const previous = session.status;
  setStatus('loading');
  try {
    await startNew();
  } catch (err) {
    setStatus(previous);
    throw err;
  }
  post({ type: 'changed' });
  return session.record!;
}

/** Duplicates a project (the open one with its latest changes). Returns the new record. */
export async function duplicate(id: string) {
  if (id === session.record?.id) await flush();
  const storage = session.storage!;
  const source = await storage.get(id);
  const name = cleanName(t('projects.copyName', { name: source?.name ?? untitled() }), untitled());
  const record = await duplicateProject(storage, id, { newId: newProjectId(), name, now: now() });
  post({ type: 'changed' });
  return record;
}

/**
 * Renames (empty: keeps the previous name). Returns the final name. The open
 * project, when this tab saves it, goes through the same queue as autosave, so
 * a save in progress doesn't overwrite it. Any other project (also the open
 * one when another tab saves it) gets only its name written, in one
 * operation; the tab that has it open takes the name (see onMessage).
 */
export async function rename(id: string, name: string) {
  const open = id === session.record?.id;
  const current = open ? session.record : await session.storage?.get(id);
  const clean = cleanName(name, current?.name ?? untitled());
  if (open) {
    session.record = { ...session.record!, name: clean };
    publish();
    hooks.statusChanged?.({});
  }
  if (open && session.status !== 'readonly') {
    if (session.storage) await save();
  } else if (session.storage) {
    await renameProject(session.storage, id, clean);
  }
  post({ type: 'renamed', project: id, name: clean });
  return clean;
}

/**
 * Deletes a project (can't be undone). If it is the open one, the newest of
 * the rest opens, or a new one.
 */
export async function remove(id: string) {
  const wasOpen = id === session.record?.id;
  if (wasOpen) clearTimeout(timer);
  const storage = session.storage!;
  await deleteProject(storage, id);
  clearJournal(id);
  scheduleGarbage();
  post({ type: 'deleted', project: id });
  if (!wasOpen) return;
  const next = pickProject(await listProjects(storage), null);
  if (next) {
    try {
      await openProject(next);
      return;
    } catch (err) {
      console.warn(err);
    }
  }
  setStatus('loading');
  await startNew();
}

/** Used and available space ({usage, quota} in bytes), if the browser says. */
export async function estimate() {
  try {
    return (await navigator.storage?.estimate?.()) ?? null;
  } catch {
    return null;
  }
}

/** From a tab that stopped saving: asks for the project again and reloads it. */
export const takeOver = () => openProject(session.record!.id);

/** Saves what is on screen as a new project (e.g. it was deleted in another tab). */
export async function saveAsNew() {
  const record = await createProject(session.storage!, { id: newProjectId(), name: session.record?.name ?? untitled(), now: now() });
  session.record = record;
  session.stored = new Map();
  session.savedSig = '';
  storageSet(LAST_PROJECT_STORAGE, record.id);
  setStatus('pending');
  await save();
  post({ type: 'changed' });
}

// The open project was deleted in another tab: this one stops saving it (and
// can save what it shows as a new project).
function deletedElsewhere() {
  clearTimeout(timer);
  session.stored = new Map();
  setStatus('readonly');
  hooks.notify('deletedElsewhere');
}

// ---------- Unused binaries ----------

const GARBAGE_DELAY = 3000;
let garbageTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Something stopped referencing binaries (a save, a deleted project): a few
 * seconds later, the ones nothing references any more are deleted (see
 * storage/idb.ts: it can't delete one in use, whatever other tabs do).
 */
function scheduleGarbage() {
  clearTimeout(garbageTimer);
  garbageTimer = setTimeout(() => void session.storage?.collectGarbage().catch((err: unknown) => console.warn('Unused files could not be deleted.', err)), GARBAGE_DELAY);
}

// ---------- Several tabs ----------

interface TabMessage {
  type: 'claim' | 'busy' | 'released' | 'changed' | 'renamed' | 'deleted';
  tab: string;
  project?: string;
  name?: string;
}

const post = (message: Omit<TabMessage, 'tab'>) => channel?.postMessage({ ...message, tab });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Asks for a project: the tabs that had it open save and let it go.
async function claim(id: string) {
  if (!channel) return;
  const busy = new Set<string>();
  let released = () => {};
  const listen = (e: MessageEvent<TabMessage>) => {
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
  if (busy.size) await Promise.race([new Promise<void>((resolve) => (released = resolve)), sleep(3000)]);
  channel.removeEventListener('message', listen);
}

async function onMessage(e: MessageEvent<TabMessage>) {
  const m = e.data;
  if (!m || m.tab === tab) return;
  const mine = !!m.project && m.project === session.record?.id;
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
    deletedElsewhere();
  } else if (m.type === 'renamed' && mine) {
    const name = m.name ?? session.record!.name;
    session.record = { ...session.record!, name };
    publish();
    hooks.statusChanged?.({});
    // Renamed in a tab that doesn't save it: written already, but a save of
    // this tab in progress may write the old name over it; once it is done,
    // the name is written again (only the name).
    if (saving && session.storage && session.status !== 'readonly' && session.status !== 'off') {
      const storage = session.storage;
      const id = session.record!.id;
      void saving.then(() => (session.record?.id === id && session.record.name === name ? renameProject(storage, id, name) : null)).catch(() => {});
    }
  }
  if (['changed', 'renamed', 'deleted'].includes(m.type)) hooks.listChanged?.();
}
