// Opening the context menus: of the selected pieces or of an empty sheet
// (right click, Shift+F10 or the Menu key, a long press). The menu itself
// (ContextMenu.tsx) loads on first use.

import { create } from 'zustand';
import { getDocument } from '../../state/document.ts';
import { flushUi } from '../../state/flush.ts';
import { currentSheet, findItem, sheetIndex } from '../../state/selectors.ts';
import { setView } from '../../state/view.ts';
import { pieceNode, sheetNode } from '../../state/actions/focus.ts';
import { select } from '../../state/actions/selection.ts';
import { lazyContent, whenLoaded } from '../lazy.ts';

export interface MenuRequest {
  kind: 'piece' | 'sheet';
  sheet: number;
  x: number;
  y: number;
  /** Where the focus goes back when it closes. */
  returnTo: HTMLElement | null;
}

export const useContextMenu = create<{ request: MenuRequest | null }>()(() => ({ request: null }));

export const ContextMenuContent = lazyContent(() => import('./ContextMenu.tsx'));

let openedAt = 0;

export const isMenuOpen = () => useContextMenu.getState().request !== null;

/** Closes the menu; the focus goes back to where it was opened. */
export function closeContextMenu({ restore = true } = {}) {
  const request = useContextMenu.getState().request;
  if (!request) return;
  useContextMenu.setState({ request: null });
  if (restore && request.returnTo?.isConnected) request.returnTo.focus({ preventScroll: true });
}

/**
 * The menu for what is at `target` (a piece: it gets selected unless it
 * already is; anything else on a sheet: that sheet, with nothing selected),
 * at window point (x, y).
 */
export function openContextMenuAt(target: Element, x: number, y: number) {
  if (getDocument().busy) return;
  // The Menu key fires a «contextmenu» right after its keydown: one menu.
  if (performance.now() - openedAt < 400 && isMenuOpen()) return;
  openedAt = performance.now();
  const node = target.closest<HTMLElement>('#sheets .piece');
  let request: MenuRequest;
  if (node) {
    const id = Number(node.dataset.id);
    const item = findItem(id);
    if (!item) return;
    if (!getDocument().selection.includes(id)) select(id);
    flushUi();
    const piece = pieceNode(id);
    piece?.focus({ preventScroll: true });
    request = { kind: 'piece', sheet: item.sheet, x, y, returnTo: piece };
  } else {
    const page = target.closest<HTMLElement>('#sheets .page');
    const sheet = page && sheetIndex(Number(page.dataset.sheet)) >= 0 ? Number(page.dataset.sheet) : currentSheet();
    setView({ sheet });
    if (getDocument().selection.length) select(null);
    flushUi();
    const back = document.activeElement?.closest('#sheets') ? (document.activeElement as HTMLElement) : sheetNode(sheet);
    request = { kind: 'sheet', sheet, x, y, returnTo: back };
  }
  whenLoaded(ContextMenuContent, () => useContextMenu.setState({ request }));
}

/** From the keyboard (Shift+F10, the Menu key): the menu of the focused piece or sheet, next to it. */
export function openContextMenuFromKeyboard(target: Element) {
  const r = target.getBoundingClientRect();
  openContextMenuAt(target, Math.round(r.left + Math.min(16, r.width / 2)), Math.round(r.top + Math.min(16, r.height / 2)));
}

/** Loads the menu ahead of time (when the app is idle). */
export const preloadContextMenu = () => void ContextMenuContent.preload();
