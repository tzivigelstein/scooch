// The theme the page shows: the one chosen in «Preferencias» or, on
// «Automático», the system's, kept up to date when the choice, the system or
// another tab changes it. The script in index.html applies the stored one the
// same way before the first paint.

import { THEME_STORAGE } from '../config.ts';
import { resolveTheme, type Theme } from '../core/storedprefs.js';
import { readStoredTheme, usePrefs } from '../state/prefs.ts';

export const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The stylesheet's tokens (data-theme), native controls and scrollbars, and the mobile browser's bar. */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
  // Each theme-color keeps its color; only the one for the theme shown applies.
  for (const option of ['light', 'dark'] as const) document.getElementById(`theme-color-${option}`)?.setAttribute('media', option === theme ? 'all' : 'not all');
}

/** Starts following the choice, the system and the other tabs; returns how to stop. */
export function followTheme() {
  const system = window.matchMedia(DARK_QUERY);
  const apply = () => applyTheme(resolveTheme(usePrefs.getState().theme, system.matches));
  const fromOtherTab = (e: StorageEvent) => {
    // key null: another tab cleared this site's storage.
    if (e.key === THEME_STORAGE || e.key === null) readStoredTheme();
  };
  apply();
  const unsubscribe = usePrefs.subscribe((now, before) => {
    if (now.theme !== before.theme) apply();
  });
  system.addEventListener('change', apply);
  window.addEventListener('storage', fromOtherTab);
  return () => {
    unsubscribe();
    system.removeEventListener('change', apply);
    window.removeEventListener('storage', fromOtherTab);
  };
}
