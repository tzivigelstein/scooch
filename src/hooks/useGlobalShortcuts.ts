// Keyboard shortcuts. Single-key ones never act while typing, inside a
// dialog or with Ctrl/Cmd/Alt involved, and they can be turned off (WCAG
// 2.1.4); the Ctrl ones, the Alt+Shift ones (align and distribute) and the
// arrows/Delete on a piece keep working.

import { useEffect } from 'react';
import type { AlignMode } from '../core/align.js';
import { stepFor } from '../core/units.js';
import { t } from '../copy/index.ts';
import { announce } from '../components/feedback/announcer.ts';
import { getDocument } from '../state/document.ts';
import { flushUi } from '../state/flush.ts';
import { endEdit } from '../state/history.ts';
import { getPrefs } from '../state/prefs.ts';
import { primaryItem } from '../state/selectors.ts';
import { openProjects, openShortcuts } from '../state/actions/dialogs.ts';
import { closeDrawer, drawerOf, isCollapsible, isDrawerOpen, revealPanel } from '../state/actions/drawers.ts';
import { arrangeAll, redoLast, undoLast } from '../state/actions/edit.ts';
import { openFiles } from '../state/actions/files.ts';
import { focusList, focusSheet, pieceNode, sheetNode } from '../state/actions/focus.ts';
import { exportPdf, printPdf } from '../state/actions/output.ts';
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
import { setSectionOpen } from '../state/prefs.ts';
import { isTyping } from './dom.ts';

const NUDGES: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
// Alt+Shift + key (by position, so it works with any layout and on a Mac).
const ALIGNS: Record<string, AlignMode> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom', KeyH: 'centerX', KeyV: 'centerY' };
const DISTRIBUTES: Record<string, 'x' | 'y'> = { KeyX: 'x', KeyY: 'y' };
// Single keys that act on the selection (see the piece keys below).
const PIECE_KEYS = new Set(['r', 'd', 'f', 'c', ']', 'm', 'i']);
const GROWS = new Set(['+', '=', '*']);
const SHRINKS = new Set(['-', '_', '−']);

const busy = () => getDocument().busy;
const hasSelection = () => getDocument().selection.length > 0 && !busy();

/** Before acting with the keyboard on a focused piece that isn't selected, it alone gets selected. */
function adopt(target: Element) {
  const node = target.closest<HTMLElement>('.piece');
  if (!node) return;
  const id = Number(node.dataset.id);
  if (!getDocument().selection.includes(id)) select(id);
}

/** M: to the first field of the Pieza section (X). */
function focusPieceFields() {
  if (!getDocument().selection.length) return announce(t('announce.needSelection'));
  revealPanel('props');
  flushUi();
  const field = document.getElementById('pos-x') as HTMLInputElement | null;
  if (!field || field.closest('[hidden]')) return;
  field.focus({ preventScroll: false });
  field.select();
}

/** H: to the first control of the Hoja section. */
function focusSheetSettings() {
  revealPanel('props');
  setSectionOpen('sheet', true);
  flushUi();
  document.getElementById('paper')?.focus();
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
  if (e.defaultPrevented || e.isComposing) return;
  const target = e.target instanceof Element ? e.target : document.body;
  const key = e.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const mod = e.ctrlKey || e.metaKey;
  const typing = isTyping(target);
  // Mod+O opens «Proyectos» (never the browser's file dialog).
  if (mod && !e.altKey && lower === 'o') {
    e.preventDefault();
    if (!target.closest('dialog')) void openProjects();
    return;
  }
  if (target.closest('dialog')) return; // the <dialog> handles Esc and Tab on its own

  // With Ctrl/Cmd: they always work (except undo while typing, which is the field's).
  if (mod && !e.altKey) {
    if (lower === 's' || lower === 'e') {
      e.preventDefault();
      void exportPdf();
    } else if (lower === 'p') {
      e.preventDefault(); // replaces printing the page with printing the real-size PDF
      void printPdf();
    } else if (!typing && lower === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoLast();
      else undoLast();
    } else if (!typing && lower === 'y') {
      e.preventDefault();
      redoLast();
    } else if (!typing && lower === 'a' && !e.shiftKey) {
      // Every piece of the current sheet; again, every piece of every sheet.
      e.preventDefault();
      if (!busy()) selectAll();
    }
    return; // the rest: the browser's
  }

  if (key === 'Escape') {
    if (escape(target)) e.preventDefault();
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
  const global: Record<string, () => void> = {
    a: arrangeAll,
    o: openFiles,
    h: focusSheetSettings,
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
    m: focusPieceFields,
  };
  if (pieceKeys[lower] && !e.repeat) {
    e.preventDefault();
    pieceKeys[lower]();
  }
}

// Releasing an arrow, + or − ends the step those keys share on a piece. A
// field's arrows belong to its own edit, which ends when it is confirmed.
function onKeyUp(e: KeyboardEvent) {
  if (isTyping(e.target as Element)) return;
  if (NUDGES[e.key] || GROWS.has(e.key) || SHRINKS.has(e.key)) endEdit();
}

/** Listens to the keyboard on the whole document. */
export function useGlobalShortcuts() {
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}

