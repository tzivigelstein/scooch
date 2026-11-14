import type { Point } from './types';

/** The release speed is fitted to the samples of the last GLIDE_WINDOW ms (ms). */
export const GLIDE_WINDOW: number;
/** Fingers that held still this long before lifting were not flung (ms). */
export const GLIDE_STALE: number;
/** What the speed keeps of itself every ms. */
export const GLIDE_FRICTION: number;
/** The glide stops below this speed (px per ms). */
export const GLIDE_STOP: number;

/** Where two fingers were at time t (ms): their midpoint and the distance between them (px). */
export interface GlideSample {
  t: number;
  x: number;
  y: number;
  d?: number;
}

/** How fast the fingers' midpoint was moving when they lifted at `now` (px per ms); still for a pause, a zoom or too few samples. */
export function releaseVelocity(samples: readonly GlideSample[], now: number): Point;
/** How long a glide that starts at `speed` (px per ms) lasts (ms). */
export function glideDuration(speed: number): number;
/** How far a glide that starts at `speed` (px per ms) goes (px). */
export function glideDistance(speed: number): number;

/** A glide: where it starts (px), how fast (px per ms) and the bounds it stops at. */
export interface Glide {
  from: Point;
  velocity: Point;
  min: Point;
  max: Point;
}

/** Where a glide is `t` ms after it started, and whether it is over. */
export function glideAt(glide: Glide, t: number): Point & { done: boolean };
