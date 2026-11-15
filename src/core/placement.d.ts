import type { Rect } from './types';

/** Intersection of two rectangles, or null when they don't touch. */
export function clip(a: Rect, b: Rect): Rect | null;

/** Of the candidates (in order of preference), the one covering the fewest `covers`, inside `bounds` and off `blocked`. */
export function pickSpot<T extends Rect>(candidates: readonly T[], options: { bounds: Rect; covers?: readonly Rect[]; blocked?: readonly Rect[] }): T | null;

/** `spot` if it is off `blocked`, else lifted `gap` above what it sits on until it is; null if that leaves `bounds`. */
export function liftOff<T extends Rect>(spot: T, options: { bounds: Rect; blocked?: readonly Rect[]; gap?: number }): T | null;
