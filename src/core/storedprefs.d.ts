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
}
export const COUNTED_MAX: number;
export function parseSavings(raw: unknown): Savings;
export function serializeSavings(savings: Savings): Savings & { v: 2 };
