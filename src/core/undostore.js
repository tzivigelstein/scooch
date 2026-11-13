// What is saved besides a project's document: its undo history (so undo and
// redo survive a reload or reopening it) and the pieces cut and not pasted yet
// (so cutting and reloading loses nothing). Turning them into stored records
// and reading those back. Pure module (no DOM, no storage).
//
// RULE: like the document, a shape that was ever stored is frozen: a change is
// a new `v` with its reading here, and a fixture in tests/fixtures/history/.
// Reading is tolerant in its own way: these are conveniences, so a record that
// can't be used (damaged, or of another document version) reads as nothing
// and never stops a project from opening.
//
// History, version 1 ({project, v: 1, docVersion, …}): the undo and redo steps
// as snapshots of the document without binaries. Consecutive steps share most
// pieces, so every distinct piece is kept once (`items`) and each step lists
// indexes into it:
//   {project, v: 1, docVersion,
//    items: [{id, asset, sheet, x, y, scale, r, crop}],
//    undo: [step], redo: [step],        // oldest first, like the stacks
//    assets: {aK: meta}, files: {key: hash}, hashes: [hash]}
//   step: {sheets: [id], items: [index], selection: [id], paper, landscape,
//          margin, gap, cuts, allowOverlap}
// Steps of another document version than the current one aren't read (the
// history is dropped once, never the project).
//
// Clipboard, version 1 ({id: 'cut', v: 1, docVersion, …}): what «Cortar» took
// and wasn't pasted yet:
//   {id: 'cut', v: 1, docVersion, pieces: [{asset, scale, r, crop}],
//    assets: {aK: meta}, files: {key: hash}, hashes: [hash]}

import { DOC_VERSION, cleanCrop, cleanCuts, fileKeys, validate } from './projectdoc.js';

export const HISTORY_VERSION = 1;
export const CLIP_VERSION = 1;

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const cleanItem = ({ id, asset, sheet, x, y, scale, r, crop }) => ({ id, asset, sheet, x, y, scale, r, crop: cleanCrop(crop) });

/**
 * The references of some assets (key → meta): their files' hashes, from
 * `hashOf(key, fileKey)`. Throws when a hash is missing.
 */
function referencesOf(assets, hashOf) {
  const files = {};
  for (const key of fileKeys({ assets })) {
    const hash = hashOf(key);
    if (!hash) throw new Error(`no hash for ${key}`);
    files[key] = hash;
  }
  return { assets, files, hashes: [...new Set(Object.values(files))].sort() };
}

/**
 * The stored history of project `project`: `stacks` {undo, redo} of
 * snapshots ({sheets, items, selection, paper, landscape, margin, gap, cuts,
 * allowOverlap}), `metaOf(assetKey)` the stored fields of an asset
 * (projectdoc.assetMeta) and `hashOf(fileKey)` the hash of a file
 * (projectdoc.fileKeys). Null when there are no steps.
 */
export function serializeHistory(project, { undo, redo }, metaOf, hashOf) {
  if (!undo.length && !redo.length) return null;
  const items = [];
  const index = new Map(); // the same piece object → one entry
  const assets = {};
  const step = (snap) => ({
    sheets: snap.sheets.map((sheet) => sheet.id),
    items: snap.items.map((item) => {
      if (!index.has(item)) {
        index.set(item, items.length);
        items.push(cleanItem(item));
        assets[item.asset] ??= metaOf(item.asset);
      }
      return index.get(item);
    }),
    selection: [...snap.selection],
    paper: typeof snap.paper === 'string' ? snap.paper : { custom: true, w: snap.paper.w, h: snap.paper.h },
    landscape: !!snap.landscape,
    margin: snap.margin,
    gap: snap.gap,
    cuts: cleanCuts(snap.cuts),
    allowOverlap: snap.allowOverlap === true,
  });
  const record = { project, v: HISTORY_VERSION, docVersion: DOC_VERSION, items, undo: undo.map(step), redo: redo.map(step) };
  return { ...record, ...referencesOf(assets, hashOf) };
}

/**
 * The steps of a stored history ({undo, redo, assets, files}), each step a
 * snapshot whose pieces are shared objects; null when there is none or it
 * can't be used.
 */
