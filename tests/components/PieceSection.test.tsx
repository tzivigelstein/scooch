// @vitest-environment jsdom
// The «Pieza» tab with one piece: the rotation note, the page of a PDF, the
// print resolution of an image, «Traer al frente» and «Rellenar con copias».
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { PieceSection } from '../../src/components/properties-panel/PieceSection.tsx';
import { setDocument, type Piece } from '../../src/state/document.ts';
import { dims } from '../../src/state/selectors.ts';
import { fakeImage, fakePdf, piece, resetState } from '../support/state.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const mm = (id: string) => parseFloat($<HTMLInputElement>(id).value.replace(',', '.'));

let photo = '';

beforeEach(() => {
  resetState();
  photo = fakeImage({ name: 'small.jpg', px: [800, 600] }); // 67.7 × 50.8 mm
  render(
    <>
      <PieceSection />
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
});
afterEach(cleanup);

const show = (items: Piece[], selection = [items[0].id]) => act(() => setDocument({ items, selection }));

describe('the piece’s measures', () => {
  test('turned: «Girada N°» shows, the width and height are what it takes on the sheet and the note describes them', () => {
    show([piece(1, photo, 30, 30, { r: 90 })]);
    const [w, h] = dims(piece(1, photo, 30, 30, { r: 90 }));
    expect($('rotation-note').hidden).toBe(false);
    expect($('rotation-angle').textContent).toBe('Girada 90°');
    expect(mm('width')).toBeCloseTo(w, 1);
    expect(mm('height')).toBeCloseTo(h, 1);
    expect(w).toBeLessThan(h); // 50.8 wide once turned
    for (const id of ['width', 'height']) expect($(id).getAttribute('aria-describedby')!.split(' ')).toContain('rotation-note');
    show([piece(1, photo, 30, 30, { r: 270 })]);
    expect($('rotation-angle').textContent).toBe('Girada 270°');
  });

  test('not turned: no note, and the width and height aren’t described by it', () => {
    show([piece(1, photo, 30, 30)]);
    expect($('rotation-note').hidden).toBe(true);
    for (const id of ['width', 'height']) expect($(id).getAttribute('aria-describedby')!.split(' ')).not.toContain('rotation-note');
  });
});

describe('what kind of piece', () => {
  test('a PDF page: the page row offers «n de N»', () => {
    const page = fakePdf({ name: 'twopage.pdf', src: 2, pages: 2 });
    show([piece(1, page, 30, 30)]);
    expect($('page-row').hidden).toBe(false);
    expect([...$<HTMLSelectElement>('page').options].map((o) => o.textContent)).toEqual(['1 de 2', '2 de 2']);
    expect($<HTMLSelectElement>('page').value).toBe('1');
  });

  test('an image: its print resolution, and no page row', () => {
    show([piece(1, photo, 30, 30)]);
    expect($('page-row').hidden).toBe(true);
    expect($('resolution-note').hidden).toBe(false);
    expect($('resolution-text').textContent!.replace(/ /g, ' ')).toMatch(/^Se imprime a 300 ppp/);
  });
});

describe('quick actions', () => {
  test('«Traer al frente» is only enabled when it covers another piece', () => {
    show([piece(1, photo, 30, 30), piece(2, photo, 40, 40)], [2]);
    expect($('piece-front').getAttribute('aria-disabled')).toBe('false');
    show([piece(1, photo, 30, 30), piece(2, photo, 120, 120)], [2]);
    expect($('piece-front').getAttribute('aria-disabled')).toBe('true');
  });

  test('«Rellenar con copias» is folded by default, says how many copies and warns it replaces everything', () => {
    show([piece(1, photo, 30, 30)]);
    expect($<HTMLDetailsElement>('fill-details').open).toBe(false);
    expect($('fill-summary').textContent!.replace(/ /g, ' ')).toMatch(/^\d+ copias en A4$/);
    expect($('fill-warning').textContent).toMatch(/^Reemplaza todas las piezas de la hoja/);
    expect($<HTMLButtonElement>('fill').disabled).toBe(false);
  });
});
