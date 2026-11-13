// @vitest-environment jsdom
// The cut lines on screen: the same segments the PDF gets (cutLines of the
// pieces' image boxes) and the same stroke (cutStyle), in the sheet's mm.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CutLayer } from '../../src/components/canvas/CutLayer.tsx';
import { cutLines, cutStyle } from '../../src/core/cutmarks.js';
import { DEFAULT_CUTS } from '../../src/core/projectdoc.js';
import type { Cuts } from '../../src/core/types.ts';
import type { Piece } from '../../src/state/document.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const MM_PER_PT = 25.4 / 72;
const W = 210;
const H = 297;

let items: Piece[] = [];
/** Where each piece's image sits on the sheet (mm), worked out by hand. */
let boxes: { x: number; y: number; w: number; h: number }[] = [];

beforeEach(() => {
  resetState();
  const photo = fakeImageMm(50, 30);
  const other = fakeImageMm(40, 40, { src: 2 });
  items = [
    piece(1, photo, 20, 20),
    piece(2, photo, 80, 20, { r: 90 }), // 30 × 50
    piece(3, other, 20, 80, { scale: 50, crop: { x: 0.25, y: 0, w: 0.5, h: 1 } }), // 10 × 20
  ];
  const [pw, ph] = [(Math.round((50 / 25.4) * 300) / 300) * 25.4, (Math.round((30 / 25.4) * 300) / 300) * 25.4];
  const ow = (Math.round((40 / 25.4) * 300) / 300) * 25.4;
  boxes = [
    { x: 20, y: 20, w: pw, h: ph },
    { x: 80, y: 20, w: ph, h: pw },
    { x: 20, y: 80, w: ow * 0.5 * 0.5, h: ow * 0.5 },
  ];
});
afterEach(cleanup);

function draw(cuts: Partial<Cuts>, { zoom = 3, list = items } = {}) {
  const { container } = render(<CutLayer items={list} cuts={{ ...DEFAULT_CUTS, ...cuts }} W={W} H={H} zoom={zoom} />);
  const svg = container.querySelector('svg');
  return {
    svg,
    g: svg?.querySelector('g') ?? null,
    lines: [...(svg?.querySelectorAll('line') ?? [])].map((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k)))),
  };
}

const expectedLines = (cuts: Partial<Cuts>) =>
  cutLines(boxes, { ...DEFAULT_CUTS, ...cuts, bounds: { x: 0, y: 0, w: W, h: H } }).map((l) => [l.x1, l.y1, l.x2, l.y2]);

const close = (a: number[][], b: number[][]) => {
  expect(a.length).toBe(b.length);
  a.forEach((line, i) => line.forEach((v, j) => expect(v).toBeCloseTo(b[i][j], 9)));
};

describe('the cut layer', () => {
  test('nothing with no cut lines or no pieces', () => {
    expect(draw({ mode: 'none' }).svg).toBeNull();
    cleanup();
    expect(draw({ mode: 'corners' }, { list: [] }).svg).toBeNull();
  });

  test('a sheet-sized SVG in mm, hidden from assistive technology', () => {
    const { svg } = draw({ mode: 'corners' });
    expect(svg!.getAttribute('viewBox')).toBe(`0 0 ${W} ${H}`);
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    expect(svg!.getAttribute('focusable')).toBe('false');
    expect(svg!.getAttribute('class')).toBe('cut-layer');
  });

  test.each([
    { name: 'corner marks', cuts: { mode: 'corners' } },
    { name: 'the outline', cuts: { mode: 'outline' } },
    { name: 'the outline with a 3 mm cut margin', cuts: { mode: 'outline', margin: 3 } },
    { name: 'corner marks with a −1 mm cut margin', cuts: { mode: 'corners', margin: -1 } },
  ] as { name: string; cuts: Partial<Cuts> }[])('draws cutLines of the image boxes (rotated and cropped): $name', ({ cuts }) => {
    const { lines } = draw(cuts);
    expect(lines.length).toBeGreaterThan(0);
    close(lines, expectedLines(cuts));
  });

  test('a thin black solid line by default, never thinner than a device pixel', () => {
    const { svg, g } = draw({ mode: 'corners' }, { zoom: 3 });
    expect(svg!.dataset).toMatchObject({ width: '0.25', color: '#000000', dash: '' });
    expect(g!.getAttribute('stroke')).toBe('#000000');
    expect(g!.hasAttribute('stroke-dasharray')).toBe(false);
    // 0.25 pt is 0.088 mm: at 3 px/mm that is under a pixel, so it takes one pixel (1/3 mm).
    expect(Number(g!.getAttribute('stroke-width'))).toBeCloseTo(1 / 3, 9);
  });

  test('weight, color and dash reach the screen, the dash in the sheet’s millimetres', () => {
    const style = cutStyle({ weight: 'medium', color: '#12a0ff', dash: 'dotted' });
    const { svg, g } = draw({ mode: 'corners', weight: 'medium', color: '#12a0ff', dash: 'dotted' }, { zoom: 20 });
    expect(svg!.dataset).toMatchObject({ width: '0.5', color: '#12a0ff', dash: style.dash!.join(' ') });
    expect(g!.getAttribute('stroke')).toBe('#12a0ff');
    expect(Number(g!.getAttribute('stroke-width'))).toBeCloseTo(0.5 * MM_PER_PT, 9);
    const dash = g!.getAttribute('stroke-dasharray')!.split(' ').map(Number);
    expect(dash).toHaveLength(2);
    expect(dash[0]).toBeCloseTo(style.dash![0] * MM_PER_PT, 9);
    expect(dash[1]).toBeCloseTo(style.dash![1] * MM_PER_PT, 9);
  });
});
