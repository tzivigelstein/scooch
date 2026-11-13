// Helpers for selecting and transforming groups of pieces.
import { expect, tiles, type App } from './test.ts';

/**
 * Adds three 531 × 591 px tiles (300 ppi: 44.958 × 50.038 mm) and puts them at
 * `positions` (mm) with the X and Y fields. Returns their ids.
 */
export async function placeThree(app: App, positions: readonly [number, number][]) {
  await app.addFiles(tiles(10, 3));
  const ids = await app.ids();
  for (const [i, [x, y]] of positions.entries()) await app.setPosition(ids[i], x, y);
  await expect.poll(async () => (await app.geometry()).pieces.map((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000])).toEqual(positions);
  return ids;
}

/** The x (or y) of each piece, in mm, rounded to 0.001. */
export async function positions(app: App, axis: 'x' | 'y', paperW: number | null = null) {
  return (await app.geometry(paperW)).pieces.map((p) => Math.round(p[axis] * 1000) / 1000);
}
