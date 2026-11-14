// Keyboard shortcuts. Single-key ones never act while typing, inside a
// dialog or with Ctrl/Cmd/Alt involved, and they can be turned off (WCAG
// 2.1.4); the Ctrl ones, the Alt+Shift ones (align and distribute) and the
// arrows/Delete on a piece keep working. While a dialog is open, none acts.

import { useEffect } from 'react';
import type { AlignMode } from '../core/align.js';
import { stepFor } from '../core/units.js';
import { t } from '../copy/index.ts';
import { announce } from '../components/feedback/announcer.ts';
import { getDocument } from '../state/document.ts';
import type { PropsTab } from '../state/view.ts';
import { flushUi } from '../state/flush.ts';
import { endEdit } from '../state/history.ts';
import { getPrefs } from '../state/prefs.ts';
import { currentSheet, primaryItem } from '../state/selectors.ts';
import { openProjects, openShortcuts } from '../state/actions/dialogs.ts';
import { closeDrawer, drawerOf, isCollapsible, isDrawerOpen, revealPanel } from '../state/actions/drawers.ts';
import { arrangeAll, redoLast, undoLast } from '../state/actions/edit.ts';
import { openFiles } from '../state/actions/files.ts';
import { explainSaving } from '../state/actions/projects.ts';
import { focusList, focusSheet, pieceNode, sheetNode } from '../state/actions/focus.ts';
import { exportPdf, printPdf } from '../state/actions/output.ts';
import { showPropsTab } from '../state/actions/panels.ts';
import { startCrop } from '../components/canvas/cropMode.ts';
import { openContextMenuFromKeyboard } from '../components/canvas/contextMenu.ts';
import { fitSheet, stepZoom } from '../components/canvas/viewport.ts';
import { cancelGesture, holdSpace, isPointerOnCanvas, isSpaceHeld as space, releaseSpace } from './useCanvasGestures.ts';
import {
  alignSelection,
  bringToFront,
  center,
  distributeSelection,
  duplicate,
  fit,
  nudge,
  remove,
  rotate,
  scaleBy,
} from '../state/actions/pieces.ts';
import { select, selectAll, selectSame, toggleInSelection } from '../state/actions/selection.ts';
import { gotoSheet, sendToSheet, setGridVisible, setOrientation } from '../state/actions/sheets.ts';
import { isTyping } from './dom.ts';

const NUDGES: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
// Alt+Shift + key (by position, so it works with any layout and on a Mac).
const ALIGNS: Record<string, AlignMode> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom', KeyH: 'centerX', KeyV: 'centerY' };
const DISTRIBUTES: Record<string, 'x' | 'y'> = { KeyX: 'x', KeyY: 'y' };
// Single keys that act on the selection (see the piece keys below).
const PIECE_KEYS = new Set(['r', 'd', 'f', 'c', ']', 'i', 'k']);
const GROWS = new Set(['+', '=', '*']);
// Ctrl/⌘ + these zoom the canvas in or out (Ctrl/⌘ 0 stays the browser's).
const ZOOM_KEYS: Record<string, 1 | -1> = { '+': 1, '=': 1, '-': -1, _: -1 };
// A Space press that started a pan over the canvas, on this piece (it acts on release if it didn't pan).
let spaceOn: HTMLElement | null = null;
const SHRINKS = new Set(['-', '_', '−']);

// Ctrl/⌘ + these are browser commands the app replaces with its own (open a
// file, print the page, save the page, the address bar, a bookmark): they
// never reach the browser, also where the app's shortcut does nothing (a
// dialog, a menu, a text field). Ctrl/⌘ + Shift + D stays the browser's.
const CLAIMED = new Set(['o', 'p', 's', 'e', 'd']);

const isClaimed = (e: KeyboardEvent) => {
  const lower = e.key.toLowerCase();
  return (e.ctrlKey || e.metaKey) && !e.altKey && CLAIMED.has(lower) && !(lower === 'd' && e.shiftKey);
};

/** Captured on the window, before any handler can stop the key on its way to the document. */
function holdBack(e: KeyboardEvent) {
  if (isClaimed(e)) e.preventDefault();
}

const busy = () => getDocument().busy;
const hasSelection = () => getDocument().selection.length > 0 && !busy();

/** Before acting with the keyboard on a focused piece that isn't selected, it alone gets selected. */
function adopt(target: Element) {
  const node = target.closest<HTMLElement>('.piece');
  if (!node) return;
  const id = Number(node.dataset.id);
  if (!getDocument().selection.includes(id)) select(id);
}

/**
 * M / H: the Pieza or Hojas tab of Propiedades (opening it where it is
 * collapsed), with the focus on the tab itself: H and M keep switching, the
 * arrows too, Tab goes into the tab's controls and Esc back to the canvas.
 * Without a selection, Pieza shows its hint.
 */
