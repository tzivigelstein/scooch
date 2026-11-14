// The properties panel's tabs. Selecting pieces shows «Pieza» and clearing
// the selection shows «Hoja»; the person can switch at any time, and that
// choice stays until the selection changes again. Switching on its own never
// moves the focus; it is announced only when the keyboard caused it.

import { t } from '../../copy/index.ts';
import { announce, cancelAnnounce } from '../../components/feedback/announcer.ts';
import { getDocument, useDocument } from '../document.ts';
import { flushUi } from '../flush.ts';
import { getView, setView, type PropsTab } from '../view.ts';

export const TAB_PANELS: Record<PropsTab, string> = { piece: 'props-piece', sheet: 'props-sheet' };

let lastInput: 'keyboard' | 'pointer' = 'pointer';

const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id) => b.includes(id));

/** The tab that fits the selection. */
export const tabFor = (selection: readonly number[]): PropsTab => (selection.length ? 'piece' : 'sheet');

/** Shows a tab (the person's choice, or a shortcut's); with `focus`, the focus goes to the tab. */
export function showPropsTab(tab: PropsTab, { focus = false } = {}) {
  if (getView().propsTab !== tab) {
    setView({ propsTab: tab });
    cancelAnnounce('props-tab');
  }
  if (!focus) return;
  flushUi();
  document.getElementById(`props-tab-${tab}`)?.focus();
}

// Someone typing in a field of the tab that would hide keeps it: the field stays.
function typingIn(tab: PropsTab) {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement)) return false;
  return !!document.getElementById(TAB_PANELS[tab])?.contains(active);
}

function selectionChanged(selection: readonly number[]) {
  const tab = tabFor(selection);
  const current = getView().propsTab;
  if (tab === current || typingIn(current)) return;
  setView({ propsTab: tab });
  // A switch the pointer caused also drops a pending one the keyboard caused: it would name the other tab.
  if (lastInput === 'keyboard') announce(t(tab === 'piece' ? 'announce.propsPiece' : 'announce.propsSheet'), { key: 'props-tab', delay: 400 });
  else cancelAnnounce('props-tab');
}

/** Starts following the selection (returns the cleanup). */
export function followSelection() {
  setView({ propsTab: tabFor(getDocument().selection) });
  const keyboard = () => (lastInput = 'keyboard');
  const pointer = () => (lastInput = 'pointer');
  document.addEventListener('keydown', keyboard, true);
  document.addEventListener('pointerdown', pointer, true);
  const unsubscribe = useDocument.subscribe((state, previous) => {
    if (state.selection !== previous.selection && !sameSet(state.selection, previous.selection)) selectionChanged(state.selection);
  });
  return () => {
    document.removeEventListener('keydown', keyboard, true);
    document.removeEventListener('pointerdown', pointer, true);
    unsubscribe();
  };
}
