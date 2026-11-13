// The zoom control's menu (fit, width, a few levels). It loads on first use.

import { create } from 'zustand';
import { lazyContent } from '../lazy.ts';

export const useZoomMenu = create<{ at: { x: number; y: number } | null }>()(() => ({ at: null }));
export const ZoomMenuContent = lazyContent(() => import('./ZoomMenu.tsx'));

export function closeZoomMenu() {
  if (!useZoomMenu.getState().at) return;
  useZoomMenu.setState({ at: null });
  document.getElementById('zoom-level')?.focus({ preventScroll: true });
}
