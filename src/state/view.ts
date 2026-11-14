// View state: what is on screen but not part of the document or the undo history.

import { create } from 'zustand';
import { VIEW_STORAGE } from '../config.ts';
import type { DistributeMode } from '../core/group.js';
import { parseViewPrefs, serializeViewPrefs } from '../core/storedprefs.js';
import { fromPercent, toPercent } from '../core/zoom.js';
import { storageJson, storageSet } from '../services/storage/local.ts';

export interface NoticeAction {
  label: string;
  run: () => void;
}

/**
 * The notice of the last action. `persist`: stays until the next action or
 * until closed. `info`: something to know, not an action that went well (it
 * doesn't get the check mark); `warn`: something went wrong.
 */
export interface Flash {
  text: string;
  warn?: boolean;
  info?: boolean;
  action?: NoticeAction | null;
  persist?: boolean;
}

export type DrawerName = 'pieces' | 'props';

/** How the zoom is chosen: fitting the sheet or its width (again when the window changes), or the person's. */
export type ZoomMode = 'fit' | 'width' | 'manual';

/** The tabs of the properties panel: the selection's properties or the project's settings. */
export type PropsTab = 'piece' | 'project';

export interface ViewState {
  /** The current sheet when no piece is selected. */
  sheet: number;
  /**
   * The selection is «pinned» (made with Shift or Ctrl, a marquee or Ctrl+A):
   * focusing another piece no longer replaces it.
   */
  pinned: boolean;
  flash: Flash | null;
  /** What the pill says while something loads. */
  busyText: string;
  /** Align against the selection or the printable area (with several pieces). */
  alignTo: 'selection' | 'sheet';
  distribute: DistributeMode;
  /** px per mm of the sheets on screen. */
  zoom: number;
  /** How the zoom is chosen (a fit follows the window; the person's stays). */
  zoomMode: ZoomMode;
  /** Which collapsible panel is open (only on narrow screens). */
  drawer: DrawerName | null;
  /** The properties panel's tab: follows the selection, and the person can switch it. */
  propsTab: PropsTab;
  /** Position changes animate (arrange, undo…). */
  animating: boolean;
  /** The app is still restoring the last project. */
  loading: boolean;
  /** A measurement field is being edited: problem notices wait until it is confirmed. */
  editing: boolean;
  /** The piece in crop mode, or null. */
  cropping: number | null;
}

// The zoom's mode (and percentage, when manual), «Alinear a» and «Distribuir
// con» are remembered in this browser; where the sheets are scrolled is not.
const remembered = parseViewPrefs(storageJson(VIEW_STORAGE));

export const useView = create<ViewState>()(() => ({
  sheet: 1,
  pinned: false,
  flash: null,
  busyText: '',
  alignTo: remembered.alignTo,
  distribute: remembered.distribute,
  zoom: fromPercent(remembered.zoomPct),
  zoomMode: remembered.zoomMode,
  drawer: null,
  propsTab: 'project',
  animating: false,
  loading: true,
  editing: false,
  cropping: null,
}));

export const getView = () => useView.getState();
export const setView = (patch: Partial<ViewState>) => useView.setState(patch);

// ---------- What this browser remembers ----------

/** Wheel and pinch change the zoom many times a second: it is written once they stop. */
const REMEMBER_DELAY = 400;
let rememberTimer: ReturnType<typeof setTimeout> | undefined;
let written = JSON.stringify(serializeViewPrefs(remembered));

/** Writes the remembered part of the view now, if it changed. */
export function rememberView() {
  clearTimeout(rememberTimer);
  rememberTimer = undefined;
  const { zoomMode, zoom, alignTo, distribute } = getView();
  // A fitted zoom is fitted again on start: only a manual one keeps its percentage.
  const next = JSON.stringify(serializeViewPrefs({ zoomMode, zoomPct: zoomMode === 'manual' ? toPercent(zoom) : 100, alignTo, distribute }));
  if (next === written) return;
  written = next;
  storageSet(VIEW_STORAGE, next);
}

useView.subscribe((state, previous) => {
  if (state.zoom === previous.zoom && state.zoomMode === previous.zoomMode && state.alignTo === previous.alignTo && state.distribute === previous.distribute) return;
  clearTimeout(rememberTimer);
  rememberTimer = setTimeout(rememberView, REMEMBER_DELAY);
});

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => rememberTimer !== undefined && rememberView());

let animationTimer: ReturnType<typeof setTimeout> | undefined;

/** Animates the next change of positions (arrange, undo…). */
export function animateNext() {
  setView({ animating: true });
  clearTimeout(animationTimer);
  animationTimer = setTimeout(() => setView({ animating: false }), 320);
}
