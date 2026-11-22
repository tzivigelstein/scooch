// The stickers guide's facts (src/site/facts/stickers.ts): its buttons open
// the editor with the contour cut lines, and its drawing shows what the app's
// tracer does, as the guide says: one closed line around each shape, none in
// a hole, each line inside its sticker's rectangle grown by the cut margin
// (what «Acomodar» keeps the gap between), and following the shape, not the
// rectangle.
import { describe, expect, test } from 'vitest';
import { loopArea } from '../../src/core/contour.js';
import { parseDeepLink } from '../../src/core/deeplink.js';
import { stickersFacts } from '../../src/site/facts/stickers.ts';

const f = stickersFacts();

/** The closed loops of path data written as «M x y L x y … Z». */
const loopsOf = (d: string) =>
  d
    .split('Z')
    .filter(Boolean)
    .map((loop) => loop.replace('M', '').split('L').flatMap((pair) => pair.trim().split(' ').map(Number)));

describe('the stickers guide', () => {
  test('its buttons open the editor with contour cut lines, on A4 and on Letter, with the layout the guide states', () => {
    for (const [href, paper] of [
      [f.open.a4, 'A4'],
      [f.open.letter, 'letter'],
    ]) {
      expect(parseDeepLink(href.slice(1))!.settings).toEqual({ paper, margin: f.layout.margin, gap: f.layout.gap, cutMode: 'contour' });
    }
  });

  test('its drawing has as many stickers as the packer fits, cycling through every shape', () => {
    expect(f.figure.placements).toHaveLength(f.figure.count);
    expect(new Set(f.figure.placements.map((p) => p.shape)).size).toBe(f.figure.shapes.length);
  });

  test.each(f.figure.shapes.map((shape, i) => [i, shape]))('shape %i: one closed line, around the outside only, inside the rectangle grown by the cut margin, and smaller than it', (_, shape) => {
    const loops = loopsOf(shape.cut);
    expect(loops).toHaveLength(1);
    const [loop] = loops;
    const xs = loop.filter((_, i) => i % 2 === 0);
    const ys = loop.filter((_, i) => i % 2 === 1);
    // Rounded to 0.1 mm in the drawing.
    expect(Math.min(...xs, ...ys)).toBeGreaterThanOrEqual(-f.cutMargin - 0.05);
    expect(Math.max(...xs)).toBeLessThanOrEqual(f.sticker.w + f.cutMargin + 0.05);
    expect(Math.max(...ys)).toBeLessThanOrEqual(f.sticker.h + f.cutMargin + 0.05);
    expect(Math.abs(loopArea(loop))).toBeLessThan((f.sticker.w + 2 * f.cutMargin) * (f.sticker.h + 2 * f.cutMargin) * 0.9);
  });

  test('the opacity from which a pixel is part of a shape is the tracer’s, as a percentage', () => {
    expect(f.opacity).toBe(25);
  });
});
