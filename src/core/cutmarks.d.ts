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

/** The image box grown by `margin` mm on every side (shrunk when negative, never inverted). */
export function cutBox(rect: Rect, margin?: number): Rect;
/** What the layout adds around each image: the cut margin while cut lines are on and it is positive, else 0. */
export function footprintPad(cuts: Pick<Cuts, 'mode' | 'margin'> | null | undefined): number;

/** A horizontal or vertical segment in mm (x1 ≤ x2, y1 ≤ y2). */
export interface CutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Work cutLines did while counting: boxes a segment was compared against. */
export interface CutWork {
  checks: number;
}
/** Test-only: add cutLines' work to `counter` from now on (null stops counting). */
export function countWork(counter: CutWork | null): void;

export function cutLines(rects: readonly Rect[], options?: { mode?: CutMode; length?: number; offset?: number; margin?: number; bounds?: Rect | null }): CutLine[];
