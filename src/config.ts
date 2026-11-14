// General settings. Renaming the app only takes APP_NAME: the texts (src/copy)
// use it as {app}. The papers are in core/papers.js (stable ids; the names, in
// src/copy).

export const APP_NAME = 'Scooch';

export const MAX_ITEMS = 200;
export const MAX_UNDO = 50;
export const EPS = 0.01; // tolerance in mm for edges and overlaps
export const CROWD_LIMIT = 0.48; // largest size of what is added when there are pieces already
export const DRAG_THRESHOLD = 3; // px before a press counts as a drag
export const PINCH_THRESHOLD = 16; // px two fingers spread or close before they zoom (until then they only pan)

/** Narrow screens: no columns, icon-only bar, properties as a bottom sheet. */
export const NARROW_QUERY = '(max-width: 799.98px)';
/** From here down, the pieces panel collapses to a rail and opens as an overlay. */
export const LEFT_DRAWER_QUERY = '(max-width: 1099.98px)';

// ---------- Storage ----------

/**
 * Prefix of everything saved in this browser (IndexedDB, localStorage and
 * the tabs' channel). Apart from APP_NAME on purpose: renaming the app must
 * not lose anyone's projects; changing this needs a migration.
 */
export const STORAGE_NAMESPACE = 'scooch';
const stored = (name: string) => `${STORAGE_NAMESPACE}:${name}`;

/** The projects' IndexedDB database and the channel that coordinates tabs. */
export const PROJECTS_DB = STORAGE_NAMESPACE;
export const TABS_CHANNEL = `${STORAGE_NAMESPACE}-projects`;

/**
 * localStorage key of the collapsed sections of the properties panel and the
 * open «Más opciones» of the cut lines ({v: 2, sheet?, arrange?, cuts?, grid?,
 * cutOptions?}; version 1 had no `v` and no `cutOptions`).
 */
export const SECTIONS_STORAGE = stored('panel-sections');
/**
 * What this browser remembers of the view ({v: 1, zoomMode, zoomPct, alignTo,
 * distribute}): the zoom's mode and, when manual, its percentage (never where
 * the sheets are scrolled), «Alinear a» and «Distribuir con».
 */
export const VIEW_STORAGE = stored('view-preferences');
/** localStorage key of the «Atajos de 1 tecla» switch. */
export const SINGLE_KEYS_STORAGE = stored('single-key-shortcuts');
/** Grid preferences (view, not document: outside the undo history). */
export const GRID_STORAGE = stored('grid-preferences');
export const GRID_DEFAULTS = Object.freeze({ show: false, size: 1, snap: true });
export const GRID_MIN = 0.5;
export const GRID_MAX = 50;
export const PIECES_STORAGE = stored('piece-preferences');
/** Unit of the lengths ('mm' | 'cm' | 'in'), chosen in «Preferencias». */
export const UNIT_STORAGE = stored('unit-preference');
/**
 * Last-moment journal of an open project (if the tab closed before saving
 * finished): one key per project, «scooch:journal:<id>», so two tabs closing
 * at once don't overwrite each other ({v: 2, id, base, name, doc}).
 */
export const JOURNAL_PREFIX = stored('journal:');
/** Where the journal was before (one key for every tab, {id, at, name, doc}): read once, then removed. */
export const JOURNAL_STORAGE = stored('project-journal');
/** Id of the last open project (to restore it on return). */
export const LAST_PROJECT_STORAGE = stored('last-project');
/** Last custom paper ({w, h} in mm, as typed): a local preference. */
export const CUSTOM_PAPER_STORAGE = stored('custom-paper');
/** «No volver a mostrar» of the request for a donation (after printing): 'never'. */
export const DONATE_STORAGE = stored('donate-dismissed');
/** Whether the advice before printing and the summary after show ({v: 1, tip, summary}). */
export const PRINT_STORAGE = stored('print-preferences');
/** The sheets saved on this device and whose turn the next equivalent is ({v: 1, sheets, turn}); never sent anywhere. */
export const SAVINGS_STORAGE = stored('savings');

/**
 * Where those lived before the app was renamed (database «pliego», keys
 * without a prefix): moved once, on the first start (services/storage/migrate.ts).
 */
export const LEGACY_PROJECTS_DB = 'pliego';
/** Set once the legacy keys were first moved (any written later still are, see migrate.ts). */
export const MIGRATED_STORAGE = stored('migrated');
export const LEGACY_STORAGE_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'panel-sections': SECTIONS_STORAGE,
  'single-key-shortcuts': SINGLE_KEYS_STORAGE,
  'grid-preferences': GRID_STORAGE,
  'piece-preferences': PIECES_STORAGE,
  'unit-preference': UNIT_STORAGE,
  'project-journal': JOURNAL_STORAGE,
  'last-project': LAST_PROJECT_STORAGE,
  'custom-paper': CUSTOM_PAPER_STORAGE,
  'donate-dismissed': DONATE_STORAGE,
});

// ---------- Donations ----------

/** Patreon page. Empty: no request for a donation ever shows. */
export const DONATE_URL = '';
/** 'session': only after the first print/download of each page load; 'always': after every one. */
export const DONATE_EVERY: 'session' | 'always' = 'session';
// The texts of the request are in src/copy (donate).
