/** CSS px per mm at 100 %. */
export const PX_PER_MM_AT_100: number;
export const ZOOM_MIN: number;
export const ZOOM_MAX: number;
/** The levels the zoom buttons and Ctrl/⌘ + / − step through (percent). */
export const ZOOM_LEVELS: readonly number[];
/** The levels of the zoom menu (percent). */
export const MENU_LEVELS: readonly number[];
export function toPercent(pxPerMm: number): number;
export function fromPercent(pct: number): number;
/** Keeps a zoom in the range without moving it the wrong way from `current`. */
export function clampPercent(next: number, current?: number | null): number;
/** The next level from `current` in `dir` (1: in, −1: out). */
export function stepPercent(current: number, dir: 1 | -1): number;
export function canStep(current: number, dir: 1 | -1): boolean;
/** The zoom factor of a Ctrl/⌘ + wheel turn or a trackpad pinch. */
export function wheelFactor(deltaY: number, deltaMode?: number): number;
