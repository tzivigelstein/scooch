// General settings. Renaming the app only takes APP_NAME: the texts (src/copy)
// use it as {app}. The papers are in core/papers.js (stable ids; the names, in
// src/copy).

export const APP_NAME = 'Pliego';

export const MAX_ITEMS = 200;
export const MAX_UNDO = 50;
export const EPS = 0.01; // tolerance in mm for edges and overlaps
export const CROWD_LIMIT = 0.48; // largest size of what is added when there are pieces already
export const DRAG_THRESHOLD = 3; // px before a press counts as a drag

/** Narrow screens: no columns, icon-only bar, properties as a bottom sheet. */
export const NARROW_QUERY = '(max-width: 799.98px)';
/** From here down, the pieces panel collapses to a rail and opens as an overlay. */
export const LEFT_DRAWER_QUERY = '(max-width: 1099.98px)';
/** localStorage key of the collapsed sections of the properties panel. */
export const SECTIONS_STORAGE = 'panel-sections';

/** localStorage key of the «Atajos de 1 tecla» switch. */
export const SINGLE_KEYS_STORAGE = 'single-key-shortcuts';

/** Grid preferences (view, not document: outside the undo history). */
export const GRID_STORAGE = 'grid-preferences';
export const GRID_DEFAULTS = Object.freeze({ show: false, size: 1, snap: true });
export const GRID_MIN = 0.5;
export const GRID_MAX = 50;
export const PIECES_STORAGE = 'piece-preferences';
/** Unit of the lengths ('mm' | 'cm' | 'in'), chosen in «Preferencias». */
export const UNIT_STORAGE = 'unit-preference';
/** Last-moment journal of the open project (if the tab closed before saving finished). */
export const JOURNAL_STORAGE = 'project-journal';
/** Id of the last open project (to restore it on return). */
export const LAST_PROJECT_STORAGE = 'last-project';
/** Last custom paper ({w, h} in mm, as typed): a local preference. */
export const CUSTOM_PAPER_STORAGE = 'custom-paper';

// ---------- Donations ----------

/** Patreon page. Empty: the dialog never shows and exporting works as always. */
export const DONATE_URL = '';
/** 'session': only the first print/download of each page load; 'always': every one. */
export const DONATE_EVERY: 'session' | 'always' = 'session';
/** localStorage key of «No volver a mostrar en este dispositivo». */
export const DONATE_STORAGE = 'donate-dismissed';
// The texts of the dialog are in src/copy (donate).
