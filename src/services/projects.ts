// Projects saved in the browser (IndexedDB): the open one, autosave and
// opening, creating, duplicating, renaming and deleting.
//
// Saving: every document change compares the document's signature with the
// saved one; if it changed, it saves ~1 s after the last change, and right
// away when the tab gets hidden (visibilitychange / pagehide). Only missing
// binaries are written. Nothing leaves the browser.
//
// Several tabs: a project has one tab that saves it (see «Several tabs»
// below). Opening it in another tab asks the tab that had it: that one saves
// what is pending, stops saving and says so («Este proyecto se abrió en otra
// pestaña»); only then the new one reads it from storage, so it never
// overwrites changes without knowing. From the old tab, «Editar aquí» asks
// for it again and reloads it.

import { JOURNAL_PREFIX, JOURNAL_STORAGE, LAST_PROJECT_STORAGE, TABS_CHANNEL } from '../config.ts';
import { DEFAULT_CUTS, ProjectError, assetMeta, fileKeys, nextIds, serialize } from '../core/projectdoc.js';
import { nextIdsOf, parseClip, parseHistory, serializeClip, serializeHistory } from '../core/undostore.js';
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
import type { Crop, ProjectDoc, ProjectRecord, ProjectStorage, Rotation, StoredFile, StoredHistory } from '../core/types.ts';
import { t } from '../copy/index.ts';
import { adoptAssets, allAssets, assetGeneration, findAsset, getAsset, replaceAssets } from '../state/assets.ts';
import { getDocument, resetIds, setDocument, useDocument, type Piece } from '../state/document.ts';
import { historyStacks, installHistory, resetHistory } from '../state/history.ts';
import { legacyAllowOverlap } from '../state/prefs.ts';
import { useProject, type SaveStatus } from '../state/project.ts';
import { itemsOn, sheetSize } from '../state/selectors.ts';
import { setView } from '../state/view.ts';
import { assetBlob, reserveSources, restoreAssets, withHashes, type AppAsset } from './assets.ts';
import { openIdbStorage } from './storage/idb.ts';
import { migrateLegacyProjects } from './storage/migrate.ts';
import { storageGet, storageJson, storageKeys, storageRemove, storageSet } from './storage/local.ts';
import { drawThumbnail, thumbnailSignature } from './thumbnail.ts';

const SAVE_DELAY = 1000;

export type ProjectNotice = 'unavailable' | 'saveFailed' | 'openFailed' | 'takenOver' | 'deletedElsewhere';

/** Settings a project created on start takes instead of the current ones (a deep link, see initProjects). */
export type StartSettings = Partial<Pick<ProjectDoc, 'paper' | 'landscape' | 'margin' | 'gap' | 'rotate' | 'cuts'>>;

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
  // The undo history saved with the project: what its stored record references,
  // and whether the saved steps were put back (until then saves leave it as it is).
  historyHashes: new Set<string>(),
  historyReady: true,
  savedSig: '',
  savedName: '', // the name the stored record has (renaming changes the record's first)
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
  guardUnsaved();
  hooks.statusChanged?.({ recovered });
}

// ---------- Leaving with work that isn't saved ----------

/** The browser asks before closing or reloading the tab, in its own words. */
function askBeforeLeaving(e: BeforeUnloadEvent) {
  e.preventDefault();
  // Chrome before 119 asks only with this.
  e.returnValue = true;
}

let asking = false;

/**
 * Closing or reloading the tab asks first only while the project can't be
 * saved («Sin guardar», «No se guardó») and has pieces to lose: never when
 * it is saved, nor for a save waiting its second (it is written on leaving,
 * and the journal keeps the rest). The listener is there only meanwhile: one
 * keeps browsers from keeping the page to come back to.
 */
