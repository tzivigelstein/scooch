// Selecting pieces: one, several (Shift or Ctrl, a marquee, Ctrl+A), the ones
// from the same file, and which one is the primary.

import { sameSource, selectAllTarget, toggled, touchedSelection, withPrimaryLast } from '../../core/group.js';
import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { getAsset } from '../assets.ts';
import { getDocument, setDocument } from '../document.ts';
import { currentSheet, findItem, isSelected, itemsOn, primaryItem, selectedItems, sheetIndex } from '../selectors.ts';
import { getView, setView } from '../view.ts';

/**
 * Replaces the selection. `pinned`: the selection becomes pinned (see
 * ViewState.pinned); an empty one never is.
 */
export function setSelection(ids: readonly number[], { pinned = false } = {}) {
  const items = getDocument().items;
  const selection = [...new Set(ids)].filter((id) => items.some((item) => item.id === id));
  setDocument({ selection });
  setView({ pinned: pinned && selection.length > 0 });
}

/** Selects just that piece (or none, with null). */
export function select(id: number | null) {
  const ids = id === null ? [] : [id];
  const { selection } = getDocument();
  if (!getView().pinned && selection.length === ids.length && selection.every((v, i) => v === ids[i])) return;
  setSelection(ids);
  const item = primaryItem();
  if (item) setView({ sheet: item.sheet });
}

/** The piece, already selected, becomes the primary (the toolbar's and the current sheet's). */
export function makePrimary(id: number) {
  const { selection } = getDocument();
  if (selection.at(-1) === id || !isSelected(id)) return;
  setDocument({ selection: [...selection.filter((other) => other !== id), id] });
  setView({ sheet: findItem(id)!.sheet });
}

/**
 * A piece got the focus (Tab, a click, the list…): if it is selected it
 * becomes the primary; if not, the selection follows it, unless it is pinned
 * or several are selected (so one can Tab to another and add it with
 * Shift+Space).
 */
export function focusPiece(id: number) {
  if (isSelected(id)) return makePrimary(id);
  if (getView().pinned || getDocument().selection.length > 1) return;
  select(id);
}

/** Announces how many are selected. */
export const announceCount = () => announce(t('announce.selectedCount', { n: getDocument().selection.length }), { key: 'selection', delay: 200 });

/**
 * Adds a piece to the selection or removes it (Shift or Ctrl + click,
 * Shift+Space). With `pinFirst`, if it is the only one selected because it got
 * the focus, it gets pinned instead of removed (so one can Tab on to another
 * and add it). Returns whether it ended up selected.
 */
export function toggleInSelection(id: number, { pinFirst = false } = {}) {
  const { selection } = getDocument();
  if (pinFirst && !getView().pinned && selection.length === 1 && selection[0] === id) {
    setView({ pinned: true });
    announce(t('announce.selectionPinned'));
    return true;
  }
  const next = toggled(selection, id);
  setSelection(next.selection, { pinned: true });
  const primary = primaryItem();
  if (primary) setView({ sheet: primary.sheet });
  announceCount();
  return next.on;
}

/** Marquee: the pieces it touches (added to the ones before with Shift or Ctrl). */
export function selectTouched(touched: readonly number[], additive: boolean) {
  setSelection(touchedSelection(getDocument().selection, touched, additive), { pinned: true });
  announceCount();
}

/** Shift+click and Shift+arrows in the list: those pieces, `primary` last. */
export function selectRange(ids: readonly number[], primary: number) {
  setSelection([...ids.filter((id) => id !== primary), primary], { pinned: ids.length > 1 });
  setView({ sheet: findItem(primary)!.sheet });
  announceCount();
}

/** Ctrl+A: every piece of the current sheet; if they already were, every piece of the document. */
export function selectAll() {
  const sheet = currentSheet();
  const onSheet = itemsOn(sheet).map((item) => item.id);
  const { selection, everything } = selectAllTarget(
    getDocument().selection,
    onSheet,
    getDocument().items.map((item) => item.id)
  );
  if (!selection.length) return announce(t('announce.noPieces'));
  setSelection(selection, { pinned: true });
  announce(everything ? t('announce.selectedAll', { n: selection.length }) : t('announce.selectedSheet', { n: selection.length, i: sheetIndex(sheet) + 1 }));
}

/**
 * «Seleccionar iguales»: every piece of the document from the same source
 * file as one of the selected ones (see group.sameSource: pages of one PDF
 * count; crop, scale, rotation and page don't matter), or the same QR code.
 */
export function selectSame() {
  const { selection, items, busy } = getDocument();
  if (busy) return;
  if (!selection.length) return announce(t('announce.needSelection'));
  const same = sameSource(
    items.map((item) => {
      const asset = getAsset(item.asset);
      return { id: item.id, src: asset.kind === 'qr' ? asset.signature : asset.src };
    }),
    new Set(selection)
  );
  setSelection(withPrimaryLast(same, selection.at(-1)), { pinned: true });
  const sheets = new Set(selectedItems().map((item) => item.sheet)).size;
  announce(sheets > 1 ? t('announce.selectedSameSheets', { n: same.length, sheets }) : t('announce.selectedSame', { n: same.length }));
}
