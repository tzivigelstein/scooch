// Copying, cutting and pasting pieces inside the tab. The clipboard keeps the
// pieces (size, rotation, crop) with their assets, so they paste into any
// project open in this tab: into another one, the assets are added to it
// with new source ids. Pasting places the copies in the free gaps from the
// current sheet on, like duplicating, in one undo step. What is cut is also
// saved until it is pasted or replaced (services/projects.ts keepCut), so a
// reload in between loses nothing.

import { MAX_ITEMS } from '../../config.ts';
import type { Item } from '../../core/types.ts';
import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { revealPieces } from '../../components/canvas/viewport.ts';
import { newSource, reserveSources, type AppAsset } from '../../services/assets.ts';
import { forgetCut, keepCut, loadCut } from '../../services/projects.ts';
import { addAsset, assetEntries, assetGeneration, findAsset, getAsset } from '../assets.ts';
import { getDocument, newItem, setDocument } from '../document.ts';
import { flushUi } from '../flush.ts';
import { commit } from '../history.ts';
import { area, currentSheet, dims, selectedItems, sheetIndex } from '../selectors.ts';
import { setView } from '../view.ts';
import { focusSheet } from './focus.ts';
import { placeInto } from './layout.ts';
import { say } from './notify.ts';
import { remove } from './pieces.ts';
import { setSelection } from './selection.ts';

interface ClipPiece {
  key: string;
  asset: AppAsset;
  scale: number;
  r: Item['r'];
  crop: Item['crop'];
}

interface Clip {
  pieces: ClipPiece[];
  generation: number;
}

let clip: Clip | null = null;

/** Is there something of ours to paste? */
export const hasClip = () => !!clip?.pieces.length;

/** What goes to the system clipboard as text, so a later outside copy is told apart from ours. */
export const CLIP_TYPE = 'application/x-scooch-pieces';

// Copies the selected pieces into the clipboard. Returns how many, or 0.
function takeSelection() {
  const items = selectedItems();
  if (!items.length) return 0;
  clip = {
    pieces: items.map((item) => ({ key: item.asset, asset: getAsset(item.asset), scale: item.scale, r: item.r, crop: item.crop ? { ...item.crop } : null })),
    generation: assetGeneration(),
  };
  return items.length;
}

/** Copies the selected pieces (what was cut and saved is replaced). Returns how many, or 0. */
export function copySelection({ quiet = false } = {}) {
  const n = takeSelection();
  if (!n) return 0;
  void forgetCut();
  // Nothing on the sheets changes, so the notice is the only sign that it worked.
  if (!quiet) say(t('announce.copied', { n }));
  return n;
}

/** Cuts the selected pieces: copied (and saved until pasted), then removed in one undo step. */
export function cutSelection() {
  if (getDocument().busy) return 0;
  const n = takeSelection();
  if (!n) return 0;
  void keepCut(clip!.pieces);
  remove({ focus: true, announced: t('announce.cut', { n }) });
  return n;
}

/**
 * On start: the pieces cut before the page was reloaded go back to the
 * clipboard (unless something was copied meanwhile). They paste like pieces
 * of another project.
 */
export async function restoreCut() {
  if (clip) return;
  const pieces = await loadCut();
  if (!pieces || clip) return;
  // Pasting gives each asset a preview URL of its own (see resolve).
  for (const { asset } of pieces) URL.revokeObjectURL(asset.url);
  clip = { pieces: pieces.map((piece) => ({ key: '', ...piece })), generation: -1 };
}

// The key of a clipboard piece's asset in the open project, adding it if it
// isn't loaded (released by the history, or from another project).
function resolve(piece: ClipPiece, sources: Map<number, number>) {
  if (findAsset(piece.key) === piece.asset) return piece.key;
  const loaded = assetEntries().find(([, asset]) => asset === piece.asset);
  if (loaded) return loaded[0];
  const foreign = clip!.generation !== assetGeneration();
  let src = piece.asset.src;
  if (foreign) {
    if (!sources.has(src)) {
      reserveSources(Math.max(0, ...assetEntries().map(([, asset]) => asset.src)) + 1);
      sources.set(src, newSource());
    }
    src = sources.get(src)!;
  }
  const url = URL.createObjectURL(piece.asset.preview);
  const asset: AppAsset = piece.asset.kind === 'pdf' ? { ...piece.asset, src, url, pdf: null } : { ...piece.asset, src, url };
  const key = addAsset(asset);
  // Later pastes reuse what this one added.
  piece.key = key;
  piece.asset = asset;
  return key;
}

/** Pastes the copied pieces into the free gaps from the current sheet on, selected. */
export function pastePieces() {
  const { busy, items } = getDocument();
  if (busy) return false;
  if (!clip?.pieces.length) {
    announce(t('announce.nothingToPaste'));
    return false;
  }
  const n = clip.pieces.length;
  if (items.length + n > MAX_ITEMS) {
    say(t('errors.maxPaste', { max: MAX_ITEMS, n: Math.max(0, MAX_ITEMS - items.length) }), { warn: true });
    return false;
  }
  const sheet = currentSheet();
  // The step first: the assets added next aren't used yet and would be released.
  commit();
  const sources = new Map<number, number>();
  const keys = clip.pieces.map((piece) => resolve(piece, sources));
  const fresh = clip.pieces.map((piece, i) => newItem(keys[i], { sheet, scale: piece.scale, r: piece.r, crop: piece.crop ? { ...piece.crop } : null }));
  const unplaced = new Set(placeInto(fresh, sheetIndex(sheet), { rotate: false }));
  // What doesn't fit even alone on a sheet goes to the middle of the current one, overlapping.
  const { W, H } = area();
  fresh
    .filter((item) => unplaced.has(item.id))
    .forEach((item, i) => {
      const [w, h] = dims(item);
      item.sheet = sheet;
      item.x = (W - w) / 2 + i * 5;
      item.y = (H - h) / 2 + i * 5;
    });
  setDocument({ items: [...getDocument().items, ...fresh] });
  const ids = fresh.map((item) => item.id);
  setSelection(ids, { pinned: ids.length > 1 });
  setView({ sheet: fresh.at(-1)!.sheet });
  flushUi();
  revealPieces(ids, ids[0]);
  focusSheet();
  const sheets = new Set(fresh.map((item) => item.sheet)).size;
  // The view shows the last sheet they went to: pasted on several sheets, a notice says so.
  if (sheets > 1) say(t('notices.pastedSheets', { n, sheets }));
  else announce(t('announce.pasted', { n, i: sheetIndex(fresh[0].sheet) + 1 }));
  // Pasted into a project: the saved cut pieces aren't needed any more.
  void forgetCut();
  return true;
}
