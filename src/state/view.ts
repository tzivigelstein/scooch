// View state: what is on screen but not part of the document or the undo history.

import { create } from 'zustand';
import type { DistributeMode } from '../core/group.js';

export interface NoticeAction {
  label: string;
  run: () => void;
}

/** The notice of the last action. `persist`: stays until the next action or until closed. */
export interface Flash {
  text: string;
  warn?: boolean;
  action?: NoticeAction | null;
  persist?: boolean;
}

export type DrawerName = 'pieces' | 'props';

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
  /** Which collapsible panel is open (only on narrow screens). */
  drawer: DrawerName | null;
  /** Position changes animate (arrange, undo…). */
  animating: boolean;
  /** The app is still restoring the last project. */
  loading: boolean;
}

export const useView = create<ViewState>()(() => ({
  sheet: 1,
  pinned: false,
  flash: null,
  busyText: '',
  alignTo: 'selection',
  distribute: 'gap',
  zoom: 1,
  drawer: null,
  animating: false,
  loading: true,
}));

export const getView = () => useView.getState();
export const setView = (patch: Partial<ViewState>) => useView.setState(patch);

let animationTimer: ReturnType<typeof setTimeout> | undefined;

/** Animates the next change of positions (arrange, undo…). */
export function animateNext() {
  setView({ animating: true });
  clearTimeout(animationTimer);
  animationTimer = setTimeout(() => setView({ animating: false }), 320);
}
