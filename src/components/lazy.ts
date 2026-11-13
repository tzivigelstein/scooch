// Parts of the interface that load on first use (or when the app is idle):
// once loaded they render right away; until then, showing them waits.

import { createElement, lazy, type ComponentType } from 'react';

export function lazyContent(load: () => Promise<{ default: ComponentType }>) {
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

/** Runs `show` once the content is loaded: right away if it already is. */
export function whenLoaded(content: { loaded: () => boolean; preload: () => Promise<unknown> }, show: () => void) {
  if (content.loaded()) show();
  else void content.preload().then(show);
}
