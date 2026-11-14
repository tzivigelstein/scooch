// Every value the person can change, and where it must live (checked by
// tests/state/settings-registry.test.ts against the stores and what each
// change writes):
//   document   saved with the project (its document; `undo`: in the undo history)
//   device     this browser's preference (localStorage, under `storage`)
//   session    lasts while the tab is open (lost on reload)
//   ephemeral  only while it is happening (a notice, a gesture, a load)
// A new setting goes here with its lifetime before it goes in a store.

import {
  CUSTOM_PAPER_STORAGE,
  DONATE_STORAGE,
  GRID_STORAGE,
  JOURNAL_PREFIX,
  LAST_PROJECT_STORAGE,
  PALETTE_STORAGE,
  PRINT_STORAGE,
  SAVINGS_STORAGE,
  SECTIONS_STORAGE,
  SINGLE_KEYS_STORAGE,
  THEME_STORAGE,
  UNIT_STORAGE,
  VIEW_STORAGE,
} from '../config.ts';

export type Lifetime = 'document' | 'device' | 'session' | 'ephemeral';

export interface Setting {
  /** The store that holds it (null: no store, only its storage). */
  store: 'document' | 'prefs' | 'view' | null;
  key: string;
  lives: Lifetime;
  /** Where a device setting is kept. */
  storage?: string;
  /** A document setting in the undo history. */
  undo?: boolean;
}

const doc = (key: string, undo = true): Setting => ({ store: 'document', key, lives: 'document', undo });
const device = (store: Setting['store'], key: string, storage: string): Setting => ({ store, key, lives: 'device', storage });

export const SETTINGS: readonly Setting[] = [
  // The project's document
  doc('sheets'),
  doc('items'),
  doc('paper'),
  doc('landscape'),
  doc('margin'),
  doc('gap'),
  doc('cuts'),
  doc('allowOverlap'),
  // «Rotación automática»: changing it moves nothing, so there is nothing to undo.
  doc('rotate', false),
  // The selection is in the undo steps (so undo selects what it brought back) but not saved.
  { store: 'document', key: 'selection', lives: 'session' },
  { store: 'document', key: 'busy', lives: 'ephemeral' },
  { store: 'document', key: 'canUndo', lives: 'ephemeral' },
  { store: 'document', key: 'canRedo', lives: 'ephemeral' },

  // This browser's preferences
  device('prefs', 'unit', UNIT_STORAGE),
  device('prefs', 'singleKeys', SINGLE_KEYS_STORAGE),
  device('prefs', 'grid', GRID_STORAGE),
  device('prefs', 'sections', SECTIONS_STORAGE),
  device('prefs', 'cutOptions', SECTIONS_STORAGE),
  device('prefs', 'printing', PRINT_STORAGE),
  device('prefs', 'theme', THEME_STORAGE),
  device('view', 'zoomMode', VIEW_STORAGE),
  device('view', 'zoom', VIEW_STORAGE),
  device('view', 'alignTo', VIEW_STORAGE),
  device('view', 'distribute', VIEW_STORAGE),
  device(null, 'customPaper', CUSTOM_PAPER_STORAGE),
  device(null, 'donateDismissed', DONATE_STORAGE),
  device(null, 'savings', SAVINGS_STORAGE),
  device(null, 'lastProject', LAST_PROJECT_STORAGE),
  device(null, 'journal', JOURNAL_PREFIX),
  device(null, 'paletteRecents', PALETTE_STORAGE),

  // The tab
  { store: 'view', key: 'sheet', lives: 'session' },
  { store: 'view', key: 'pinned', lives: 'session' },
  { store: 'view', key: 'drawer', lives: 'session' },
  { store: 'view', key: 'propsTab', lives: 'session' },
  { store: 'view', key: 'flash', lives: 'ephemeral' },
  { store: 'view', key: 'busyText', lives: 'ephemeral' },
  { store: 'view', key: 'animating', lives: 'ephemeral' },
  { store: 'view', key: 'loading', lives: 'ephemeral' },
  { store: 'view', key: 'editing', lives: 'ephemeral' },
  { store: 'view', key: 'cropping', lives: 'ephemeral' },
];
