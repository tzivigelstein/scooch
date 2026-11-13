// @vitest-environment jsdom
// The print resolution note in the «Pieza» tab (#resolution-note): its text
// for each level of printResolution, its level (which picks the icon) and
// that it follows the piece's scale. The numbers are print-resolution.test.ts's.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { PieceSection } from '../../src/components/properties-panel/PieceSection.tsx';
import { setDocument, type Piece } from '../../src/state/document.ts';
import { fakeImage, fakePdf, piece, resetState } from '../support/state.ts';

const $ = (id: string) => document.getElementById(id)!;
/** The copy puts a non-breaking space between the number and «ppp». */
const text = () => $('resolution-text').textContent!.replace(/ /g, ' ');
const level = () => $('resolution-note').dataset.level;

let photo = '';

beforeEach(() => {
  resetState();
  photo = fakeImage({ name: 'small.jpg', px: [800, 600] }); // 300 ppp at 100 %
  render(
    <>
      <PieceSection />
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
});
afterEach(cleanup);

const show = (item: Piece) => act(() => setDocument({ items: [item], selection: [item.id] }));

describe('print resolution note', () => {
  test('an image at 100 %: «Se imprime a 300 ppp», level good (the check mark)', () => {
    show(piece(1, photo, 20, 20));
    expect($('resolution-note').hidden).toBe(false);
    expect(text()).toBe('Se imprime a 300 ppp');
    expect(level()).toBe('good');
  });

  test('at 200 %: «Se imprime a 150 ppp · Calidad aceptable», level ok', () => {
    show(piece(1, photo, 20, 20, { scale: 200 }));
    expect(text()).toBe('Se imprime a 150 ppp · Calidad aceptable');
    expect(level()).toBe('ok');
  });

  test('at 400 %: «Se imprime a 75 ppp · Puede verse pixelada», level low', () => {
    show(piece(1, photo, 20, 20, { scale: 400 }));
    expect(text()).toBe('Se imprime a 75 ppp · Puede verse pixelada');
    expect(level()).toBe('low');
  });

  test('a PDF page without rotation: «Vectorial: nítida a cualquier tamaño»', () => {
    show(piece(1, fakePdf({ name: 'twopage.pdf', src: 2 }), 20, 20));
    expect(text()).toBe('Vectorial: nítida a cualquier tamaño');
    expect(level()).toBe('vector');
  });

  test('a PDF page with /Rotate prints as an image: «Se imprime a N ppp»', () => {
    show(piece(1, fakePdf({ name: 'rotated.pdf', src: 3, pageRotation: 90 }), 20, 20));
    expect(text()).toBe('Se imprime a 144 ppp · Calidad aceptable');
  });
});
