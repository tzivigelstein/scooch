// The rarely used dialogs' contents load on first use (or when the app is
// idle). Once loaded they render right away; until then, opening waits.

import { lazyContent } from '../lazy.ts';

export { whenLoaded } from '../lazy.ts';

export const ShortcutsContent = lazyContent(() => import('./ShortcutsDialog.tsx'));
export const PrefsContent = lazyContent(() => import('./PrefsDialog.tsx'));
export const ProjectsContent = lazyContent(() => import('./ProjectsDialog.tsx'));
export const PrintTipContent = lazyContent(() => import('./PrintTipDialog.tsx'));
export const PaletteContent = lazyContent(() => import('../palette/CommandPalette.tsx'));

/** Loads the dialogs most likely to be opened, without blocking anything. */
export function preloadDialogs() {
  void ShortcutsContent.preload();
  void PrefsContent.preload();
  void ProjectsContent.preload();
  void PrintTipContent.preload();
  void PaletteContent.preload();
}
