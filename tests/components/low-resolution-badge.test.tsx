// @vitest-environment jsdom
// The list's low-resolution badge («Puede verse pixelada»): a row shows it when its piece would
// print below 120 ppp (printResolution's low level), never for a vector PDF
// page; it goes when the piece is made smaller again.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PieceList } from '../../src/components/pieces-panel/PieceList.tsx';
import { setDocument, type Piece } from '../../src/state/document.ts';
import { fakeImage, fakePdf, piece, resetState } from '../support/state.ts';

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

let photo = '';
let page = '';

beforeEach(() => {
  resetState();
  // Small enough not to leave the sheet at 400 % (that would add the «cut» badge).
  photo = fakeImage({ name: 'small.jpg', px: [200, 150] }); // 300 ppp at 100 %: 16.9 × 12.7 mm
  page = fakePdf({ name: 'twopage.pdf', src: 2, w: 40, h: 30 });
  render(<PieceList />);
});
afterEach(cleanup);

const show = (items: Piece[], selection: number[] = []) => act(() => setDocument({ items, selection }));
const badges = (id: number) => [...document.querySelectorAll<HTMLElement>(`#piece-list [role="option"][data-id="${id}"] .row-badge`)].map((b) => b.dataset.kind);
const lowRes = (id: number) => document.querySelector<HTMLElement>(`#piece-list [role="option"][data-id="${id}"] .row-badge[data-kind="lowRes"]`);

describe('low-resolution badge in the list', () => {
  test('an image at 400 % (75 ppp) gets it; at 100 % (300) and 200 % (150) it doesn’t', () => {
    show([piece(1, photo, 10, 10), piece(2, photo, 10, 70, { scale: 200 }), piece(3, photo, 10, 130, { scale: 400 })], [3]);
    expect(badges(1)).toEqual([]);
    expect(badges(2)).toEqual([]);
    expect(badges(3)).toEqual(['lowRes']);
    // Its text is in the badge's tip and, for screen readers, in the row's name.
    expect(lowRes(3)!.dataset.tip).toBe('Puede verse pixelada');
    expect(lowRes(3)!.querySelector('.sr-only')!.textContent).toBe('. Puede verse pixelada');
  });

  test('it goes when the piece is made smaller again', () => {
    show([piece(1, photo, 10, 10, { scale: 400 })]);
    expect(badges(1)).toEqual(['lowRes']);
    show([piece(1, photo, 10, 10, { scale: 150 })]);
    expect(badges(1)).toEqual([]);
  });

  test('a PDF page is vector: no badge at any size', () => {
    show([piece(1, page, 10, 10, { scale: 400 })]);
    expect(badges(1)).toEqual([]);
  });

  test('a PDF page with /Rotate prints as an image: at 200 % (72 ppp) it gets it', () => {
    const rotated = fakePdf({ name: 'rotated.pdf', src: 3, w: 40, h: 30, pageRotation: 90 }); // 144 ppp at 100 %
    show([piece(1, rotated, 10, 10), piece(2, rotated, 10, 70, { scale: 200 })]);
    expect(badges(1)).toEqual([]);
    expect(badges(2)).toEqual(['lowRes']);
  });
});
