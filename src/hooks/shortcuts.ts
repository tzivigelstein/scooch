// The keyboard shortcuts: the keys each control announces (aria-keyshortcuts)
// and shows in its tooltip. The commands (state/commands.ts) name theirs from
// here, and the shortcuts dialog shows them. The dispatcher is
// useGlobalShortcuts.

import { keyLabel } from '../copy/index.ts';
import { usePrefs } from '../state/prefs.ts';

export interface ShortcutKeys {
  /** Keys shown in the tooltip (keyLabel names, separated by spaces). */
  kbd?: string;
  /** Value of aria-keyshortcuts. */
  aria?: string;
  /** A single-key shortcut: it can be turned off in «Preferencias». */
  single?: boolean;
}

export const SHORTCUTS = {
  palette: { kbd: 'Mod+K', aria: 'Control+K Meta+K' },
  projects: { kbd: 'Mod+O', aria: 'Control+O Meta+O' },
  add: { kbd: 'O', aria: 'O', single: true },
  arrange: { kbd: 'A', aria: 'A', single: true },
  undo: { kbd: 'Mod+Z', aria: 'Control+Z Meta+Z' },
  redo: { kbd: 'Mod+Shift+Z', aria: 'Control+Shift+Z Meta+Shift+Z Control+Y' },
  help: { kbd: '?', aria: '?', single: true },
  download: { kbd: 'Mod+E', aria: 'Control+E Meta+E Control+Shift+S Meta+Shift+S' },
  print: { kbd: 'Mod+P', aria: 'Control+P Meta+P' },
  pieces: { kbd: 'P', single: true },
  selectAll: { kbd: 'Mod+A', aria: 'Control+A Meta+A' },
  // Other keys that do the same as one above, shown only in the shortcuts dialog.
  redoAlt: { kbd: 'Control+Y' },
  downloadAlt: { kbd: 'Mod+Shift+S' },
  removeAlt: { kbd: 'Backspace' },
  duplicateKey: { kbd: 'D', single: true },
  closePanel: { kbd: 'Escape' },
  drop: { aria: 'O', single: true },
  rotateLeft: { kbd: 'Shift+R', aria: 'Shift+R', single: true },
  rotateRight: { kbd: 'R', aria: 'R', single: true },
  duplicate: { kbd: 'Mod+D', aria: 'Control+D Meta+D' },
  copy: { kbd: 'Mod+C', aria: 'Control+C Meta+C' },
  cut: { kbd: 'Mod+X', aria: 'Control+X Meta+X' },
  paste: { kbd: 'Mod+V', aria: 'Control+V Meta+V' },
  remove: { kbd: 'Delete', aria: 'Delete Backspace' },
  fit: { kbd: 'F', aria: 'F', single: true },
  center: { kbd: 'C', aria: 'C', single: true },
  front: { kbd: ']', aria: ']', single: true },
  alignLeft: { kbd: 'Alt+Shift+ArrowLeft', aria: 'Alt+Shift+ArrowLeft' },
  alignCenterX: { kbd: 'Alt+Shift+H', aria: 'Alt+Shift+H' },
  alignRight: { kbd: 'Alt+Shift+ArrowRight', aria: 'Alt+Shift+ArrowRight' },
  alignTop: { kbd: 'Alt+Shift+ArrowUp', aria: 'Alt+Shift+ArrowUp' },
  alignCenterY: { kbd: 'Alt+Shift+V', aria: 'Alt+Shift+V' },
  alignBottom: { kbd: 'Alt+Shift+ArrowDown', aria: 'Alt+Shift+ArrowDown' },
  distributeX: { kbd: 'Alt+Shift+X', aria: 'Alt+Shift+X' },
  distributeY: { kbd: 'Alt+Shift+Y', aria: 'Alt+Shift+Y' },
  selectSame: { kbd: 'I', aria: 'I', single: true },
  landscape: { kbd: 'L', aria: 'L', single: true },
  grid: { kbd: 'G', aria: 'G', single: true },
  crop: { kbd: 'K', aria: 'K', single: true },
  cropZoomIn: { kbd: 'Plus' },
  cropZoomOut: { kbd: 'Minus' },
  cropApply: { kbd: 'Enter' },
  cropCancel: { kbd: 'Escape' },
  zoomIn: { kbd: 'Mod+Plus', aria: 'Control+Plus Meta+Plus Control+= Meta+=' },
  zoomOut: { kbd: 'Mod+Minus', aria: 'Control+- Meta+-' },
  fitSheet: { kbd: 'Shift+1', aria: 'Shift+1', single: true },
  fitWidth: { kbd: 'Shift+2', aria: 'Shift+2', single: true },
  tabPiece: { kbd: 'M', aria: 'M', single: true },
  tabProject: { kbd: 'H', aria: 'H', single: true },
} satisfies Record<string, ShortcutKeys>;

export type ShortcutName = keyof typeof SHORTCUTS;

/** The attributes a control with a shortcut gets (data-kbd, aria-keyshortcuts, data-single). */
export function shortcutAttributes(name: ShortcutName, singleKeys: boolean) {
  const keys: ShortcutKeys = SHORTCUTS[name];
  return {
    'data-kbd': keys.kbd?.split(' ').map(keyLabel).join(' '),
    'aria-keyshortcuts': keys.aria && (!keys.single || singleKeys) ? keys.aria : undefined,
    'data-single': keys.single ? '' : undefined,
  };
}

/** shortcutAttributes with the current «Atajos de 1 tecla» preference. */
export function useShortcut(name: ShortcutName) {
  return shortcutAttributes(name, usePrefs((s) => s.singleKeys));
}
