export type Unit = 'mm' | 'cm' | 'in';
export type StepSize = 'fine' | 'normal' | 'coarse';

export const UNITS: Unit[];

export function isUnit(unit: unknown): unit is Unit;
export function toMm(value: number, unit: Unit): number;
export function fromMm(mm: number, unit: Unit): number;
export function decimalsFor(unit: Unit): number;
export function unitLabel(unit: Unit): Unit;

/** «10,5 mm», «2,54 cm», «4 in»; re-readable with parseLength. */
export function formatLength(mm: number, unit: Unit, options?: { locale?: string; withUnit?: boolean }): string;
/** A typed length in mm, or null when it can't be read. */
export function parseLength(text: string | number, unit: Unit): number | null;
/** Could `text` be the beginning of a length (something still being typed)? */
export function isPartialLength(text: string, unit: Unit): boolean;

export function stepFor(unit: Unit, size?: StepSize): { value: number; mm: number };
export function stepLabel(unit: Unit, size?: StepSize, options?: { locale?: string }): string;

export interface GridPreset {
  mm: number;
  value: number;
  label: string;
}

export function gridPresets(unit: Unit, options?: { locale?: string }): GridPreset[];
