// The properties panel's tabs. Selecting pieces shows «Pieza» and clearing
// the selection shows «Proyecto»; the person can switch at any time, and that
// choice stays until the selection changes again. Switching on its own never
// moves the focus; it is announced only when the keyboard caused it.

import { t } from '../../copy/index.ts';
import { announce, cancelAnnounce } from '../../components/feedback/announcer.ts';
import { getDocument, useDocument } from '../document.ts';
import { flushUi } from '../flush.ts';
import { getPrefs, setSectionOpen, type SectionName } from '../prefs.ts';
import { getView, setView, type PropsTab } from '../view.ts';

export const TAB_PANELS: Record<PropsTab, string> = { piece: 'props-piece', project: 'props-project' };

let lastInput: 'keyboard' | 'pointer' = 'pointer';

const sameSet = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((id) => b.includes(id));

/** The tab that fits the selection. */
export const tabFor = (selection: readonly number[]): PropsTab => (selection.length ? 'piece' : 'project');

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

/**
 * Opens a section of the tab showing, scrolls the panel to it and focuses the
 * control with id `focusId`.
 */
export function showSection(name: SectionName, focusId: string) {
  if (getPrefs().sections[name] === false) setSectionOpen(name, true);
  flushUi();
  const panel = document.getElementById('props-panel');
  const section = panel?.querySelector(`[data-section="${name}"]`);
  const tabs = panel?.querySelector('.props-tabs');
  if (panel && section && tabs) {
    const box = section.getBoundingClientRect();
    // The panel's top when the whole section shows from there (in the bottom
    // sheet, with its title and close button); otherwise the section's header
    // right under the tabs, which stick to the top.
    const fitsAtTop = panel.scrollTop + box.bottom <= panel.getBoundingClientRect().bottom;
    panel.scrollTop = fitsAtTop ? 0 : panel.scrollTop + box.top - tabs.getBoundingClientRect().bottom;
  }
  document.getElementById(focusId)?.focus({ preventScroll: true });
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
  if (lastInput === 'keyboard') announce(t(tab === 'piece' ? 'announce.propsPiece' : 'announce.propsProject'), { key: 'props-tab', delay: 400 });
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
