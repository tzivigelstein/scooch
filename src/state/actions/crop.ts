// Crop: standard photo sizes for the selection and committing a crop session
// (the session itself is the lazily loaded crop mode, components/canvas/crop).

import { matchPhotoSize, photoSize, sameCrop } from '../../core/crop.js';
import { planPhotoSize } from '../../core/resize.js';
import type { Item } from '../../core/types.ts';
import { sameNumber } from '../../core/util.js';
import { formatList, sentences, t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { sizeText } from '../../services/measure.ts';
import { getDocument, type Piece } from '../document.ts';
import { commit } from '../history.ts';
import { dims, findItem, pieceName, selectedItems, sheetIndex } from '../selectors.ts';
import { animateNext } from '../view.ts';
import { applySettled, resizeOptions, settle } from './layout.ts';
import { say } from './notify.ts';

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
 * What choosing `id` in «Tamaño de foto» ('original' or a standard size)
 * would do to the selection, without changing anything (core/resize.planPhotoSize):
 * what the canvas previews and what applyPhotoSize applies. `newSheet`: the
 * ids of the sheets it would add. null without a selection or with an id that
 * is no option.
 */
export function photoSizePlan(id: string, newSheet?: () => number) {
  const { items, sheets } = getDocument();
  const list = selectedItems();
  const size = id === 'original' ? null : photoSize(id);
  if (!list.length || (id !== 'original' && !size)) return null;
  return planPhotoSize(list, size, {
    ...resizeOptions(newSheet),
    items,
    sheetIds: sheets.map((sheet) => sheet.id),
  });
}

/**
 * Brings every selected piece to a standard photo size (EXACTLY that size on
 * the sheet, cropping the overflow centered, never distorting, turned to the
 * image's orientation), or with 'original' removes their crop. Each keeps its
 * center; one that would overlap moves to a free spot (see photoSizePlan). One undo step.
 */
export function applyPhotoSize(id: string) {
  if (getDocument().busy) return;
  const list = selectedItems();
  const plan = photoSizePlan(id);
  if (!plan) return;
  const { changed, refused } = plan;
  const outOfRange = refused.length ? t('notices.sizeOutOfRange', { n: refused.length, names: formatList(refused.map((item) => pieceName(item.id))) }) : '';
  if (!changed.length) {
    if (outOfRange) say(outOfRange, { warn: true });
    else announce(t(id === 'original' ? 'announce.uncroppedAlready' : 'announce.sizedAlready', { n: list.length }));
    return;
  }
  commit();
  animateNext();
  const before = new Map(list.map((item) => [item.id, item.sheet]));
  applySettled(changed, plan.sheets);
  const { near, away } = movedBy(before, plan.moved);
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
 * What settling did with the pieces that changed size (`before`: the sheet
 * each was on), as texts: how many moved to a free spot of their sheet and
 * where the ones that went to other sheets are.
 */
function movedBy(before: ReadonlyMap<number, number>, moved: readonly number[]) {
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
  if (sameNumber(item.x, patch.x) && sameNumber(item.y, patch.y) && sameNumber(item.scale, patch.scale) && sameCrop(item.crop, patch.crop)) {
    announce(t('crop.unchanged'));
    return;
  }
  commit();
  const changed = { ...item, ...patch };
  const { near, away } = movedBy(new Map([[id, item.sheet]]), settle([changed]));
  const next = findItem(id)!;
  const [w, h] = dims(next);
  const text = sentences([t('crop.applied', { name: pieceName(id), size: sizeText(w, h) }), near, away]);
  if (away) say(text, { info: true });
  else announce(text);
}
