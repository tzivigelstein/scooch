// «Stickers en casa» (stickers), in every language: the layouts its buttons
// open (with the contour cut lines, «Silueta»), the sheet its figure draws and
// how many stickers fit on it, and the opacity from which a pixel counts as
// part of a shape.
//
// The figure is the app's own work: the packer puts the stickers where
// «Acomodar» would (each one's rectangle grown by the cut margin, with the
// gap between them: cutmarks.footprintPad), and core/contour.js traces each
// shape's cut line from a mask, as the app traces an image's transparency.

import { ALPHA_THRESHOLD, traceShape } from '../../core/contour.js';
import { capacity, editorHref, type Layout } from '../kit.ts';

/**
 * A sticker's shape in its square (0–1 on each side, y down): whether a point
 * is opaque, and its outline as SVG path data for a sticker of `w` × `h` mm.
 */
interface Shape {
  inside: (u: number, v: number) => boolean;
  fill: (w: number, h: number) => string;
}

const TAU = 2 * Math.PI;

/** Path data in mm, to 0.1 (finer than the drawing can show). */
const d = (v: number) => String(Math.round(v * 10) / 10);

const pathOf = (points: ArrayLike<number>, w = 1, h = 1) => {
  const pairs = [];
  for (let i = 0; i < points.length; i += 2) pairs.push(`${d(points[i] * w)} ${d(points[i + 1] * h)}`);
  return `M${pairs.join('L')}Z`;
};

/** A polygon (flat [u0, v0, u1, v1, …]), centred in the square and as large as it fits with a little room around it. */
function polygon(raw: readonly number[]): Shape {
  const us = raw.filter((_, i) => i % 2 === 0);
  const vs = raw.filter((_, i) => i % 2 === 1);
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const k = 0.92 / Math.max(u1 - u0, v1 - v0);
  const points = raw.map((value, i) => 0.5 + (value - (i % 2 ? (v0 + v1) / 2 : (u0 + u1) / 2)) * k);
  const inside = (u: number, v: number) => {
    let hit = false;
    for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
      const [ui, vi, uj, vj] = [points[i], points[i + 1], points[j], points[j + 1]];
      if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) hit = !hit;
    }
    return hit;
  };
  return { inside, fill: (w, h) => pathOf(points, w, h) };
}

/** `n` points of a closed curve, at angles from the top, clockwise. */
const curve = (n: number, at: (a: number, i: number) => readonly [number, number]) => Array.from({ length: n }, (_, i) => at((i * TAU) / n, i)).flat();

/** Point `r` away from the centre at angle `a` from the top, clockwise. */
const polar = (a: number, r: number) => [r * Math.sin(a), -r * Math.cos(a)] as const;

/** A circle of radius `r` (of the side) around the centre, as path data. */
const circle = (r: number, w: number) => `M${d((0.5 - r) * w)} ${d(0.5 * w)}a${d(r * w)} ${d(r * w)} 0 1 0 ${d(2 * r * w)} 0a${d(r * w)} ${d(r * w)} 0 1 0 ${d(-2 * r * w)} 0Z`;

/** The shapes the figure cycles through: points and concave corners, a curve, a hole the line goes around, scallops. */
const SHAPES: readonly Shape[] = [
  // A five-pointed star.
  polygon(curve(10, (a, i) => polar(a, i % 2 ? 0.4 : 1))),
  // A heart (the classic parametric curve).
  polygon(curve(40, (t) => [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))])),
  // A ring: its hole is transparent, but the line only goes around the outside (holes are filled).
  {
    inside: (u, v) => Math.hypot(u - 0.5, v - 0.5) <= 0.46 && Math.hypot(u - 0.5, v - 0.5) >= 0.22,
    fill: (w) => circle(0.46, w) + circle(0.22, w),
  },
  // A scalloped badge.
  polygon(curve(48, (a) => polar(a, 1 + 0.18 * Math.cos(6 * a)))),
];

/** Pixels across a shape's mask: a fraction of a millimetre on the figure's stickers, finer than the drawing shows. */
const MASK_PX = 120;

function traced(shape: Shape, size: { w: number; h: number }, margin: number) {
  const alpha = new Uint8Array(MASK_PX * MASK_PX);
  for (let y = 0; y < MASK_PX; y++) for (let x = 0; x < MASK_PX; x++) alpha[y * MASK_PX + x] = shape.inside((x + 0.5) / MASK_PX, (y + 0.5) / MASK_PX) ? 255 : 0;
  const loops = traceShape({ width: MASK_PX, height: MASK_PX, alpha }, { w: size.w, h: size.h, margin }) ?? [];
  return { fill: shape.fill(size.w, size.h), cut: loops.map((loop) => pathOf(loop)).join(''), loops: loops.length };
}

/** What the figure draws of each shape: its outline and its cut line (path data, mm from the sticker's top left corner). */
export type TracedShape = ReturnType<typeof traced>;

// Tracing takes a few milliseconds: once per build (or per dev server), however many pages show it.
let figureShapes: readonly TracedShape[] | null = null;

export function stickersFacts() {
  const layout = { margin: 5, gap: 3 };
  const sticker = { w: 50, h: 50 };
  const cutMargin = 3;
  const figureLayout: Layout = { paper: 'A4', ...layout };
  const footprint = { w: sticker.w + 2 * cutMargin, h: sticker.h + 2 * cutMargin };
  const { count, placements } = capacity(footprint, figureLayout);
  figureShapes ??= SHAPES.map((shape) => traced(shape, sticker, cutMargin));
  return {
    layout,
    sticker,
    cutMargin,
    /** Stickers on A4 where «Acomodar» puts them: where each image goes (in the printable area), and which shape it has (cycling through SHAPES). */
    figure: {
      layout: figureLayout,
      count,
      shapes: figureShapes,
      placements: placements.map((p, i) => ({ x: p.x + cutMargin, y: p.y + cutMargin, shape: i % SHAPES.length })),
    },
    /** From this opacity (%) a pixel is part of the shape (core/contour.js ALPHA_THRESHOLD). */
    opacity: Math.round((ALPHA_THRESHOLD / 255) * 100),
    open: {
      a4: editorHref({ paper: 'A4', ...layout, cutMode: 'contour' }),
      letter: editorHref({ paper: 'letter', ...layout, cutMode: 'contour' }),
    },
  };
}

export type StickersFigure = ReturnType<typeof stickersFacts>['figure'];
