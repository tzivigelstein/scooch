// The keyboard shortcuts: the keys each control announces (aria-keyshortcuts)
// and shows in its tooltip, and the rows of the shortcuts dialog. The
// dispatcher is useGlobalShortcuts.

import { keyLabel, type CopyKey } from '../copy/index.ts';
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
  projects: { kbd: 'Mod+O', aria: 'Control+O Meta+O' },
  add: { kbd: 'O', aria: 'O', single: true },
  arrange: { kbd: 'A', aria: 'A', single: true },
  undo: { kbd: 'Mod+Z', aria: 'Control+Z Meta+Z' },
  redo: { kbd: 'Mod+Shift+Z', aria: 'Control+Shift+Z Meta+Shift+Z Control+Y' },
  help: { kbd: '?', aria: '?', single: true },
  download: { kbd: 'Mod+S', aria: 'Control+S Meta+S Control+E Meta+E' },
  print: { kbd: 'Mod+P', aria: 'Control+P Meta+P' },
  pieces: { kbd: 'P' },
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
  grid: { aria: 'G', single: true },
  crop: { kbd: 'K', aria: 'K', single: true },
  cropZoomIn: { kbd: 'Plus' },
  cropZoomOut: { kbd: 'Minus' },
  cropApply: { kbd: 'Enter' },
  cropCancel: { kbd: 'Escape' },
  tabPiece: { kbd: 'M', aria: 'M', single: true },
  tabSheet: { kbd: 'H', aria: 'H', single: true },
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

/** Rows of the shortcuts dialog: keys (keyLabel names), the action and whether it is a single-key one. */
export const SHORTCUT_ROWS: readonly [keys: readonly string[], action: CopyKey, single: boolean][] = [
  [['Tab', 'Shift+Tab'], 'shortcuts.rows.tab', false],
  [['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'], 'shortcuts.rows.move', false],
  [['Plus', 'Minus'], 'shortcuts.rows.scale', true],
  [['R', 'Shift+R'], 'shortcuts.rows.rotate', true],
  [['D'], 'shortcuts.rows.duplicate', true],
  [['Mod+D'], 'shortcuts.rows.duplicateMod', false],
  [['Mod+C', 'Mod+X', 'Mod+V'], 'shortcuts.rows.clipboard', false],
  [['Shift+F10', 'ContextMenu'], 'shortcuts.rows.menu', false],
  [['I'], 'shortcuts.rows.selectSame', true],
  [['K'], 'shortcuts.rows.crop', true],
  [['F'], 'shortcuts.rows.fit', true],
  [['C'], 'shortcuts.rows.center', true],
  [[']'], 'shortcuts.rows.front', true],
  [['Enter', 'Space'], 'shortcuts.rows.toolbar', false],
  [['Shift+Space', 'Shift+Enter'], 'shortcuts.rows.toggleSelect', false],
  [['Shift+Click', 'Mod+Click'], 'shortcuts.rows.clickSelect', false],
  [['Mod+A'], 'shortcuts.rows.selectAll', false],
  [['Alt+Shift+ArrowLeft', 'Alt+Shift+ArrowRight'], 'shortcuts.rows.alignSides', false],
  [['Alt+Shift+ArrowUp', 'Alt+Shift+ArrowDown'], 'shortcuts.rows.alignEnds', false],
  [['Alt+Shift+H', 'Alt+Shift+V'], 'shortcuts.rows.alignCenter', false],
  [['Alt+Shift+X', 'Alt+Shift+Y'], 'shortcuts.rows.distribute', false],
  [['PageUp', 'PageDown'], 'shortcuts.rows.pages', false],
  [['Shift+PageUp', 'Shift+PageDown'], 'shortcuts.rows.sendPage', false],
  [['Delete', 'Backspace'], 'shortcuts.rows.remove', false],
  [['M'], 'shortcuts.rows.measures', true],
  [['H'], 'shortcuts.rows.sheet', true],
  [['P'], 'shortcuts.rows.list', true],
  [['A'], 'shortcuts.rows.arrange', true],
  [['O'], 'shortcuts.rows.add', true],
  [['L'], 'shortcuts.rows.orientation', true],
  [['G'], 'shortcuts.rows.grid', true],
  [['Mod+Z'], 'shortcuts.rows.undo', false],
  [['Mod+Shift+Z', 'Control+Y'], 'shortcuts.rows.redo', false],
  [['Mod+P'], 'shortcuts.rows.print', false],
  [['Mod+S', 'Mod+E'], 'shortcuts.rows.download', false],
  [['Mod+O'], 'shortcuts.rows.projects', false],
  [['Escape'], 'shortcuts.rows.escape', false],
  [['?'], 'shortcuts.rows.help', true],
];