export function parseHistory(raw) {
  try {
    if (!isRecord(raw) || raw.v !== HISTORY_VERSION || raw.docVersion !== DOC_VERSION) return null;
    const { items, undo, redo, assets, files } = raw;
    if (!Array.isArray(items) || !Array.isArray(undo) || !Array.isArray(redo) || !isRecord(assets) || !isRecord(files)) return null;
    const pieces = items.map((item) => (isRecord(item) ? cleanItem(item) : null));
    const sheets = new Map(); // the same list of ids → one array of sheets
    const snapshot = (step) => {
      if (!isRecord(step) || !Array.isArray(step.sheets) || !Array.isArray(step.items) || !Array.isArray(step.selection)) throw new Error('step');
      const ids = step.sheets.join(',');
      if (!sheets.has(ids)) sheets.set(ids, step.sheets.map((id) => ({ id })));
      const snap = {
        sheets: sheets.get(ids),
        items: step.items.map((i) => pieces[i] ?? (() => { throw new Error('piece'); })()),
        selection: step.selection.filter((id) => Number.isInteger(id)),
        paper: step.paper,
        landscape: step.landscape,
        margin: step.margin,
        gap: step.gap,
        cuts: step.cuts,
        allowOverlap: step.allowOverlap,
      };
      // The same rules as a document's (paper, settings, pieces pointing to their assets and sheets).
      const problems = validate({ version: DOC_VERSION, rotate: true, ...snap, assets });
      if (problems.length) throw new Error(problems[0]);
      return snap;
    };
    const out = { undo: undo.map(snapshot), redo: redo.map(snapshot), assets, files };
    if (fileKeys({ assets }).some((key) => typeof files[key] !== 'string')) return null;
    return out;
  } catch {
    return null;
  }
}

/** The stored clipboard of cut pieces ([{asset, scale, r, crop}]); null without pieces. */
export function serializeClip(pieces, metaOf, hashOf) {
  if (!pieces.length) return null;
  const assets = {};
  for (const piece of pieces) assets[piece.asset] ??= metaOf(piece.asset);
  return {
    id: 'cut',
    v: CLIP_VERSION,
    docVersion: DOC_VERSION,
    pieces: pieces.map(({ asset, scale, r, crop }) => ({ asset, scale, r, crop: cleanCrop(crop) })),
    ...referencesOf(assets, hashOf),
  };
}

/** The pieces of a stored clipboard ({pieces, assets, files}); null when there is none or it can't be used. */
export function parseClip(raw) {
  if (!isRecord(raw) || raw.v !== CLIP_VERSION || raw.docVersion !== DOC_VERSION || !Array.isArray(raw.pieces) || !isRecord(raw.assets) || !isRecord(raw.files)) return null;
  const { assets, files } = raw;
  // Checked as the pieces of a one-sheet document.
  const items = raw.pieces.map((piece, i) => (isRecord(piece) ? { id: i + 1, asset: piece.asset, sheet: 1, x: 0, y: 0, scale: piece.scale, r: piece.r, crop: piece.crop ?? null } : null));
  if (!items.length || items.some((item) => !item)) return null;
  const doc = { version: DOC_VERSION, paper: 'A4', landscape: false, margin: 0, gap: 0, rotate: true, allowOverlap: false, cuts: cleanCuts({}), sheets: [{ id: 1 }], items, assets };
  if (validate(doc).length || fileKeys({ assets }).some((key) => typeof files[key] !== 'string')) return null;
  return { pieces: items.map(({ asset, scale, r, crop }) => ({ asset, scale, r, crop: cleanCrop(crop) })), assets, files };
}

/**
 * The ids a set of assets and steps use, to continue after them: the next
 * piece, sheet, asset key and source ids (like projectdoc.nextIds).
 */
export function nextIdsOf({ undo = [], redo = [], assets = {} }) {
  const max = (values) => values.reduce((m, v) => Math.max(m, v), 0);
  const steps = [...undo, ...redo];
  return {
    item: max(steps.flatMap((snap) => snap.items.map((item) => item.id))) + 1,
    sheet: max(steps.flatMap((snap) => snap.sheets.map((sheet) => sheet.id))) + 1,
    asset: max(Object.keys(assets).map((key) => Number(key.slice(1)) || 0)) + 1,
    src: max(Object.values(assets).map((asset) => asset.src)) + 1,
  };
}
