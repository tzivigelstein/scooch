import type { AlignMode, Axis, Rounding } from './align';
import type { Box, IdRect, Point, Rect, RectId } from './types';

export interface Subgroup<I extends RectId = number> {
  rects: Box<I>[];
  others: Box<I>[];
}

/** The selected boxes (`ids`) grouped by sheet, with the other boxes of each of those sheets. */
export function subgroups<I extends RectId>(boxes: readonly Box<I>[], ids: ReadonlySet<I>): Map<number, Subgroup<I>>;

export type PlanFailure = 'outside' | 'overlap' | 'limit';

/** Result of a group operation: the new rectangles (also when it fails, to show them) and whether it applies. */
export interface Plan<I extends RectId = number> {
  ok: boolean;
  reason: PlanFailure | null;
  sheet?: number | null;
  rects: Map<I, IdRect<I>>;
  changed: boolean;
}

export interface Snap {
  step: number;
  axes?: 'x' | 'y' | 'xy';
  round?: Rounding | { x?: Rounding; y?: Rounding };
}

export interface PlanGroupOptions {
  W: number;
  H: number;
  snap?: Snap | null;
  contain?: 'clamp' | 'reject';
  allowOverlap?: boolean;
  rigid?: boolean;
  round?: (v: number) => number;
  /** The boxes are images that take this much more on every side (the cut margin) when checking overlaps. */
  pad?: number;
}

export function planGroup<I extends RectId>(
  boxes: readonly Box<I>[],
  ids: ReadonlySet<I>,
  transform: (rects: IdRect<I>[], sheet: number) => IdRect<I>[],
  options: PlanGroupOptions
): Plan<I>;

export function containScaleRange(rects: readonly Rect[], anchor: Point, W: number, H: number): { min: number; max: number };
/** Bounding box of each sheet's part of the selection. */
export function groupBounds<I extends RectId>(boxes: readonly Box<I>[], ids: ReadonlySet<I>): Map<number, Rect>;
/** The shared value (within `tolerance`), or null when they differ («Mixta»). */
export function common(values: readonly number[], tolerance?: number): number | null;
export function sameSource<I extends RectId>(items: readonly { id: I; src: number | string }[], ids: ReadonlySet<I>): I[];
export function touchedBy<I extends RectId>(area: Rect, boxes: readonly IdRect<I>[]): I[];
export function rangeBetween<I extends RectId>(order: readonly I[], from: I, to: I): I[];

export const SCALE_RANGE: Readonly<{ min: number; max: number }>;

/** Options shared by the plans: the sheet, the overlap preference, the rounding and the grid step when snapping. */
export interface GroupOptions {
  W: number;
  H: number;
  allowOverlap?: boolean;
  round?: (v: number) => number;
  snapStep?: number | null;
  /** For the scale plans: the boxes are images that take this much more on every side (the cut margin). */
  pad?: number;
}

export type ScaleAnchor = 'center' | 'top-left';
export type DistributeMode = 'gap' | 'even';

export function scaleLimits(scales: readonly number[]): { min: number; max: number };
export function planNudge<I extends RectId>(boxes: readonly Box<I>[], ids: ReadonlySet<I>, dx: number, dy: number, opts: GroupOptions): { plan: Plan<I>; jumped: Box<I>[] };
export function planMoveTo<I extends RectId>(boxes: readonly Box<I>[], ids: ReadonlySet<I>, sheet: number, axis: Axis, mm: number, opts: GroupOptions): Plan<I> | null;
export function scaleBounds<I extends RectId>(boxes: readonly Box<I>[], ids: ReadonlySet<I>, scales: readonly number[], anchor: ScaleAnchor, opts: GroupOptions): { min: number; max: number };
export function planScale<I extends RectId>(boxes: readonly Box<I>[], ids: ReadonlySet<I>, k: number, anchor: ScaleAnchor, opts: GroupOptions): Plan<I>;
export function planScaleBy<I extends RectId>(
  boxes: readonly Box<I>[],
  ids: ReadonlySet<I>,
  scales: readonly number[],
  primaryScale: number,
  delta: number,
  opts: GroupOptions
): { plan: Plan<I>; k: number } | null;
export function planResizeTo<I extends RectId>(
  boxes: readonly Box<I>[],
  ids: ReadonlySet<I>,
  sheet: number,
  axis: 'w' | 'h',
  mm: number,
  scales: readonly number[],
  opts: GroupOptions
): { plan: Plan<I>; k: number } | null;
export function planCommonScale<I extends RectId>(
  boxes: readonly Box<I>[],
  ids: ReadonlySet<I>,
  scales: ReadonlyMap<I, number>,
  value: number,
  opts: GroupOptions
): { plan: Plan<I>; scale: number };
export function planRotate<I extends RectId>(boxes: readonly Box<I>[], ids: ReadonlySet<I>, dir: number, opts: GroupOptions): { plan: Plan<I>; dr: 90 | 270 };
export function planAlign<I extends RectId>(boxes: readonly Box<I>[], ids: ReadonlySet<I>, mode: AlignMode, opts: GroupOptions & { area?: Rect | null }): Plan<I>;
export function distributeNeeds(mode: DistributeMode): 2 | 3;
export function canDistribute<I extends RectId>(boxes: readonly Box<I>[], ids: ReadonlySet<I>, mode: DistributeMode): boolean;
export function planDistribute<I extends RectId>(
  boxes: readonly Box<I>[],
  ids: ReadonlySet<I>,
  axis: Axis,
  opts: GroupOptions & { mode?: DistributeMode; gap?: number }
): Plan<I>;

/** A drag in progress: where the group would be, with the boxes it was planned on. */
export interface Drag<I extends RectId = number> {
  plan: Plan<I>;
  boxes: Box<I>[];
}

export function planDrag<I extends RectId>(
  boxes: readonly Box<I>[],
  ids: ReadonlySet<I>,
  dx: number,
  dy: number,
  opts: GroupOptions & { target?: number | null; offsetY?: number }
): Drag<I>;
export function planDrop<I extends RectId>(
  drag: Drag<I>,
  ids: ReadonlySet<I>,
  opts: GroupOptions
): { result: 'moved' | 'moved-aside' | 'reverted'; rects: Map<I, IdRect<I>> | null };

export function withPrimaryLast<I extends RectId>(list: readonly I[], primary: I | undefined): I[];
export function toggled<I extends RectId>(selection: readonly I[], id: I): { selection: I[]; on: boolean };
export function touchedSelection<I extends RectId>(selection: readonly I[], touched: readonly I[], additive: boolean): I[];
export function selectAllTarget<I extends RectId>(selection: readonly I[], onSheet: readonly I[], all: readonly I[]): { selection: I[]; everything: boolean };
export function neighborAfterRemoval<I extends RectId>(sameSheet: readonly I[], primary: I, removed: ReadonlySet<I>): I | null;
export function copiesAllowed(total: number, selected: number, max: number): number;
