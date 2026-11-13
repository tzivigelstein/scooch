import type { CutDash, CutMode, CutWeight, Cuts, Rect } from './types';

export const CUT_MODES: readonly CutMode[];
export const CUT_WEIGHTS: Readonly<Record<CutWeight, number>>;
export const CUT_COLORS: Readonly<{ black: string; gray: string }>;
export const CUT_DASHES: readonly CutDash[];
export function isHexColor(value: unknown): value is string;
export function dotPattern(width: number): [number, number];

/** How the lines are drawn (screen and PDF): width and dash in pt, the color as #rrggbb and rgb 0–1. */
export interface CutStyle {
  width: number;
  hex: string;
  rgb: [number, number, number];
  dash: [number, number] | null;
}

export function cutStyle(cuts?: Partial<Pick<Cuts, 'weight' | 'color' | 'dash'>>): CutStyle;

/** A horizontal or vertical segment in mm (x1 ≤ x2, y1 ≤ y2). */
export interface CutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function cutLines(rects: readonly Rect[], options?: { mode?: CutMode; length?: number; offset?: number; bounds?: Rect | null }): CutLine[];
