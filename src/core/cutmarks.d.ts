import type { CutMode, Rect } from './types';

export const CUT_MODES: readonly CutMode[];

/** A horizontal or vertical segment in mm (x1 ≤ x2, y1 ≤ y2). */
export interface CutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function cutLines(rects: readonly Rect[], options?: { mode?: CutMode; length?: number; offset?: number; bounds?: Rect | null }): CutLine[];
