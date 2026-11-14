import type { LanguageChoice } from './language.js';

export type ZoomMode = 'fit' | 'width' | 'manual';

export interface ViewPrefs {
  zoomMode: ZoomMode;
  /** The zoom in percent (used when zoomMode is 'manual'). */
  zoomPct: number;
  alignTo: 'selection' | 'sheet';
  distribute: 'gap' | 'even';
}

export const VIEW_DEFAULTS: Readonly<ViewPrefs>;
export function parseViewPrefs(raw: unknown): ViewPrefs;
export function serializeViewPrefs(prefs: ViewPrefs): ViewPrefs & { v: 1 };

export interface PrintPrefs {
  /** The advice before printing or downloading shows. */
  tip: boolean;
  /** The summary after printing or downloading shows. */
  summary: boolean;
}
export function parsePrintPrefs(raw: unknown): PrintPrefs;
export function serializePrintPrefs(prefs: PrintPrefs): PrintPrefs & { v: 1 };

/** The option of «Tema»: 'auto' follows the system's. */
export type ThemeChoice = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';
export const THEMES: readonly ThemeChoice[];

export interface ThemePrefs {
  theme: ThemeChoice;
}
export function parseThemePref(raw: unknown): ThemePrefs;
export function serializeThemePref(prefs: ThemePrefs): ThemePrefs & { v: 1 };
export function resolveTheme(theme: ThemeChoice, systemDark: boolean): Theme;

export const LANGUAGE_CHOICES: readonly LanguageChoice[];

export interface LanguagePrefs {
  language: LanguageChoice;
}
export function parseLanguagePref(raw: unknown): LanguagePrefs;
export function serializeLanguagePref(prefs: LanguagePrefs): LanguagePrefs & { v: 1 };

export type SectionName = 'sheet' | 'arrange' | 'cuts' | 'grid';
export const SECTION_NAMES: readonly SectionName[];

export interface PanelPrefs {
  /** false: collapsed (missing: open). */
  sections: Partial<Record<SectionName, boolean>>;
  /** «Más opciones» of the cut lines is open. */
  cutOptions: boolean;
}

export function parseSections(raw: unknown): PanelPrefs;
export function serializeSections(prefs: PanelPrefs): Partial<Record<SectionName, boolean>> & { v: 2; cutOptions?: true };

export interface Savings {
  /** Sheets saved so far on this device. */
  sheets: number;
  /** Whose turn the next equivalent is. */
  turn: number;
  /** The keys of the last PDFs that added to the total, the newest last. */
  counted: string[];
  /** The last print, whose sheets aren't in the total until it settles. */
  pending: { key: string; sheets: number } | null;
  /** A milestone the total reached that no summary has shown yet. */
  milestone: number | null;
}
export const COUNTED_MAX: number;
export function parseSavings(raw: unknown): Savings;
export function serializeSavings(savings: Savings): Savings & { v: 3 };

export interface Recents {
  /** Ids of the commands last run from the palette, the newest first. */
  ids: string[];
}
export const RECENT_MAX: number;
export function parseRecents(raw: unknown): Recents;
export function serializeRecents(recents: Recents): Recents & { v: 1 };
export function withRecent(ids: readonly string[], id: string): string[];

export interface TipPrefs {
  /** Usage tips show (the «Consejos de uso» switch). */
  on: boolean;
  /** Topics with «No volver a mostrar». */
  dismissed: string[];
  /** Topics whose fast way was already used. */
  known: string[];
  /** Counts kept across sessions, by tip id. */
  counts: Record<string, number>;
}
export const TIPS_MAX: number;
export function parseTipPrefs(raw: unknown): TipPrefs;
export function serializeTipPrefs(prefs: { on: boolean; dismissed: readonly string[]; known: readonly string[]; counts: Readonly<Record<string, number>> }): TipPrefs & { v: 1 };
