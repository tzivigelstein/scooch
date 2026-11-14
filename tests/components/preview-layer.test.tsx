// @vitest-environment jsdom
// The layer that draws a hovered or focused control's overlay on a sheet
// (PreviewLayer): what each part of an overlay becomes, in px at the zoom, and
// that it is decorative only (hidden from screen readers, never focusable).
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PreviewLayer } from '../../src/components/canvas/PreviewLayer.tsx';
import { usePreview, type Overlay } from '../../src/state/preview.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const ZOOM = 2;
let key = '';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  key = fakeImageMm(40, 30, { dpi: 254 });
  resetState();
});

afterEach(() => {
  act(() => usePreview.setState({ overlay: null }));
  cleanup();
});

function show(overlay: Overlay | null, sheet = 1) {
  act(() => usePreview.setState({ overlay }));
  return render(<PreviewLayer sheet={sheet} zoom={ZOOM} />).container;
}

const box = (el: Element | null) => {
  const s = (el as HTMLElement).style;
  return [s.left, s.top, s.width, s.height].map((v) => parseFloat(v));
};

describe('PreviewLayer', () => {
  test('nothing to show, or nothing on this sheet: no layer', () => {
    expect(show(null).querySelector('.preview')).toBeNull();
    cleanup();
    expect(show({ sheets: new Map([[2, { outlines: [{ x: 0, y: 0, w: 1, h: 1 }] }]]) }).querySelector('.preview')).toBeNull();
  });

  test('decorative: hidden from screen readers and nothing in it can take the focus', () => {
    const layer = show({ margin: 10, sheets: new Map([[1, { outlines: [{ x: 1, y: 1, w: 5, h: 5 }], ghosts: [{ item: piece(9, key, 5, 5), blocked: false }] }]]) }).querySelector('.preview')!;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0);
  });

  test('the margin: a band as wide as the margin at the zoom, on every sheet', () => {
    const margin = show({ margin: 12, sheets: new Map() }, 3).querySelector<HTMLElement>('.preview-margin')!;
    expect(margin.style.borderWidth).toBe('24px');
  });

  test('gaps, dimmed pieces and outlines: their boxes at the zoom; a gap with no width is still drawn', () => {
    const layer = show({
      tone: 'problem',
      sheets: new Map([[1, { gaps: [{ x: 10, y: 20, w: 5, h: 30 }, { x: 40, y: 20, w: 0, h: 30 }], dimmed: [{ x: 1, y: 2, w: 3, h: 4 }], outlines: [{ x: 5, y: 6, w: 7, h: 8 }] }]]),
    });
    const [gap, touching] = layer.querySelectorAll('.preview-gap');
    expect(box(gap)).toEqual([20, 40, 10, 60]);
    expect(box(touching)).toEqual([79, 40, 2, 60]);
    expect(box(layer.querySelector('.preview-dimmed'))).toEqual([2, 4, 6, 8]);
    const outline = layer.querySelector('.preview-outline')!;
    expect(box(outline)).toEqual([10, 12, 14, 16]);
    expect(outline.classList.contains('is-problem')).toBe(true);
  });

  test('a piece pointed out from the list looks different from the ones with a problem', () => {
    const outline = show({ tone: 'locate', sheets: new Map([[1, { outlines: [{ x: 5, y: 6, w: 7, h: 8 }] }]]) }).querySelector('.preview-outline')!;
    expect(outline.classList.contains('is-locate')).toBe(true);
  });

  test('ghosts: drawn like the piece at the zoom (its image, its place), marked when the action wouldn’t apply', () => {
    const layer = show({ sheets: new Map([[1, { ghosts: [{ item: piece(9, key, 5, 6), blocked: false }, { item: piece(10, key, 50, 6), blocked: true }] }]]) });
    const [ghost, blocked] = layer.querySelectorAll<HTMLElement>('.preview-ghost');
    expect(box(ghost).map(Math.round)).toEqual([10, 12, 80, 60]);
    expect(ghost.querySelector('img')!.getAttribute('src')).toBe('blob:test');
    expect(ghost.classList.contains('is-blocked')).toBe(false);
    expect(blocked.classList.contains('is-blocked')).toBe(true);
  });

  test('what aligning goes against and its line', () => {
    const layer = show({ sheets: new Map([[1, { reference: { box: { x: 10, y: 10, w: 190, h: 277 }, line: { x1: 200, y1: 10, x2: 200, y2: 287 } } }]]) });
    expect(box(layer.querySelector('.preview-reference'))).toEqual([20, 20, 380, 554]);
    expect(box(layer.querySelector('.preview-line'))).toEqual([400, 20, 0, 554]);
  });

  test.each([
    ['x', 'is-horizontal', { left: 0, top: 90, width: 40 }],
    ['y', 'is-vertical', { top: 0, left: 60, height: 60 }],
    ['width', 'is-horizontal', { left: 40, top: 134, width: 40 }],
    ['height', 'is-vertical', { top: 60, left: 94, height: 60 }],
  ] as const)('the «%s» measure: a dimension line from the edge it is measured from, or along the side, with its value', (field, kind, at) => {
    const line = show({ sheets: new Map([[1, { dimension: { field, box: { x: 20, y: 30, w: 20, h: 30 }, text: '20 mm' } }]]) }).querySelector<HTMLElement>('.preview-dimension')!;
    expect(line.classList.contains(kind)).toBe(true);
    for (const [prop, value] of Object.entries(at)) expect(parseFloat(line.style[prop as 'left']), prop).toBe(value);
    expect(line.textContent).toBe('20 mm');
  });

  test('copies that go to other sheets: their count', () => {
    expect(show({ sheets: new Map([[1, { more: 5 }]]) }).querySelector('.preview-more')!.textContent).toBe('+5');
  });
});
