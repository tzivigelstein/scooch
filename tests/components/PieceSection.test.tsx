// @vitest-environment jsdom
// The «Pieza» tab with one piece: the rotation note, the scale field in each
// language, the page of a PDF, the print resolution of an image, «Tamaño de
// foto», «Traer al frente» and «Rellenar con copias».
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { PieceSection } from '../../src/components/properties-panel/PieceSection.tsx';
import { CATALOGUES } from '../../src/copy/all.ts';
import { setTexts, textsFor } from '../../src/copy/index.ts';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth } from '../../src/state/history.ts';
import { dims } from '../../src/state/selectors.ts';
import { fakeImage, fakePdf, fakeQr, piece, resetState } from '../support/state.ts';

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
  test('turned: «Rotada N°» shows, the width and height are what it takes on the sheet and the note describes them', () => {
    show([piece(1, photo, 30, 30, { r: 90 })]);
    const [w, h] = dims(piece(1, photo, 30, 30, { r: 90 }));
    expect($('rotation-note').hidden).toBe(false);
    expect($('rotation-angle').textContent).toBe('Rotada 90°');
    expect($('rotation-note').textContent).toBe('Rotada 90°');
    expect(mm('width')).toBeCloseTo(w, 1);
    expect(mm('height')).toBeCloseTo(h, 1);
    expect(w).toBeLessThan(h); // 50.8 wide once turned
    for (const id of ['width', 'height']) expect($(id).getAttribute('aria-describedby')!.split(' ')).toContain('rotation-note');
    show([piece(1, photo, 30, 30, { r: 270 })]);
    expect($('rotation-angle').textContent).toBe('Rotada 270°');
  });

  test('not turned: no note, and the width and height aren’t described by it', () => {
    show([piece(1, photo, 30, 30)]);
    expect($('rotation-note').hidden).toBe(true);
    for (const id of ['width', 'height']) expect($(id).getAttribute('aria-describedby')!.split(' ')).not.toContain('rotation-note');
  });
});

describe('the scale field, in the language on screen', () => {
  // The decimal separator of each language (docs/copy.md and docs/copy/*.md).
  const SEPARATORS = { es: ',', fr: ',', en: '.', 'zh-Hans': '.', hi: '.' } as const;
  const scale = () => $<HTMLInputElement>('scale');
  const scaleOf = () => getDocument().items[0].scale;
  /** Types `text` in the field and confirms it, as Enter or leaving the field does. */
  const type = (text: string) =>
    act(() => {
      fireEvent.input(scale(), { target: { value: text } });
      fireEvent.change(scale());
    });
  afterEach(() => setTexts(CATALOGUES.es));

  test('is a text field for decimals, so the browser writes no separator of its own', () => {
    show([piece(1, photo, 30, 30)]);
    expect(scale().type).toBe('text');
    expect(scale().inputMode).toBe('decimal');
    expect(scale().value).toBe('100');
  });

  for (const [language, separator] of Object.entries(SEPARATORS) as [keyof typeof SEPARATORS, string][]) {
    test(`${language}: shows the scale and its slider’s value with «${separator}», and reads a comma or a point typed`, () => {
      setTexts(CATALOGUES[language]);
      show([piece(1, photo, 30, 30, { scale: 147.6 })]);
      expect(scale().value).toBe(`147${separator}6`);
      expect($('slider').getAttribute('aria-valuetext')).toBe(textsFor(CATALOGUES[language]).t('units.scale', { n: 147.6 }));
      expect($('slider').getAttribute('aria-valuetext')).toContain(`147${separator}6`);
      for (const [typed, read] of [
        ['120,5', 120.5],
        ['120.5', 120.5],
        ['80', 80],
      ] as const) {
        type(typed);
        expect(scaleOf(), typed).toBe(read);
        expect(scale().value, typed).toBe(String(read).replace('.', separator));
      }
    });
  }

  test('reads a percent sign typed after the number; what isn’t a number leaves the scale as it was', () => {
    show([piece(1, photo, 30, 30)]);
    type('150 %');
    expect(scaleOf()).toBe(150);
    type('1.000,5');
    expect(scaleOf()).toBe(150);
    expect(scale().value).toBe('150');
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

describe('a QR code', () => {
  test('it is vector and has neither «Tamaño de foto» nor «Recortar»: it is never cropped; with an image too they are the image’s', () => {
    const qr = fakeQr();
    show([piece(1, qr, 30, 30), piece(2, photo, 100, 30)]);
    expect($('photo-size').closest('.photo-row')!.hasAttribute('hidden')).toBe(true);
    expect($('resolution-text').textContent).toBe('Vectorial: nítida a cualquier tamaño');
    show([piece(1, qr, 30, 30), piece(2, photo, 100, 30)], [1, 2]);
    expect($('photo-size').closest('.photo-row')!.hasAttribute('hidden')).toBe(false);
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
    // It changes with the scale: not a live region, or it would speak on every step.
    expect($('fill-summary').hasAttribute('aria-live')).toBe(false);
    expect($('fill-warning').textContent).toMatch(/^Reemplaza todas las piezas de la hoja/);
    expect($<HTMLButtonElement>('fill').disabled).toBe(false);
  });
});

describe('«Tamaño de foto»', () => {
  const nb = (text: string | null) => text?.replace(/[  ]/g, ' ');

  test('a combobox named by its label, showing «Original» or the piece’s size; its options are «Original» and the standard sizes in their groups, in the chosen unit', () => {
    show([piece(1, photo, 30, 30)]);
    const control = screen.getByRole('combobox', { name: 'Tamaño de foto' });
    expect(control.textContent).toBe('Original');
    act(() => control.focus());
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    const list = screen.getByRole('listbox', { name: 'Tamaño de foto' });
    expect(within(list).getAllByRole('group').map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent)).toEqual(['Fotos', 'Documentos', 'Otros']);
    const options = within(list).getAllByRole('option').map((o) => nb(o.textContent));
    expect(options).toHaveLength(12);
    expect(options.slice(0, 3)).toEqual(['Original', '9 × 13 · 88,9 × 127 mm', '10 × 15 · 101,6 × 152,4 mm']);
    expect(options.at(-1)).toBe('Instantánea · 88 × 107 mm');
  });

  test('choosing a size with the keyboard applies it in one undo step, and the control then shows it', () => {
    show([piece(1, photo, 30, 30)]);
    const control = screen.getByRole('combobox', { name: 'Tamaño de foto' });
    act(() => control.focus());
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    fireEvent.keyDown(control, { key: 'ArrowDown' });
    act(() => {
      fireEvent.keyDown(control, { key: 'Enter' });
    });
    expect(historyDepth().undo).toBe(1);
    expect(nb(control.textContent)).toBe('10 × 15 · 101,6 × 152,4 mm');
    expect(control.getAttribute('data-value')).toBe('10x15');
  });

  test('one piece with a free crop: «Recorte libre»; several that differ: «Mixto»', () => {
    const crop = { x: 0.1, y: 0.1, w: 0.5, h: 0.6 };
    show([piece(1, photo, 30, 30, { crop })]);
    expect(screen.getByRole('combobox', { name: 'Tamaño de foto' }).textContent).toBe('Recorte libre');
    show([piece(1, photo, 30, 30, { crop }), piece(2, photo, 30, 120)], [1, 2]);
    expect(screen.getByRole('combobox', { name: 'Tamaño de foto' }).textContent).toBe('Mixto');
  });
});
