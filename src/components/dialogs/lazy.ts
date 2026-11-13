// The rarely used dialogs' contents load on first use (or when the app is
// idle). Once loaded they render right away; until then, opening waits.

import { createElement, lazy, type ComponentType } from 'react';

function lazyContent(load: () => Promise<{ default: ComponentType }>) {
  let loaded: ComponentType | null = null;
  let pending: Promise<unknown> | null = null;
  const preload = () =>
    (pending ??= load().then(
      (module) => {
        loaded = module.default;
        return module;
      },
      (err) => {
        pending = null;
        throw err;
      }
    )) as Promise<{ default: ComponentType }>;
  const Lazy = lazy(preload);
  const Content = () => createElement(loaded ?? Lazy);
  return Object.assign(Content, { preload, loaded: () => loaded !== null });
}

export const ShortcutsContent = lazyContent(() => import('./ShortcutsDialog.tsx'));
export const PrefsContent = lazyContent(() => import('./PrefsDialog.tsx'));
export const ProjectsContent = lazyContent(() => import('./ProjectsDialog.tsx'));
export const DonateContent = lazyContent(() => import('./DonateDialog.tsx'));

/** Loads the dialogs most likely to be opened, without blocking anything. */
export function preloadDialogs() {
  void ShortcutsContent.preload();
  void PrefsContent.preload();
  void ProjectsContent.preload();
}

/** Runs `show` once the content is loaded: right away if it already is. */
export function whenLoaded(content: { loaded: () => boolean; preload: () => Promise<unknown> }, show: () => void) {
  if (content.loaded()) show();
  else void content.preload().then(show);
}
