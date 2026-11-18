// Preferences of this browser (localStorage): outside the document and the undo history.

import { create } from 'zustand';
import {
  CUSTOM_PAPER_STORAGE,
  GRID_DEFAULTS,
  GRID_MAX,
  GRID_MIN,
  GRID_STORAGE,
  LANGUAGE_STORAGE,
  PIECES_STORAGE,
  PRINT_STORAGE,
  SECTIONS_STORAGE,
  SINGLE_KEYS_STORAGE,
  THEME_STORAGE,
  UNIT_STORAGE,
} from '../config.ts';
import type { LanguageChoice } from '../core/language.js';
import {
  parseLanguagePref,
  parsePrintPrefs,
  parseSections,
  parseThemePref,
  serializeLanguagePref,
  serializePrintPrefs,
  serializeSections,
  serializeThemePref,
  type PrintPrefs,
  type SectionName,
  type ThemeChoice,
} from '../core/storedprefs.js';
import { isUnit, type Unit } from '../core/units.js';
import { clamp } from '../core/util.js';
import { storageGet, storageJson, storageSet } from '../services/storage/local.ts';

export interface GridPrefs {
  show: boolean;
  size: number;
  snap: boolean;
}

export type { SectionName };

export interface PrefsState {
  /** Unit to show and type lengths in; the document is always in mm. */
  unit: Unit;
  /** Single-key shortcuts (WCAG 2.1.4: they can be turned off). */
  singleKeys: boolean;
  grid: GridPrefs;
  /** Collapsed sections of the properties panel (missing: open). */
  sections: Partial<Record<SectionName, boolean>>;
  /** «Más opciones» of the cut lines is open. */
  cutOptions: boolean;
  /** The advice before printing or downloading, and the summary after, show. */
  printing: PrintPrefs;
  /** «Tema»: 'auto' follows the system's (services/theme.ts shows it). */
  theme: ThemeChoice;
  /** «Idioma»: 'auto' follows the browser's languages (services/language.ts loads and applies it). */
  language: LanguageChoice;
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

function loadPrefs(): PrefsState {
  const unit = storageGet(UNIT_STORAGE);
  return {
    unit: isUnit(unit) ? unit : 'mm',
    singleKeys: storageGet(SINGLE_KEYS_STORAGE) !== 'off',
    grid: loadGrid(),
    ...parseSections(storageJson(SECTIONS_STORAGE)),
    printing: parsePrintPrefs(storageJson(PRINT_STORAGE)),
    ...parseThemePref(storageJson(THEME_STORAGE)),
    ...parseLanguagePref(storageJson(LANGUAGE_STORAGE)),
  };
}

export const usePrefs = create<PrefsState>()(loadPrefs);

export const getPrefs = () => usePrefs.getState();

export function setUnit(unit: Unit) {
  if (!isUnit(unit)) return;
  usePrefs.setState({ unit });
  storageSet(UNIT_STORAGE, unit);
}

export function setSingleKeys(on: boolean) {
  usePrefs.setState({ singleKeys: on });
  storageSet(SINGLE_KEYS_STORAGE, on ? 'on' : 'off');
}

/**
 * «Permitir superposición» as this browser had it before it became each
 * project's (document version 5): what older projects take when opened.
 * Nothing writes it any more.
 */
export function legacyAllowOverlap() {
  const pieces = storageJson(PIECES_STORAGE);
  return isRecord(pieces) && pieces.allowOverlap === true;
}

export function setGrid(changes: Partial<GridPrefs>) {
  const grid = { ...getPrefs().grid, ...changes };
  usePrefs.setState({ grid });
  storageSet(GRID_STORAGE, JSON.stringify(grid));
}

const savePanels = () => storageSet(SECTIONS_STORAGE, JSON.stringify(serializeSections(getPrefs())));

export function setSectionOpen(name: SectionName, open: boolean) {
  usePrefs.setState({ sections: { ...getPrefs().sections, [name]: open } });
  savePanels();
}

/** Turns the advice before printing or the summary after on or off. */
export function setPrinting(changes: Partial<PrintPrefs>) {
  const printing = { ...getPrefs().printing, ...changes };
  usePrefs.setState({ printing });
  storageSet(PRINT_STORAGE, JSON.stringify(serializePrintPrefs(printing)));
}

export function setTheme(theme: ThemeChoice) {
  usePrefs.setState({ theme });
  storageSet(THEME_STORAGE, JSON.stringify(serializeThemePref({ theme })));
}

/** Another tab of this browser stored a theme: this one takes it too, without writing it again. */
export const readStoredTheme = () => usePrefs.setState(parseThemePref(storageJson(THEME_STORAGE)));

export function setLanguage(language: LanguageChoice) {
  usePrefs.setState({ language });
  storageSet(LANGUAGE_STORAGE, JSON.stringify(serializeLanguagePref({ language })));
}

/** Another tab of this browser stored a language: this one takes it too, without writing it again. */
export const readStoredLanguage = () => usePrefs.setState(parseLanguagePref(storageJson(LANGUAGE_STORAGE)));

/** «Más opciones» of the cut lines opened or closed. */
export function setCutOptionsOpen(open: boolean) {
  if (getPrefs().cutOptions === open) return;
  usePrefs.setState({ cutOptions: open });
  savePanels();
}

/** The last custom paper ({w, h} in mm, as typed), or null. */
export function loadCustomPaper(): { w: number; h: number } | null {
  const saved = storageJson(CUSTOM_PAPER_STORAGE);
  return isRecord(saved) && Number.isFinite(saved.w) && Number.isFinite(saved.h) ? { w: saved.w as number, h: saved.h as number } : null;
}

export const saveCustomPaper = (w: number, h: number) => storageSet(CUSTOM_PAPER_STORAGE, JSON.stringify({ w, h }));
