import type { Placement } from './pack';
import type { Box, IdSize, Point, Rect, RectId, Size } from './types';

export interface ArrangePlan<I extends RectId = number> {
  sheets: number[];
  placements: Map<I, { sheet: number; x: number; y: number; rotated: boolean }>;
  unplaced: I[];
  packed: number;
}

/** Arranges every piece on as many sheets as needed (reusing the current sheet ids in order). */
export function arrangeSheets<I extends RectId>(
  boxes: readonly Box<I>[],
  sheetIds: readonly number[],
  options: { area: Size; margin?: number; gap?: number; rotate?: boolean; newId: () => number }
): ArrangePlan<I>;

/** Would applying `plan` leave everything as it is? */
export function samePlan<I extends RectId>(plan: ArrangePlan<I>, boxes: readonly Box<I>[], sheetIds: readonly number[], round?: (v: number) => number): boolean;

export function obstaclesBySheet(boxes: readonly Box<RectId>[], sheetIds: readonly number[], margin?: number): Rect[][];

/** Places NEW pieces without moving the others, from sheet index `from` on, adding sheets at the end if needed. */
export function placeIntoSheets<I extends RectId>(
  rects: readonly IdSize<I>[],
  boxes: readonly Box<RectId>[],
  sheetIds: readonly number[],
  options: { from?: number; area: Size; margin?: number; gap?: number; rotate?: boolean; newId: () => number }
): { placements: (Placement<I> & { sheet: number })[]; sheets: number[]; unplaced: I[] };

/** A free spot for one piece on a sheet with those obstacles, unrotated, or null. */
export function spotOnSheet(rect: IdSize<RectId>, boxes: readonly Rect[], options: { area: Size; margin?: number; gap?: number }): Point | null;

/** Closest position whose center stays inside the W × H sheet. */
export function keepCenterInside(rect: Rect, W: number, H: number): Point;

/** The closest free spot for `rect` on the sheet (printable area first), or null. */
export function freeSpotNear(rect: Rect, others: readonly Rect[], options: { W: number; H: number; margin?: number }): Point | null;

/** Index of the sheet (by its top edge and height) containing `y`, or the nearest one; −1 without sheets. */
export function sheetAt(y: number, tops: readonly number[], height: number): number;

export interface PieceProblems {
  cut: boolean;
  pastMargin: boolean;
  overlap: boolean;
}

export function pieceProblems<I extends RectId>(boxes: readonly Box<I>[], sheet: { W: number; H: number; margin?: number }): Map<I, PieceProblems>;

export interface ProblemCount {
  count: number;
  sheets: number[];
}

export interface ProblemSummary {
  cut: ProblemCount;
  pastMargin: ProblemCount;
  overlap: ProblemCount;
}

export function problemSummary<I extends RectId>(problems: ReadonlyMap<I, PieceProblems>, boxes: readonly Box<I>[], sheetIds: readonly number[]): ProblemSummary;
