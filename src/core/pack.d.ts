import type { IdSize, Rect, RectId } from './types';

/** Where `pack` put a piece; `rotated`: it takes h × w. */
export interface Placement<I extends RectId = number> {
  id: I;
  x: number;
  y: number;
  rotated: boolean;
}

export interface SheetPlacement<I extends RectId = number> extends Placement<I> {
  sheet: number;
}

export interface PackOptions {
  gap?: number;
  rotate?: boolean;
  obstacles?: readonly Rect[];
}

export function score<I extends RectId>(placements: readonly Placement<I>[], rects: readonly IdSize<I>[], W: number, H: number): number;
/** Places every rect inside W × H without overlaps, or null when they don't all fit. */
export function pack<I extends RectId>(rects: readonly IdSize<I>[], W: number, H: number, options?: PackOptions): Placement<I>[] | null;
export function fixedCandidates<I extends RectId>(rects: readonly IdSize<I>[], W: number, H: number, options?: PackOptions): Placement<I>[][];
/** Largest factor (0–1] that makes them fit (0 when not even shrinking them). */
export function fitScale<I extends RectId>(rects: readonly IdSize<I>[], W: number, H: number, options?: PackOptions): number;
export function packSheets<I extends RectId>(rects: readonly IdSize<I>[], W: number, H: number, options?: { gap?: number; rotate?: boolean }): { sheets: Placement<I>[][]; unplaced: I[] };
export function packInto<I extends RectId>(
  rects: readonly IdSize<I>[],
  W: number,
  H: number,
  options?: { gap?: number; rotate?: boolean; sheets?: readonly (readonly Rect[])[]; from?: number }
): { placements: SheetPlacement<I>[]; unplaced: I[] };
