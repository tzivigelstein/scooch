// The size of the PDF's pages (makePdf, built with pdf-lib in Node): exactly
// the paper's, in points, for every preset in both orientations (landscape:
// wider than tall) and for custom papers; and the PDF's title.
import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, test } from 'vitest';
import { PAPERS } from '../../src/core/papers.js';
import type { Paper } from '../../src/core/types.ts';
import { makePdf } from '../../src/services/export.ts';
import { addAsset } from '../../src/state/assets.ts';
import { setDocument } from '../../src/state/document.ts';
import { piece, resetState } from '../support/state.ts';

const PT_PER_MM = 72 / 25.4;

/** A real 1 × 1 px PNG (pdf-lib has to embed it). */
const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

/** The PDF of `paper` with one small piece on its only sheet: its pages' sizes in points, and its title. */
async function pdfOf(paper: Paper, landscape: boolean) {
  const asset = addAsset({ kind: 'image', name: 'dot.png', src: 1, px: [1, 1], w: 10, h: 10, bytes: PNG, preview: new Blob(), url: 'blob:test', format: 'png', dpi: 300, derived: false });
  resetState({ paper, landscape, items: [piece(1, asset, 30, 30)] });
  const doc = await PDFDocument.load(await makePdf(), { updateMetadata: false });
  return { pages: doc.getPages().map((page) => page.getSize()), title: doc.getTitle() };
}

/** Expects one page of exactly w × h mm (in points, to a millionth of a point). */
function expectPage(pages: { width: number; height: number }[], w: number, h: number) {
  expect(pages).toHaveLength(1);
  expect(pages[0].width).toBeCloseTo(w * PT_PER_MM, 6);
  expect(pages[0].height).toBeCloseTo(h * PT_PER_MM, 6);
}

beforeEach(() => resetState());

describe('the PDF page is the size of the paper', () => {
  test('A4 portrait: 210 × 297 mm', async () => {
    const { pages, title } = await pdfOf('A4', false);
    expectPage(pages, 210, 297);
    expect(title).toBe('Scooch A4');
  });

  test('A4 landscape: 297 × 210 mm, wider than tall', async () => {
    const { pages, title } = await pdfOf('A4', true);
    expectPage(pages, 297, 210);
    expect(pages[0].width).toBeGreaterThan(pages[0].height);
    expect(title).toBe('Scooch A4 horizontal');
  });

  test('Folio: 216 × 330 mm, titled «Scooch Folio»', async () => {
    const { pages, title } = await pdfOf('folio', false);
    expectPage(pages, 216, 330);
    expect(title).toBe('Scooch Folio');
  });

  test('every preset in both orientations: its size, and landscape swaps the sides', async () => {
    for (const { id, w, h } of PAPERS) {
      const portrait = await pdfOf(id, false);
      const landscape = await pdfOf(id, true);
      expectPage(portrait.pages, w, h);
      expectPage(landscape.pages, h, w);
      expect(landscape.pages[0].width, id).toBeGreaterThan(landscape.pages[0].height);
    }
  });
});

describe('custom papers', () => {
  test('123,4 × 170 mm: a page of exactly 123,4 × 170 mm, titled with its size', async () => {
    const { pages, title } = await pdfOf({ custom: true, w: 123.4, h: 170 }, false);
    expectPage(pages, 123.4, 170);
    expect(title?.replace(/ /g, ' ')).toBe('Scooch 123,4 × 170 mm');
  });

  test('landscape: 170 × 123,4 mm', async () => {
    const { pages } = await pdfOf({ custom: true, w: 123.4, h: 170 }, true);
    expectPage(pages, 170, 123.4);
  });

  test('one with the size of a preset is titled like it', async () => {
    const { pages, title } = await pdfOf({ custom: true, w: 210, h: 297 }, true);
    expectPage(pages, 297, 210);
    expect(title).toBe('Scooch A4 horizontal');
  });
});

test('every sheet with pieces is a page of the same size (two sheets, landscape)', async () => {
  const asset = addAsset({ kind: 'image', name: 'dot.png', src: 1, px: [1, 1], w: 10, h: 10, bytes: PNG, preview: new Blob(), url: 'blob:test', format: 'png', dpi: 300, derived: false });
  setDocument({ paper: 'A5', landscape: true, sheets: [{ id: 1 }, { id: 2 }], items: [piece(1, asset, 20, 20), piece(2, asset, 20, 20, { sheet: 2 })] });
  const doc = await PDFDocument.load(await makePdf(), { updateMetadata: false });
  const pages = doc.getPages().map((page) => page.getSize());
  expect(pages).toHaveLength(2);
  for (const page of pages) {
    expect(page.width).toBeCloseTo(210 * PT_PER_MM, 6);
    expect(page.height).toBeCloseTo(148 * PT_PER_MM, 6);
  }
});
