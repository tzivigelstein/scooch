import type { Point } from './types';

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
/** Two pointers of a pinch (px). */
export type PinchPair = readonly [Point, Point];
/** The midpoint of two pointers and the distance between them. */
export function pinchSpan(pair: PinchPair): Point & { d: number };
/** One step of a two-finger pinch: the new zoom (px per mm) and the scroll that keeps the content under the midpoint. */
export function pinchView(before: PinchPair, after: PinchPair, view: { zoom: number; scroll: Point }): { zoom: number; scroll: Point };