function focusPropsTab(tab: PropsTab) {
  const active = document.activeElement;
  const back = active?.closest('#sheets') ? active : (pieceNode(primaryItem()?.id) ?? sheetNode(currentSheet()));
  revealPanel('props', back);
  showPropsTab(tab, { focus: true });
}

/** P: to the list of pieces (or to the add zone when it is empty). */
function focusPieces() {
  revealPanel('pieces');
  if (!focusList()) document.getElementById('addzone')?.focus();
}

/** Enter on a piece: to its toolbar (the button with the roving tab stop). */
function focusToolbar() {
  const bar = document.getElementById('piecebar');
  (bar?.querySelector<HTMLElement>('button[tabindex="0"]') ?? bar?.querySelector<HTMLElement>('button'))?.focus();
}

/**
 * Esc: from a panel, an overlay panel closes, otherwise the focus goes back to
 * the piece; an open panel closes; from the toolbar, back to the piece; on the
 * sheet, the selection is cleared. Returns whether it did something.
 */
function escape(target: Element) {
  const panel = drawerOf(target);
  if (panel) {
    if (isCollapsible(panel) && isDrawerOpen(panel)) closeDrawer(panel);
    else focusSheet();
    return true;
  }
  for (const name of ['pieces', 'props'] as const) {
    if (isDrawerOpen(name)) {
      closeDrawer(name, { focus: 'none' });
      return true;
    }
  }
  if (target.closest('#piecebar') && pieceNode(primaryItem()?.id)) {
    focusSheet();
    return true;
  }
  if (!getDocument().selection.length) return false;
  const onPiece = !!target.closest('.piece');
  const sheet = primaryItem()?.sheet;
  select(null);
  if (onPiece && sheet !== undefined) sheetNode(sheet)?.focus({ preventScroll: true });
  announce(t('announce.deselected'));
  return true;
}

