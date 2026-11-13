// Moving the focus after an action: to the selected piece, the sheet or the list.

import { flushUi } from '../flush.ts';
import { getDocument } from '../document.ts';
import { currentSheet, primaryItem } from '../selectors.ts';

export const pieceNode = (id: number | undefined) =>
  id === undefined ? null : document.querySelector<HTMLElement>(`#sheets .piece[data-id="${id}"]`);

/** The sheet element (role="group", focusable with tabindex -1). */
export const sheetNode = (id: number | undefined) =>
  id === undefined ? null : document.querySelector<HTMLElement>(`#sheets .page[data-sheet="${id}"] .sheet`);

/**
 * Focuses the selected piece; without one, the drop zone or the current
 * sheet. `flush`: the DOM catches up first (false inside React's commit).
 */
export function focusSheet({ flush = true } = {}) {
  if (flush) flushUi();
  const node = pieceNode(primaryItem()?.id);
  if (node) return node.focus({ preventScroll: true });
  const empty = document.getElementById('empty') as HTMLButtonElement | null;
  if (!getDocument().items.length && empty && !empty.disabled) return empty.focus({ preventScroll: true });
  sheetNode(currentSheet())?.focus({ preventScroll: true });
}

/** Focuses a sheet (after the DOM caught up). */
export function focusSheetNode(id: number) {
  flushUi();
  sheetNode(id)?.focus({ preventScroll: true });
}

/** The list row to focus (the selected one or the first); null when the list is empty. */
export function listFocusTarget() {
  const list = document.getElementById('piece-list');
  if (!list || list.hidden) return null;
  const primary = getDocument().selection.at(-1);
  return (
    (primary !== undefined ? list.querySelector<HTMLElement>(`[role="option"][data-id="${primary}"]`) : null) ??
    list.querySelector<HTMLElement>('[role="option"]')
  );
}

/** Focuses the selected row of the list (or the first). False when the list is empty. */
export function focusList({ flush = true } = {}) {
  if (flush) flushUi();
  const row = listFocusTarget();
  if (!row) return false;
  row.focus();
  return true;
}
