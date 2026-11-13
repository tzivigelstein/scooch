// Preferences of this browser (localStorage): outside the document and the undo history.

import { create } from 'zustand';
import {
  CUSTOM_PAPER_STORAGE,
  GRID_DEFAULTS,
  GRID_MAX,
  GRID_MIN,
  GRID_STORAGE,
  PIECES_STORAGE,
  SECTIONS_STORAGE,
  SINGLE_KEYS_STORAGE,
  UNIT_STORAGE,
} from '../config.ts';
import { isUnit, type Unit } from '../core/units.js';
import { clamp } from '../core/util.ts';
import { storageGet, storageJson, storageSet } from '../services/storage/local.ts';

export interface GridPrefs {
  show: boolean;
  size: number;
  snap: boolean;
}

export type SectionName = 'sheet' | 'arrange' | 'cuts' | 'grid';

export interface PrefsState {
  /** Unit to show and type lengths in; the document is always in mm. */
  unit: Unit;
  /** Single-key shortcuts (WCAG 2.1.4: they can be turned off). */
  singleKeys: boolean;
  grid: GridPrefs;
  allowOverlap: boolean;
  /** Collapsed sections of the properties panel (missing: open). */
  sections: Partial<Record<SectionName, boolean>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function loadGrid(): GridPrefs {
  const saved = storageJson(GRID_STORAGE);
  const record = isRecord(saved) ? saved : {};
  const size = Number(record.size);
  return {
    show: typeof record.show === 'boolean' ? record.show : GRID_DEFAULTS.show,
    size: Number.isFinite(size) ? clamp(size, GRID_MIN, GRID_MAX) : GRID_DEFAULTS.size,
    snap: typeof record.snap === 'boolean' ? record.snap : GRID_DEFAULTS.snap,
  };
}

function loadSections(): PrefsState['sections'] {
  const saved = storageJson(SECTIONS_STORAGE);
  return isRecord(saved) ? (saved as PrefsState['sections']) : {};
}

function loadPrefs(): PrefsState {
  const unit = storageGet(UNIT_STORAGE);
  const pieces = storageJson(PIECES_STORAGE);
  return {
    unit: isUnit(unit) ? unit : 'mm',
    singleKeys: storageGet(SINGLE_KEYS_STORAGE) !== 'off',
    grid: loadGrid(),
    allowOverlap: isRecord(pieces) && pieces.allowOverlap === true,
    sections: loadSections(),
  };
}

export const usePrefs = create<PrefsState>()(loadPrefs);

export const getPrefs = () => usePrefs.getState();

/** Reads the preferences again (after migrating the stored keys on start). */
export const reloadPrefs = () => usePrefs.setState(loadPrefs());

export function setUnit(unit: Unit) {
  if (!isUnit(unit)) return;
  usePrefs.setState({ unit });
  storageSet(UNIT_STORAGE, unit);
}

export function setSingleKeys(on: boolean) {
  usePrefs.setState({ singleKeys: on });
  storageSet(SINGLE_KEYS_STORAGE, on ? 'on' : 'off');
}

export function setAllowOverlap(on: boolean) {
  usePrefs.setState({ allowOverlap: on });
  storageSet(PIECES_STORAGE, JSON.stringify({ allowOverlap: on }));
}

export function setGrid(changes: Partial<GridPrefs>) {
  const grid = { ...getPrefs().grid, ...changes };
  usePrefs.setState({ grid });
  storageSet(GRID_STORAGE, JSON.stringify(grid));
}

export function setSectionOpen(name: SectionName, open: boolean) {
  const sections = { ...getPrefs().sections, [name]: open };
  usePrefs.setState({ sections });
  storageSet(SECTIONS_STORAGE, JSON.stringify(sections));
}

/** The last custom paper ({w, h} in mm, as typed), or null. */
export function loadCustomPaper(): { w: number; h: number } | null {
  const saved = storageJson(CUSTOM_PAPER_STORAGE);
  return isRecord(saved) && Number.isFinite(saved.w) && Number.isFinite(saved.h) ? { w: saved.w as number, h: saved.h as number } : null;
}

export const saveCustomPaper = (w: number, h: number) => storageSet(CUSTOM_PAPER_STORAGE, JSON.stringify({ w, h }));
