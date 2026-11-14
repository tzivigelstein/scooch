import type { Rect } from './types';

/** The gaps between facing neighbors at most `max` mm apart, with nothing in between (w or h 0 when they touch). */
export function neighborGaps(rects: readonly Rect[], max: number): Rect[];
