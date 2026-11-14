// Undo, redo and arrange from the bar or the keyboard.

import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { redo, undo } from '../history.ts';
import { animateNext } from '../view.ts';
import { focusSheet } from './focus.ts';
import { arrange } from './layout.ts';

const onSheets = () => !!document.activeElement?.closest('#sheets');

export function undoLast() {
  const wasOnSheets = onSheets();
  if (!undo()) return;
  animateNext();
  if (wasOnSheets) focusSheet();
  announce(t('announce.undone'));
}

export function redoLast() {
  const wasOnSheets = onSheets();
  if (!redo()) return;
  animateNext();
  if (wasOnSheets) focusSheet();
  announce(t('announce.redone'));
}

/** «Acomodar» from the bar, the keyboard, a menu or a notice. */
export function arrangeAll() {
  arrange();
}
