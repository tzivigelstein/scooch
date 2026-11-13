import type { Rect } from './types';

/** Intersection of two rectangles, or null when they don't touch. */
export function clip(a: Rect, b: Rect): Rect | null;

/** Of the candidates (in order of preference), the one covering the fewest `covers`, inside `bounds` and off `blocked`. */
export function pickSpot<T extends Rect>(candidates: readonly T[], options: { bounds: Rect; covers?: readonly Rect[]; blocked?: readonly Rect[] }): T | null;
