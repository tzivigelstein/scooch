import type { IdRect, Point, Rect, RectId } from './types';

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type Axis = 'x' | 'y';
export type AnchorName = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';
export type Rounding = 'nearest' | 'up' | 'down';

/** Bounding box of all the rectangles, or null when there are none. */
export function bounds(rects: readonly Rect[]): Rect | null;

export const ALIGN_MODES: AlignMode[];

/** Aligns every rectangle against `reference` (default: their bounding box); only the axis of `mode` changes. */
export function align<I extends RectId>(rects: readonly IdRect<I>[], mode: AlignMode, reference?: Rect): IdRect<I>[];

/** Distributes along `axis`: `gap` mm between consecutive ones, or evenly `within` a box. */
export function distribute<I extends RectId>(rects: readonly IdRect<I>[], axis: Axis, options: { gap: number } | { within: Rect }): IdRect<I>[];

export function moveBy<I extends RectId>(rects: readonly IdRect<I>[], dx: number, dy: number): IdRect<I>[];

/** Scales positions and sizes by `k` around an anchor point or a named point of the bounding box. */
export function scaleGroup<I extends RectId>(rects: readonly IdRect<I>[], k: number, anchor?: AnchorName | Point): { rects: IdRect<I>[]; factor: number };

/** Rotates the group 90° around the center of its bounding box; `dr` is added to each piece's `r`. */
export function rotateGroup<I extends RectId>(rects: readonly IdRect<I>[], direction?: 'cw' | 'ccw'): { rects: IdRect<I>[]; dr: 90 | 270 };

/** Moves the group as a block so the corner of its bounding box falls on the grid. */
export function snapGroup<I extends RectId>(
  rects: readonly IdRect<I>[],
  step: number,
  options?: { origin?: Point; axes?: 'x' | 'y' | 'xy'; round?: Rounding | { x?: Rounding; y?: Rounding } }
): IdRect<I>[];

/** True when no rectangle of `result` overlaps another one or one of `others` (touching is fine). */
export function validate(
  result: readonly IdRect<RectId>[],
  others?: readonly (Rect & { id?: RectId })[],
  options?: { allowOverlap?: boolean; internal?: boolean }
): boolean;