function onKeyDown(e: KeyboardEvent) {
  if ((e.defaultPrevented && !isClaimed(e)) || e.isComposing) return;
  const target = e.target instanceof Element ? e.target : document.body;
  // With a dialog open (focused in it or not, whichever it is), nothing here acts:
  // the <dialog> handles Esc and Tab on its own, and the claimed keys were held back.
  if (target.closest('dialog') || document.querySelector('dialog[open]')) return;
  const key = e.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const mod = e.ctrlKey || e.metaKey;
  const typing = isTyping(target);

  // With Ctrl/Cmd: they always work (except undo while typing, which is the field's).
  // The claimed ones (O, P, S, E, D) never reach the browser (holdBack).
  if (mod && !e.altKey) {
    if (lower === 'o') {
      void openProjects();
    } else if (lower === 'e' || (lower === 's' && e.shiftKey)) {
      void exportPdf();
    } else if (lower === 's') {
      // Changes save themselves, and it says so.
      if (!e.repeat) explainSaving();
    } else if (lower === 'p') {
      // The real-size PDF, instead of the page.
      void printPdf();
    } else if (!typing && lower === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoLast();
      else undoLast();
    } else if (!typing && lower === 'y') {
      e.preventDefault();
      redoLast();
    } else if (ZOOM_KEYS[key] && (isPointerOnCanvas() || !!target.closest('#canvas')) && !typing) {
      // With the pointer or the focus on the canvas, Ctrl/⌘ + / − zoom the sheets, not the page.
      e.preventDefault();
      stepZoom(ZOOM_KEYS[key]);
    } else if (!typing && lower === 'd' && !e.shiftKey) {
      if (target.classList.contains('piece')) adopt(target);
      if (hasSelection() && !e.repeat) duplicate(1, { focus: true });
    } else if (!typing && lower === 'a' && !e.shiftKey) {
      // Every piece of the current sheet; again, every piece of every sheet.
      e.preventDefault();
      if (!busy()) selectAll();
    }
    return; // the rest: the browser's
  }

  if (key === 'Escape') {
    if (cancelGesture() || escape(target)) e.preventDefault();
    return;
  }

  // Shift+F10 or the Menu key on a piece or a sheet: its context menu.
  if ((key === 'ContextMenu' || (key === 'F10' && e.shiftKey)) && !mod && !e.altKey && target.closest('#sheets') && !typing) {
    e.preventDefault();
    openContextMenuFromKeyboard(target);
    return;
  }
  if (typing || mod) return;

  const onPiece = target.classList.contains('piece');

  // Align and distribute the selection: Alt+Shift + arrows, H, V, X or Y.
  if (e.altKey && e.shiftKey && (ALIGNS[e.code] || DISTRIBUTES[e.code])) {
    e.preventDefault();
    if (e.repeat) return;
    if (onPiece) adopt(target);
    if (ALIGNS[e.code]) alignSelection(ALIGNS[e.code]);
    else distributeSelection(DISTRIBUTES[e.code]);
    return;
  }

  // On the sheets: Page Up / Page Down move the focus from sheet to sheet; with
  // Shift, the focused piece moves to the previous or next sheet.
  if ((key === 'PageDown' || key === 'PageUp') && !e.altKey && target.closest('#stage')) {
    e.preventDefault();
    const dir = key === 'PageDown' ? 1 : -1;
    if (e.shiftKey) {
      if (onPiece && !e.repeat) sendToSheet(dir);
    } else gotoSheet(dir);
    return;
  }

  // On a focused piece: arrows (steps of the chosen unit: Alt fine, Shift
  // coarse), Delete and Enter.
  if (onPiece && NUDGES[key] && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    adopt(target);
    const step = stepFor(getPrefs().unit, e.altKey ? 'fine' : e.shiftKey ? 'coarse' : 'normal').mm;
    const [dx, dy] = NUDGES[key];
    nudge(dx * step, dy * step);
    return;
  }
  if (e.altKey) return;
  if (onPiece && (key === 'Delete' || key === 'Backspace')) {
    e.preventDefault();
    adopt(target);
    if (!e.repeat) remove({ focus: true });
    return;
  }
  // Space held with the pointer over the canvas: dragging pans the sheets. On
  // a piece, Space still goes to its toolbar when released without panning;
  // buttons keep their own Space.
  const panTarget = target === document.body || onPiece || target.classList.contains('sheet');
  if (key === ' ' && !e.shiftKey && panTarget && (space() || (!e.repeat && holdSpace()))) {
    e.preventDefault();
    if (!e.repeat) spaceOn = onPiece ? (target as HTMLElement) : null;
    return;
  }
  // Shift+Space or Shift+Enter: adds the focused piece to the selection or removes it.
  if (onPiece && e.shiftKey && (key === 'Enter' || key === ' ')) {
    e.preventDefault();
    if (!e.repeat && !busy()) toggleInSelection(Number((target as HTMLElement).dataset.id), { pinFirst: true });
    return;
  }
  // The piece is a button: Enter or Space «activate» it (to its toolbar).
  if (onPiece && (key === 'Enter' || key === ' ')) {
    e.preventDefault();
    adopt(target);
    if (!e.repeat) {
      flushUi();
      focusToolbar();
    }
    return;
  }

  // Single keys (they can be turned off). Space has nothing global: only the
  // focused control's own behavior.
  if (!getPrefs().singleKeys) return;
  if (key === '?') {
    e.preventDefault();
    openShortcuts();
    return;
  }
  // Shift+1: fit the sheet; Shift+2: its width (by position: any layout).
  if (e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2') && !e.repeat) {
    e.preventDefault();
    fitSheet(e.code === 'Digit1' ? 'fit' : 'width', currentSheet());
    return;
  }
  const global: Record<string, () => void> = {
    a: arrangeAll,
    o: openFiles,
    h: () => focusPropsTab('sheet'),
    m: () => {
      if (onPiece) adopt(target);
      focusPropsTab('piece');
    },
    l: () => setOrientation(!getDocument().landscape),
    g: () => setGridVisible(!getPrefs().grid.show),
    p: focusPieces,
  };
  if (global[lower] && !e.repeat) {
    e.preventDefault();
    global[lower]();
    return;
  }
  const pieceKey = GROWS.has(key) || SHRINKS.has(key) || PIECE_KEYS.has(lower);
  if (onPiece && pieceKey) adopt(target);
  if (!hasSelection()) return;
  if (GROWS.has(key) || SHRINKS.has(key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    scaleBy(GROWS.has(key) ? step : -step);
    return;
  }
  const pieceKeys: Record<string, () => void> = {
    r: () => rotate(e.shiftKey ? -1 : 1, { focus: true }),
    d: () => duplicate(1, { focus: true }),
    i: selectSame,
    f: () => fit({ focus: true }),
    c: () => center({ focus: true }),
    ']': () => bringToFront({ focus: true }),
    k: () => startCrop(),
  };
  if (pieceKeys[lower] && !e.repeat) {
    e.preventDefault();
    pieceKeys[lower]();
  }
}

// Releasing an arrow, + or − ends the step those keys share on a piece. A
// field's arrows belong to its own edit, which ends when it is confirmed.
function onKeyUp(e: KeyboardEvent) {
  if (e.key === ' ') {
    const piece = spaceOn;
    spaceOn = null;
    if (!releaseSpace() && piece?.isConnected && document.activeElement === piece) {
      adopt(piece);
      flushUi();
      focusToolbar();
    }
  }
  if (isTyping(e.target as Element)) return;
  if (NUDGES[e.key] || GROWS.has(e.key) || SHRINKS.has(e.key)) endEdit();
}

/** Listens to the keyboard on the whole document. */
export function useGlobalShortcuts() {
  useEffect(() => {
    // Leaving the window with Space held (its keyup goes elsewhere): no longer held.
    const blur = () => {
      spaceOn = null;
      releaseSpace();
    };
    window.addEventListener('keydown', holdBack, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', holdBack, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', blur);
    };
  }, []);
}

