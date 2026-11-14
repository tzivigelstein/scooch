// Crop: standard photo sizes for the selection and committing a crop session
// (the session itself is the lazily loaded crop mode, components/canvas/crop).

import { fitToSize, matchPhotoSize, photoSize } from '../../core/crop.js';
import type { Item } from '../../core/types.ts';
import { formatList, sentences, t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { sizeText } from '../../services/measure.ts';
import { getAsset } from '../assets.ts';
import { getDocument, type Piece } from '../document.ts';
import { commit } from '../history.ts';
import { dims, findItem, pieceName, selectedItems, sheetIndex } from '../selectors.ts';
import { animateNext } from '../view.ts';
import { settle, withCenterKept } from './layout.ts';
import { say } from './notify.ts';

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const sameCrop = (a: Item['crop'], b: Item['crop']) => (!a || !b ? a === b : same(a.x, b.x) && same(a.y, b.y) && same(a.w, b.w) && same(a.h, b.h));

/** What the «Tamaño de foto» select shows for a piece: a standard size id, 'original' or 'custom'. */
export function photoSizeOf(item: Piece): string {
  const [w, h] = dims(item);
  return matchPhotoSize(w, h)?.id ?? (item.crop ? 'custom' : 'original');
}

/** The shared value of the selection, or 'mixed'. */
export function selectionPhotoSize(list: readonly Piece[]): string {
  const values = new Set(list.map(photoSizeOf));
  return values.size === 1 ? [...values][0] : 'mixed';
}

/** A standard size's visible name («10 × 15»). */
export const photoSizeName = (id: string) => t(`crop.names.${id}` as Parameters<typeof t>[0]);

/**
 * Brings every selected piece to a standard photo size (EXACTLY that size on
 * the sheet, cropping the overflow centered, never distorting, turned to the
 * image's orientation), or with 'original' removes their crop. Each keeps its
 * center; one that would overlap moves to a free spot (see settle). One undo step.
 */
export function applyPhotoSize(id: string) {
  const list = selectedItems();
  if (!list.length || getDocument().busy) return;
  const size = id === 'original' ? null : photoSize(id);
  if (id !== 'original' && !size) return;
  const changed: Item[] = [];
  const refused: number[] = [];
  for (const item of list) {
    if (!size) {
      if (item.crop) changed.push(withCenterKept(item, { crop: null }));
      continue;
    }
    const fit = fitToSize(getAsset(item.asset), item.r, size);
    if (fit.scale < 1 || fit.scale > 1000) {
      refused.push(item.id);
      continue;
    }
    const next = withCenterKept(item, { crop: fit.crop, scale: fit.scale });
    if (!sameCrop(next.crop, item.crop) || !same(next.scale, item.scale)) changed.push(next);
  }
  const outOfRange = refused.length ? t('notices.sizeOutOfRange', { n: refused.length, names: formatList(refused.map(pieceName)) }) : '';
  if (!changed.length) {
    if (outOfRange) say(outOfRange, { warn: true });
    else announce(t(id === 'original' ? 'announce.uncroppedAlready' : 'announce.sizedAlready', { n: list.length }));
    return;
  }
  commit();
  animateNext();
  const { near, away } = movedBy(changed, settle(changed));
  const result = resultText(
    id,
    changed.map((item) => findItem(item.id)!)
  );
  // The canvas shows the new sizes; pieces sent to other sheets, or refused, are told.
  const text = sentences([result, near, away, outOfRange]);
  if (outOfRange) say(text, { warn: true });
  else if (away) say(text, { info: true });
  else announce(text);
}

/**
 * What settle did with the pieces that changed size, as texts: how many moved
 * to a free spot of their sheet and where the ones that went to other sheets are.
 */
function movedBy(changed: readonly Item[], moved: readonly number[]) {
  const before = new Map(changed.map((item) => [item.id, item.sheet]));
  const awaySheets = new Set<number>();
  let near = 0;
  let away = 0;
  for (const id of moved) {
    const sheet = findItem(id)!.sheet;
    if (sheet === before.get(id)) near++;
    else {
      away++;
      awaySheets.add(sheetIndex(sheet) + 1);
    }
  }
  const list = [...awaySheets].sort((a, b) => a - b);
  return {
    near: near ? t('notices.movedAside', { n: near }) : '',
    away: !away ? '' : list.length > 1 ? t('notices.movedToSheets', { n: away, list: formatList(list) }) : t('notices.movedToSheet', { n: away, i: list[0] }),
  };
}

function resultText(id: string, list: readonly Piece[]) {
  if (id === 'original') return list.length === 1 ? t('notices.uncropped') : t('notices.uncroppedMany', { n: list.length });
  if (list.length === 1) {
    const [w, h] = dims(list[0]);
    return t('notices.sized', { name: photoSizeName(id), size: sizeText(w, h) });
  }
  return t('notices.sizedMany', { n: list.length, name: photoSizeName(id) });
}

/**
 * Applies what crop mode left (position, scale and crop of piece `id`) in one
 * undo step, keeping the piece valid like a size change (see settle).
 */
export function commitCrop(id: number, patch: Pick<Item, 'x' | 'y' | 'scale' | 'crop'>) {
  const item = findItem(id);
  if (!item || getDocument().busy) return;
  if (same(item.x, patch.x) && same(item.y, patch.y) && same(item.scale, patch.scale) && sameCrop(item.crop, patch.crop)) {
    announce(t('crop.unchanged'));
    return;
  }
  commit();
  const changed = { ...item, ...patch };
  const { near, away } = movedBy([changed], settle([changed]));
  const next = findItem(id)!;
  const [w, h] = dims(next);
  const text = sentences([t('crop.applied', { name: pieceName(id), size: sizeText(w, h) }), near, away]);
  if (away) say(text, { info: true });
  else announce(text);
}
