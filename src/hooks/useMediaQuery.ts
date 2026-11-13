import { useSyncExternalStore } from 'react';

/** Whether a media query matches, kept up to date. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (changed) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', changed);
      return () => list.removeEventListener('change', changed);
    },
    () => window.matchMedia(query).matches
  );
}

export const matches = (query: string) => window.matchMedia(query).matches;
