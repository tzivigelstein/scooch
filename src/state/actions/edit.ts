// Undo, redo and arrange from the bar or the keyboard.

import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { redo, undo } from '../history.ts';
import { getView, animateNext } from '../view.ts';
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

/** Arranging twice in a row changes nothing: it is confirmed anyway. */
export function arrangeAll() {
  const result = arrange();
  if (result === 'same') announce(getView().flash?.text ?? '');
}
