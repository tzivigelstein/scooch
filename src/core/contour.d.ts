import type { CutLine } from './cutmarks.js';
import type { Crop, Rect } from './types';

export const ALPHA_THRESHOLD: number;
export const GRID_MAX: number;

/** One alpha byte (0–255) per pixel of the whole, uncropped image. */
export interface AlphaMask {
  width: number;
  height: number;
  alpha: Uint8Array | Uint8ClampedArray;
}

/** A closed polyline as flat [x0, y0, x1, y1, …] (the last point joins the first). */
export type Loop = ArrayLike<number>;

/** Work traceShape did while counting: mask pixels sampled and grid cells visited. */
export interface ContourWork {
  pixels: number;
  cells: number;
}
/** Test-only: add traceShape's work to `counter` from now on (null stops counting). */
export function countWork(counter: ContourWork | null): void;

/**
 * The outer loops around the opaque shape of the visible part (`w` × `h`,
 * unrotated, any unit), `margin` away (same unit), from its top left corner;
 * null when the rectangle applies.
 */
export function traceShape(mask: AlphaMask, options: { crop?: Crop | null; w: number; h: number; margin?: number }): Float64Array[] | null;

/** Positive when clockwise on screen (y down). */
export function loopArea(points: Loop): number;
export function insideLoop(points: Loop, x: number, y: number): boolean;

/** traceShape's loops × `k`, turned `r`° clockwise with the piece and moved to (x, y); `uw` × `uh`: the visible part in mm, unrotated. */
export function placeLoops(loops: readonly Loop[], placement: { x: number; y: number; r?: number; uw: number; uh: number; k?: number }): Float64Array[];

/** A stretch of a contour on the sheet (mm): flat points, closed or not. */
export interface CutPath {
  points: number[];
  closed: boolean;
}

/** What of a loop is drawn: nothing strictly inside a `hide` rectangle or outside `bounds`. */
export function clipLoop(loop: Loop, options?: { hide?: readonly Rect[]; bounds?: Rect | null }): CutPath[];

/** A piece for contourCuts: its image box and its placed loops (null: the rectangle; undefined: not known yet). */
export interface ContourPiece {
  box: Rect;
  shape: readonly Loop[] | null | undefined;
}

/** The cut lines of a sheet in contour mode: the rectangles' outline segments and the shapes' paths. */
export function contourCuts(pieces: readonly ContourPiece[], options?: { margin?: number; bounds?: Rect | null }): { lines: CutLine[]; paths: CutPath[] };

/** SVG path data of the paths (mm, to 0.001). */
export function pathData(paths: readonly CutPath[]): string;