function guardUnsaved() {
  const unsaved = (session.status === 'error' || session.status === 'off') && getDocument().items.length > 0;
  if (unsaved === asking) return;
  asking = unsaved;
  if (unsaved) window.addEventListener('beforeunload', askBeforeLeaving);
  else window.removeEventListener('beforeunload', askBeforeLeaving);
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

/** JSON with each object's keys in order: the same for equal documents, whatever order their fields were made in. */
const canonical = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

/**
 * Replaces the whole document when opening or creating a project: releases
 * every previous asset, starts a new history and continues ids after the
 * document's own. `loaded`: key → asset (restoreAssets).
 */
function replaceDocument(doc: ProjectDoc, loaded: ReadonlyMap<string, AppAsset> = new Map(), history: SavedHistory | null = null) {
  // New ids continue after the document's and its saved undo steps' (put back later).
  const own = nextIds(doc);
  const saved = history ? nextIdsOf(history) : own;
  const ids = { item: Math.max(own.item, saved.item), sheet: Math.max(own.sheet, saved.sheet), asset: Math.max(own.asset, saved.asset), src: Math.max(own.src, saved.src) };
  replaceAssets(loaded, ids.asset);
  reserveSources(ids.src);
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
 * With `start` (a deep link), it creates a new project with those settings
 * instead, and no saved project is opened or changed.
 */
export async function initProjects(h: ProjectHooks, { start = null }: { start?: StartSettings | null } = {}) {
  hooks = h;
  channel?.addEventListener('message', onMessage);
  useDocument.subscribe(documentChanged);
  useDocument.subscribe(guardUnsaved);
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
    return startUnsaved(start);
  }
  // The projects saved before the app was renamed (once; a failure keeps them for the next start).
  await migrateLegacyProjects(session.storage).catch((err: unknown) => console.warn('The projects saved under the former name could not be moved.', err));
  const later: Parameters<ProjectHooks['notify']>[] = [];
  const notify = hooks.notify;
  hooks.notify = (...args) => later.push(args);
  try {
    await restoreLast(start);
  } finally {
    hooks.notify = notify;
    for (const args of later) notify(...args);
  }
  // Once open: what earlier layouts stored is converted (the open project's
  // files were shared already, see storage/idb.ts), then what nothing
  // references goes (a row that couldn't be converted doesn't stop that).
  void Promise.resolve(idb.convertAll?.())
    .catch((err: unknown) => console.warn('The saved files could not all be converted.', err))
    .then(() => idb.collectGarbage())
    .catch((err: unknown) => console.warn('Unused files could not be deleted.', err));
}

async function restoreLast(start: StartSettings | null) {
  const storage = session.storage!;
  try {
    const list = await listProjects(storage);
    forgetJournalsOtherThan(list);
    // Not even the last project opens (another tab may have it): its journal
    // stays for when it does.
    if (start) return await startNew({ settings: start });
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
    startUnsaved(start);
  }
}

// Without storage: the project lives in the tab; it says so once.
function startUnsaved(start: StartSettings | null = null) {
  if (start) replaceDocument(emptyDoc({ ...currentSettings(), ...start }));
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

async function startNew({ remember = true, settings = {} as StartSettings } = {}) {
  const doc = emptyDoc({ ...currentSettings(), ...settings });
  replacing = true;
  try {
    replaceDocument(doc);
    const id = newProjectId();
    // Written at once, while its lock is being taken (no other tab can know a
    // new id): the tab may be closing (see storage/idb.ts).
    const created = createProject(session.storage!, { id, name: untitled(), now: now(), doc });
    created.catch(() => {}); // (its error comes out below)
    await claimNew(id);
    const record = await created;
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
  session.historyHashes = new Set();
  session.historyReady = true;
  session.savedSig = docSignature();
  session.savedName = record.name;
  session.thumbSig = '';
  if (remember) storageSet(LAST_PROJECT_STORAGE, record.id);
  setStatus('saved');
}

// The current project's settings (paper, margin, gap, «Rotación automática»,
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
      const steps = session.historyReady ? (historyFor(id) ?? (await hashHistoryAssets(), historyFor(id)!)) : null;
      setStatus('saving');
      // The document (and the undo steps) first, in a transaction that starts
      // now (if the tab closes right now, what matters is kept); the thumbnail goes after.
      const result = await saveProject(storage, { record: session.record!, doc, files, stored: session.stored, history: steps?.history, blobs: steps?.blobs, now: now() });
      if (session.record?.id !== id) return; // the project changed meanwhile
      const dropped = [...session.stored.keys()].some((key) => !result.stored.has(key)) || (steps && [...session.historyHashes].some((hash) => !steps.history?.hashes.includes(hash)));
      if (dropped) scheduleGarbage();
      session.stored = result.stored;
      if (steps) session.historyHashes = new Set(steps.history?.hashes ?? []);
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
      session.savedName = result.record.name;
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
// synchronously, because IndexedDB may not finish when the page goes away;
// so is a name not saved yet (a rename right before closing).
// `base`: the stored record this tab last read or wrote.
function writeJournal() {
  if (!session.storage || !session.record || ['loading', 'readonly', 'off'].includes(session.status)) return;
  const doc = serialized();
  const { id, modified, name } = session.record;
  if (JSON.stringify(doc) === session.savedSig && name === session.savedName) return;
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

// ---------- The saved undo history ----------

type SavedHistory = NonNullable<ReturnType<typeof parseHistory>>;

/**
 * The undo steps to save with the project ({history, blobs}: the stored
 * record, null without steps, and the binaries it needs that may not be
 * stored yet), or null when an asset doesn't know its hashes yet.
 */
function historyFor(id: string) {
  const hashOf = (key: string) => {
    const found = assetOfFile(key);
    return found?.asset.hashes?.[found.kind === 'original' ? 'src' : found.kind];
  };
  let history: StoredHistory | null;
  try {
    history = serializeHistory(id, historyStacks(), (key) => assetMeta(getAsset(key)), hashOf);
  } catch {
    return null;
  }
  // What the project's files or its saved history already keep is stored for sure.
  const kept = new Set([...session.stored.values(), ...session.historyHashes]);
  const blobs = new Map<string, Blob>();
  for (const [key, hash] of Object.entries(history?.files ?? {})) {
    if (kept.has(hash) || blobs.has(hash)) continue;
    const found = assetOfFile(key)!;
    blobs.set(hash, assetBlob(found.asset, found.kind));
  }
  return { history, blobs };
}

/**
 * The saved undo steps with the saved document on top, for a project opened
 * from its last-moment journal: the steps saved lead to that document, not
 * to the journal's, so Ctrl+Z first goes back to it (the changes the page
 * didn't get to save, as one step) instead of to the state before the last
 * saved step (which took a piece just added off the sheet).
 */
function withSavedState(saved: SavedHistory | null, doc: ProjectDoc, files: ReadonlyMap<string, StoredFile>): SavedHistory {
  const { sheets, items, paper, landscape, margin, gap, cuts, allowOverlap } = doc;
  const state = { sheets, items, selection: [], paper, landscape, margin, gap, cuts: cuts ?? DEFAULT_CUTS, allowOverlap };
  const hashes = Object.fromEntries(fileKeys(doc).map((key) => [key, files.get(key)!.hash]));
  return { undo: [...(saved?.undo ?? []), state], redo: [], assets: { ...saved?.assets, ...doc.assets }, files: { ...saved?.files, ...hashes } };
}

// Hashes the binaries of the undo steps' assets that don't have them yet.
async function hashHistoryAssets() {
  const { undo, redo } = historyStacks();
  const keys = new Set([...undo, ...redo].flatMap((snap) => snap.items.map((item) => item.asset)));
  await Promise.all([...keys].map((key) => findAsset(key)).filter((asset) => !!asset && !asset.hashes).map((asset) => withHashes(asset!)));
}

/**
 * Puts back the undo steps saved with project `id` once their assets are
 * loaded (the ones the document doesn't use: removed pieces, other pages),
 * without delaying the opening. If a binary is missing, they aren't used.
 */
async function restoreHistory(id: string, saved: SavedHistory) {
  const generation = assetGeneration();
  try {
    const missing = Object.fromEntries(Object.entries(saved.assets).filter(([key]) => !findAsset(key)));
    const keys = fileKeys({ assets: missing });
    const blobs = keys.length ? await session.storage!.blobs(keys.map((key) => saved.files[key])) : new Map<string, Blob>();
    const files = new Map(keys.filter((key) => blobs.has(saved.files[key])).map((key) => [key, { blob: blobs.get(saved.files[key])!, hash: saved.files[key] }]));
    if (files.size < keys.length) throw new Error('a binary of the undo history is missing');
    const restored = await restoreAssets({ assets: missing }, files);
    if (assetGeneration() !== generation || session.record?.id !== id) {
      for (const asset of restored.values()) URL.revokeObjectURL(asset.url);
      return;
    }
    adoptAssets(restored);
    installHistory(saved);
  } catch (err) {
    console.warn('The undo history could not be restored.', err);
  } finally {
    if (session.record?.id === id) session.historyReady = true;
  }
}

// ---------- The cut pieces ----------
//
// What «Cortar» took is saved (in the clipboard store, with the binaries it
// needs) until it is pasted or another copy replaces it: reloading after
// cutting loses nothing. One clipboard for the browser, like the system's.

/** A piece in the clipboard: its asset (with its binaries and hashes) and how it was. */
export interface CutPiece {
  asset: AppAsset;
  scale: number;
  r: Rotation;
  crop: Crop | null;
}

/** Saves the pieces just cut. */
export async function keepCut(pieces: readonly CutPiece[]) {
  const storage = session.storage;
  if (!storage) return;
  try {
    await Promise.all(pieces.filter((piece) => !piece.asset.hashes).map((piece) => withHashes(piece.asset)));
    // Keys of their own for the clipboard's assets (one per asset).
    const keys = new Map<AppAsset, string>();
    for (const { asset } of pieces) if (!keys.has(asset)) keys.set(asset, `a${keys.size + 1}`);
    const byKey = new Map([...keys].map(([asset, key]) => [key, asset]));
    const fileOf = (fileKey: string) => {
      const [kind, ref] = fileKey.split(':');
      const asset = kind === 'preview' ? byKey.get(ref) : [...keys.keys()].find((a) => String(a.src) === ref && (kind !== 'bytes' || (a.kind === 'image' && a.derived)));
      return asset && { asset, kind: kind === 'src' ? ('original' as const) : (kind as 'bytes' | 'preview') };
    };
    const record = serializeClip(
      pieces.map((piece) => ({ asset: keys.get(piece.asset)!, scale: piece.scale, r: piece.r, crop: piece.crop })),
      (key) => assetMeta(byKey.get(key)!),
      (fileKey) => {
        const file = fileOf(fileKey);
        return file?.asset.hashes?.[file.kind === 'original' ? 'src' : file.kind];
      }
    );
    // The binaries the project's files or its saved history keep are stored
    // for sure (see historyFor); only the rest go with it. So a piece of a
    // project opened from storage (whose Blobs would have to be read first)
    // is written in this very task, before the tab can go away.
    const kept = new Set([...session.stored.values(), ...session.historyHashes]);
    const blobs = new Map<string, Blob>();
    for (const [fileKey, hash] of Object.entries(record?.files ?? {})) {
      if (kept.has(hash)) continue;
      const file = fileOf(fileKey)!;
      blobs.set(hash, assetBlob(file.asset, file.kind));
    }
    await storage.setClip(record, blobs);
    scheduleGarbage();
  } catch (err) {
    console.warn('The cut pieces could not be saved.', err);
  }
}

/** The saved cut pieces are no longer needed (pasted, or replaced by a copy). */
export async function forgetCut() {
  const storage = session.storage;
  if (!storage) return;
  try {
    if (!(await storage.clip())) return;
    await storage.setClip(null);
    scheduleGarbage();
  } catch (err) {
    console.warn('The saved cut pieces could not be removed.', err);
  }
}

/** The pieces cut before the page was reloaded, with their assets loaded, or null. */
export async function loadCut(): Promise<CutPiece[] | null> {
  const storage = session.storage;
  if (!storage) return null;
  try {
    const saved = parseClip(await storage.clip());
    if (!saved) return null;
    const keys = fileKeys({ assets: saved.assets });
    const blobs = await storage.blobs(keys.map((key) => saved.files[key]));
    if (keys.some((key) => !blobs.has(saved.files[key]))) return null;
    const files = new Map(keys.map((key) => [key, { blob: blobs.get(saved.files[key])!, hash: saved.files[key] }]));
    const assets = await restoreAssets({ assets: saved.assets }, files);
    return saved.pieces.map((piece) => ({ asset: assets.get(piece.asset)!, scale: piece.scale, r: piece.r, crop: piece.crop }));
  } catch (err) {
    console.warn('The saved cut pieces could not be read.', err);
    return null;
  }
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
  Object.assign(opening, { id, asked: false, lost: false });
  try {
    await claim(id);
    const [stored, savedSteps] = await Promise.all([loadProject(session.storage!, id, migrationContext()), session.storage!.history(id).catch(() => null)]);
    const { doc, files } = stored;
    // Opened now: first in «Proyectos» (only that changes: it isn't saved as a change).
    const record = (await touchProject(session.storage!, id, now())) ?? stored.record;
    // What was journaled when the tab closed, if newer than what was saved.
    const recovered = recoverJournal(record, files, readJournal(id), migrationContext());
    const saved = parseHistory(savedSteps);
    const withSaved = recovered ? withSavedState(saved, doc, files) : saved;
    const use = recovered?.doc ?? doc;
    const loaded = await restoreAssets(use, files);
    replaceDocument(use, loaded, withSaved);
    // Only the name journaled (a rename right before closing): no undo step for that.
    const history = recovered && canonical(serialized()) === canonical(doc) ? saved : withSaved;
    adopt(recovered ? { ...record, name: recovered.name } : record, new Map([...files].map(([key, file]) => [key, file.hash])), { remember });
    session.historyHashes = new Set(Array.isArray(savedSteps?.hashes) ? savedSteps.hashes : []);
    session.historyReady = !history;
    if (history) void restoreHistory(id, history);
    if (recovered) {
      // It differs from what was saved (the document, or only the name): autosave writes it.
      session.savedSig = JSON.stringify(doc);
      session.savedName = record.name;
      documentChanged();
      if (recovered.name !== record.name) void save();
    } else clearJournal(id);
    const { asked, lost } = opening;
    opening.id = null;
    // Another tab asked for it, or took it, while it opened here.
    if (lost || asked) {
      if (session.status === 'pending') await flush();
      stopSaving();
      if (asked) post({ type: 'released', project: id });
    }
    return record;
  } catch (err) {
    opening.id = null;
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
  // Named after the original as stored, read by the operation that writes the copy.
  const name = (original: string) => cleanName(t('projects.copyName', { name: original || untitled() }), untitled());
  const record = await duplicateProject(session.storage!, id, { newId: newProjectId(), name, now: now() });
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
  // The name it had is needed only when the new one is empty (it stays): for
  // another project it is read only then, so the new one is written at once
  // (the tab may be closing, see storage/idb.ts).
  const clean = cleanName(name, '') || (open ? session.record!.name : ((await session.storage?.get(id))?.name ?? untitled()));
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
  const id = newProjectId();
  await claimNew(id);
  const record = await createProject(session.storage!, { id, name: session.record?.name ?? untitled(), now: now() });
  session.record = record;
  session.stored = new Map();
  session.historyHashes = new Set();
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
  releaseLock();
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
//
// A project is saved by one tab only. Where the browser has Web Locks, that
// tab holds the project's lock («scooch-projects:<id>») while it saves it:
// opening a project nobody holds takes its lock at once, without asking
// anyone. When another tab holds it, this one asks through the channel
// («claim»); that tab saves what is pending, stops saving, lets the lock go
// and says so («released»). A tab that doesn't answer within 3 s (frozen)
// has its lock taken; when it wakes up it learns it lost it and stops
// saving. Without Web Locks, the tab that opens a project asks and waits a
// moment for an answer every time.

interface TabMessage {
  type: 'claim' | 'busy' | 'released' | 'changed' | 'renamed' | 'deleted';
  tab: string;
  project?: string;
  name?: string;
}

const post = (message: Omit<TabMessage, 'tab'>) => channel?.postMessage({ ...message, tab });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** How long a tab that has the project is waited for. */
const ANSWER_TIMEOUT = 3000;

const lockManager = () => (typeof navigator !== 'undefined' ? navigator.locks : undefined);
const lockName = (id: string) => `${TABS_CHANNEL}:${id}`;
/** The lock this tab holds (the project it saves), and how to let it go. */
let held: { id: string; release: () => void } | null = null;
/** The project being opened here, and whether another tab asked for it meanwhile. */
const opening = { id: null as string | null, asked: false, lost: false };

/**
 * Takes the project's lock and holds it until releaseLock(): `ifAvailable`
 * (false when another tab has it), `wait` for it or `steal` it.
 */
function holdLock(id: string, how: 'ifAvailable' | 'wait' | 'steal'): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let granted = false;
    const options = how === 'ifAvailable' ? { ifAvailable: true } : how === 'steal' ? { steal: true } : {};
    lockManager()!
      .request(lockName(id), options, (lock) => {
        if (!lock) return resolve(false);
        granted = true;
        return new Promise<void>((release) => {
          held = { id, release };
          resolve(true);
        });
      })
      .catch((err: unknown) => {
        if (!granted) return reject(err);
        // Taken by a tab this one didn't answer (it was frozen).
        if (held?.id === id) {
          held = null;
          lostLock(id);
        }
      });
  });
}

function releaseLock() {
  held?.release();
  held = null;
}

// The open project's lock went to another tab: this one stops saving it.
function lostLock(id: string) {
  if (opening.id === id) opening.lost = true;
  else if (session.record?.id === id && session.status !== 'readonly' && session.status !== 'off') stopSaving();
}

// Another tab saves the project from now on.
function stopSaving() {
  clearTimeout(timer);
  releaseLock();
  setStatus('readonly');
  hooks.notify('takenOver');
}

/** Asks the tabs that have the project to save and let it go. Resolves when one says it did (true) or after a while (false). */
function askForProject(id: string, wait = ANSWER_TIMEOUT) {
  return new Promise<boolean>((resolve) => {
    if (!channel) return resolve(false);
    const listen = (e: MessageEvent<TabMessage>) => {
      if (e.data?.project === id && e.data.tab !== tab && e.data.type === 'released') finish(true);
    };
    const timeout = setTimeout(() => finish(false), wait);
    const finish = (answered: boolean) => {
      clearTimeout(timeout);
      channel.removeEventListener('message', listen);
      resolve(answered);
    };
    channel.addEventListener('message', listen);
    post({ type: 'claim', project: id });
  });
}

/**
 * Makes this tab the one that saves project `id` (see above); the previous
 * one's lock goes. When the tab that had it lets it go, another tab asking at
 * the same time may take it first: then that one is asked in turn.
 */
async function claim(id: string) {
  releaseLock();
  if (lockManager()) {
    while (!(await holdLock(id, 'ifAvailable'))) {
      if (!(await askForProject(id))) {
        await holdLock(id, 'steal');
        return;
      }
    }
    return;
  }
  // Without Web Locks: ask, and wait for whoever has it.
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
  if (busy.size) await Promise.race([new Promise<void>((resolve) => (released = resolve)), sleep(ANSWER_TIMEOUT)]);
  channel.removeEventListener('message', listen);
}

/** A project nobody else can have yet (just created here): its lock, if there are locks. */
async function claimNew(id: string) {
  releaseLock();
  if (lockManager()) await holdLock(id, 'ifAvailable');
}

async function onMessage(e: MessageEvent<TabMessage>) {
  const m = e.data;
  if (!m || m.tab === tab) return;
  const mine = !!m.project && m.project === session.record?.id && opening.id === null;
  // With locks, only the tab holding the project's lock answers (also while it opens it).
  const holder = lockManager() ? !!m.project && held?.id === m.project : mine;
  if (m.type === 'claim' && holder && m.project === opening.id) {
    // Asked while opening it here: it goes to the other tab once open.
    post({ type: 'busy', project: m.project });
    opening.asked = true;
  } else if (m.type === 'claim' && holder && mine && session.status !== 'readonly' && session.status !== 'off') {
    post({ type: 'busy', project: m.project });
    try {
      await flush();
    } finally {
      stopSaving();
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
