// @vitest-environment jsdom
// The print resolution of a piece (printResolution): an image prints at its
// pixels over its printed width, with a level for the note and the list's
// badge (≥ 200 ppp good, ≥ 120 ok, below that low); a PDF page is vector,
// unless it has /Rotate (then it prints as an image of its preview).
// The crop's effect is in crop.test.ts.
import { beforeEach, describe, expect, test } from 'vitest';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { printResolution } from '../../src/state/actions/layout.ts';
import { fakeImage, fakePdf, piece, resetState } from '../support/state.ts';

beforeEach(() => resetState());

/** The resolution of a single piece of `asset`, with `props` on top of the defaults (100 %, not turned). */
function resolutionOf(asset: string, props: Partial<Piece> = {}) {
  setDocument({ items: [piece(1, asset, 20, 20, props)] });
  return printResolution(getDocument().items[0]);
}

describe('an image', () => {
  // Like small.jpg: 800 × 600 px at 300 ppp (67.7 × 50.8 mm at 100 %).
  const photo = () => fakeImage({ name: 'small.jpg', px: [800, 600], dpi: 300 });

  test('at 100 % an image of 300 ppp prints at 300 ppp, good', () => {
    expect(resolutionOf(photo())).toEqual({ ppp: 300, level: 'good' });
  });

  test('at 200 % it prints at 150 ppp, ok', () => {
    expect(resolutionOf(photo(), { scale: 200 })).toEqual({ ppp: 150, level: 'ok' });
  });

  test('at 400 % it prints at 75 ppp, low', () => {
    expect(resolutionOf(photo(), { scale: 400 })).toEqual({ ppp: 75, level: 'low' });
  });

  test('turning the piece doesn’t change it: it is the image’s own width that prints', () => {
    const key = photo();
    for (const r of [90, 180, 270] as const) expect(resolutionOf(key, { r, scale: 200 }), `${r}°`).toEqual({ ppp: 150, level: 'ok' });
  });

  test('the levels’ thresholds: 200 ppp is good, 199 ok, 120 ok and 119 low', () => {
    // An image of `dpi` ppp prints at exactly that at 100 %.
    const levels = [200, 199, 120, 119].map((dpi) => resolutionOf(fakeImage({ px: [1000, 800], dpi })));
    expect(levels).toEqual([
      { ppp: 200, level: 'good' },
      { ppp: 199, level: 'ok' },
      { ppp: 120, level: 'ok' },
      { ppp: 119, level: 'low' },
    ]);
  });

  test('ppp is rounded to a whole number', () => {
    expect(resolutionOf(fakeImage({ px: [1000, 800], dpi: 333.3 }))).toEqual({ ppp: 333, level: 'good' });
    expect(resolutionOf(fakeImage({ px: [1000, 800], dpi: 199.6 }))).toEqual({ ppp: 200, level: 'good' });
  });
});

describe('a PDF page', () => {
  test('without rotation it is vector: no ppp, at any size', () => {
    const page = fakePdf({ name: 'twopage.pdf' });
    for (const scale of [100, 400]) expect(resolutionOf(page, { scale }), `${scale} %`).toEqual({ vector: true });
  });

  test('with /Rotate 360 it is still vector', () => {
    expect(resolutionOf(fakePdf({ pageRotation: 360 }))).toEqual({ vector: true });
  });

  test('with /Rotate it prints as an image: its preview’s pixels over its width', () => {
    // The fake page's preview has 2 px per point: 144 ppp at 100 %, 72 at 200 %.
    const page = fakePdf({ name: 'rotated.pdf', pageRotation: 90 });
    expect(resolutionOf(page)).toEqual({ ppp: 144, level: 'ok' });
    expect(resolutionOf(page, { scale: 200 })).toEqual({ ppp: 72, level: 'low' });
  });
});
