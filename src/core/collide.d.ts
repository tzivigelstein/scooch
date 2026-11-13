import type { Point, Rect } from './types';

/** Tolerance in mm: touching is not overlapping. */
export const EPS: number;

export function overlaps(a: Rect, b: Rect, eps?: number): boolean;
export function overlapping<T extends Rect>(rect: Rect, others: readonly T[], eps?: number): T[];
export function overlapsAny(rect: Rect, others: readonly Rect[], eps?: number): boolean;

/** Closest position to `rect` (by its corner) where it overlaps none of `others`, or null. */
export function nearestFree(rect: Rect, others: readonly Rect[], options?: { bounds?: Rect | null; maxDistance?: number }): Point | null;

/** Moves `rect` by (dx, dy) (one axis); if it lands on others it jumps right past them. */
export function nextFreeInDirection<T extends Rect>(rect: Rect, others: readonly T[], dx: number, dy: number): Point & { jumped: T[] };

/** One sheet's part of a group that moves rigidly: its pieces, the others on that sheet and optionally the sheet. */
export interface GroupLayer<T extends Rect = Rect> {
  rects: readonly Rect[];
  others: readonly T[];
  bounds?: { W: number; H: number };
}

export function nextFreeForGroup<T extends Rect>(layers: readonly GroupLayer<T>[], dx: number, dy: number): { dx: number; dy: number; jumped: T[] };
export function nearestFreeOffset(layers: readonly GroupLayer[], options?: { maxDistance?: number; step?: number }): { dx: number; dy: number } | null;
export function groupScaleRange(rects: readonly Rect[], others: readonly Rect[], anchor: Point): { min: number; max: number };
/** Largest factor `rect` can grow by without overlapping `others` (Infinity when nothing stops it). */
export function maxGrowth(rect: Rect, others: readonly Rect[], anchor?: 'center' | 'top-left'): number;
