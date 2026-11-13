// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PdfAsset } from '../../src/services/assets.ts';
import { addAsset, getAsset } from '../../src/state/assets.ts';
import { getDocument, resetIds, setDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, resetHistory, undo } from '../../src/state/history.ts';

import { dims } from '../../src/state/selectors.ts';
import { getView, setView } from '../../src/state/view.ts';
import { applyPhotoSize, photoSizeOf, selectionPhotoSize } from '../../src/state/actions/crop.ts';
import { changePage } from '../../src/state/actions/files.ts';
import { fillWithCopies, printResolution } from '../../src/state/actions/layout.ts';
import { actualSize, duplicate, fit, rotate } from '../../src/state/actions/pieces.ts';
import { fakePdf } from '../support/state.ts';

// Another page of a PDF: pdf.js is faked, each page has the size set in `pageSizes` (mm).
const pageSizes = vi.hoisted(() => new Map<number, [number, number]>());
vi.mock('../../src/services/assets.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/services/assets.ts')>();
  const pt = (mm: number) => (mm / 25.4) * 72;
  return {
    ...real,
    openPdf: async () => ({ numPages: 2, destroy: async () => {} }),
    pdfPage: async (base: { name: string; src: number; pdf: PdfAsset['pdf']; bytes: Uint8Array }, n: number): Promise<PdfAsset> => {
      const [w, h] = pageSizes.get(n)!;
      return { kind: 'pdf', name: base.name, src: base.src, pdf: base.pdf, bytes: base.bytes, page: n, pages: 2, preview: new Blob(), url: 'blob:test', pageRotation: 0, view: [0, 0, pt(w), pt(h)], px: [Math.round(pt(w) * 2), Math.round(pt(h) * 2)], w, h };
    },
  };
});

const image = (w: number, h: number) =>
  addAsset({ kind: 'image', name: `${w}x${h}.png`, src: 1, px: [w * 10, h * 10], w, h, bytes: new Uint8Array(), preview: new Blob(), url: 'blob:test', format: 'png', dpi: 254, derived: false });

// Re-added for each test: an undo step releases the assets no piece uses.
let wide = '';
let tall = '';

const piece = (id: number, asset: string, x: number, y: number, props: Partial<Piece> = {}): Piece => ({ id, asset, sheet: 1, x, y, scale: 100, r: 0, crop: null, ...props });
const item = (id: number) => getDocument().items.find((i) => i.id === id)!;
const size = (id: number) => dims(item(id)).map((v) => Math.round(v * 1000) / 1000);
const center = (p: Piece) => {
  const [w, h] = dims(p);
  return [p.x + w / 2, p.y + h / 2].map((v) => Math.round(v * 1000) / 1000);
};

beforeEach(() => {
  wide = image(160, 100);
  tall = image(80, 120);
  setDocument({ allowOverlap: false });
  setView({ flash: null });
  setDocument({ sheets: [{ id: 1 }], paper: 'A4', landscape: false, margin: 10, gap: 5, busy: false });
  resetHistory();
});

describe('standard photo sizes', () => {
  test('a piece becomes exactly the size, turned to the image’s orientation, keeping its center', () => {
    setDocument({ items: [piece(1, wide, 20, 20), piece(2, tall, 20, 150)], selection: [1] });
    const before = center(item(1));
    applyPhotoSize('10x15');
    expect(size(1)).toEqual([152.4, 101.6]);
    expect(item(1).crop).not.toBeNull();
    expect(center(item(1))).toEqual(before);
    expect(photoSizeOf(item(1))).toBe('10x15');
    expect(historyDepth().undo).toBe(1);
  });

  test('honors the rotation and works on every selected piece', () => {
    setDocument({ items: [piece(1, wide, 20, 20, { r: 90 }), piece(2, tall, 20, 160)], selection: [1, 2] });
    applyPhotoSize('passport-35x45');
    expect(size(1)).toEqual([35, 45]); // shown standing (rotated wide image)
    expect(size(2)).toEqual([35, 45]);
    expect(selectionPhotoSize([item(1), item(2)])).toBe('passport-35x45');
  });

  test('«Original» removes the crop', () => {
    setDocument({ items: [piece(1, wide, 20, 20, { crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } })], selection: [1] });
    expect(photoSizeOf(item(1))).toBe('custom');
    applyPhotoSize('original');
    expect(item(1).crop).toBeNull();
    expect(photoSizeOf(item(1))).toBe('original');
  });

  test('a piece that would overlap moves to the closest free spot; with overlaps allowed it stays', () => {
    const items = [piece(1, tall, 10, 10, { scale: 50 }), piece(2, tall, 60, 10, { scale: 50 })];
    setDocument({ items, selection: [1] });
    applyPhotoSize('13x18'); // 127 × 177.8: grows over piece 2
    const [w, h] = dims(item(1));
    const other = item(2);
    const [ow, oh] = dims(other);
    const apart = item(1).x >= other.x + ow - 0.01 || other.x >= item(1).x + w - 0.01 || item(1).y >= other.y + oh - 0.01 || other.y >= item(1).y + h - 0.01;
    expect(apart || item(1).sheet !== other.sheet).toBe(true);
    undo();
    expect(getDocument().items).toEqual(items);
    setDocument({ allowOverlap: true });
    applyPhotoSize('13x18');
    expect(item(1).sheet).toBe(1);
  });

  test('without room on its sheet it goes to a new sheet, in the same undo step', () => {
    const items = [piece(1, wide, 10, 10, { scale: 30 }), piece(2, wide, 10, 50, { scale: 125 })];
    setDocument({ items, selection: [1] });
    applyPhotoSize('13x18'); // 177.8 × 127 doesn't fit beside piece 2
    expect(getDocument().sheets.length).toBe(2);
    expect(item(1).sheet).toBe(getDocument().sheets[1].id);
    expect(size(1)).toEqual([177.8, 127]);
    undo();
    expect(getDocument().sheets.length).toBe(1);
    expect(getDocument().items).toEqual(items);
  });

  test('refuses (with a notice) a size whose scale would leave 1 %–1000 %', () => {
    const tiny = image(2, 3);
    setDocument({ items: [piece(1, tiny, 10, 10)], selection: [1] });
    applyPhotoSize('20x30');
    expect(item(1).crop).toBeNull();
    expect(historyDepth().undo).toBe(0);
  });
});

describe('actions keep the crop', () => {
  /** Piece 1: the wide image at 10 × 15 (152.4 × 101.6, cropped at the sides), with no history. */
  function cropped() {
    setDocument({ items: [piece(1, wide, 25, 100)], selection: [1] });
    resetIds({ item: 2, sheet: 2 });
    applyPhotoSize('10x15');
    resetHistory();
    const before = item(1);
    expect(before.crop).not.toBeNull();
    return before;
  }

  test('rotate: the crop turns with the piece (same crop and scale, the size turned)', () => {
    const before = cropped();
    rotate(1);
    expect(item(1).r).toBe(90);
    expect(item(1).crop).toEqual(before.crop);
    expect(item(1).scale).toBe(before.scale);
    expect(size(1)).toEqual([101.6, 152.4]);
    expect(photoSizeOf(item(1))).toBe('10x15');
  });

  test('«Ajustar a la hoja» keeps the crop: the cropped piece fills the printable width', () => {
    const before = cropped();
    fit();
    expect(item(1).crop).toEqual(before.crop);
    expect(size(1)).toEqual([190, 126.667]);
  });

  test('«100 %» keeps the crop: the image at its actual size, still cropped', () => {
    const before = cropped();
    actualSize();
    expect(item(1).scale).toBe(100);
    expect(item(1).crop).toEqual(before.crop);
    expect(size(1)).toEqual([150, 100]);
  });

  test('duplicate copies the crop', () => {
    const before = cropped();
    duplicate();
    const copies = getDocument().items.filter((i) => i.id !== 1);
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ crop: before.crop, scale: before.scale, r: before.r });
    expect(size(copies[0].id)).toEqual([152.4, 101.6]);
  });

  test('«Rellenar con copias» copies the crop, and undoing it brings back the cropped piece in one step', () => {
    const before = cropped();
    expect(fillWithCopies()).toBe(true);
    const items = getDocument().items;
    expect(items.length).toBeGreaterThan(1);
    for (const copy of items) {
      expect(copy.crop).toEqual(before.crop);
      expect(photoSizeOf(copy)).toBe('10x15');
    }
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual([before]);
  });
});

describe('print resolution of a cropped piece', () => {
  test('ppp is the visible area’s pixels over its printed width: the crop doesn’t change the density', () => {
    // Like wide.png: 1772 × 1181 px at 300 ppp. At 4 × 4 cm the crop keeps the whole height (1181 px over 40 mm).
    const photo = addAsset({ kind: 'image', name: 'wide.png', src: 1, px: [1772, 1181], w: (1772 / 300) * 25.4, h: (1181 / 300) * 25.4, bytes: new Uint8Array(), preview: new Blob(), url: 'blob:test', format: 'png', dpi: 300, derived: false });
    setDocument({ items: [piece(1, photo, 20, 20), piece(2, photo, 20, 150)], selection: [1] });
    applyPhotoSize('id-4x4');
    expect(size(1)).toEqual([40, 40]);
    expect(printResolution(item(1))).toEqual({ ppp: 750, level: 'good' });
    // The same image uncropped at the same scale prints at the same density.
    setDocument({ items: getDocument().items.map((i) => (i.id === 2 ? { ...i, scale: item(1).scale } : i)) });
    expect(printResolution(item(2))).toEqual({ ppp: 750, level: 'good' });
  });
});

describe('another page of a cropped PDF piece', () => {
  /** A cropped piece of page 1 (148 × 210 mm) of a two-page PDF of its own source; page 2 measures `w` × `h`. */
  function croppedPage(src: number, page2: [number, number]) {
    pageSizes.set(2, page2);
    const key = fakePdf({ name: `doc${src}.pdf`, src, w: 148, h: 210, page: 1, pages: 2 });
    setDocument({ items: [piece(1, key, 20, 20)], selection: [1] });
    applyPhotoSize('9x13');
    resetHistory();
    return item(1);
  }

  test('of another size: the crop goes away and it says so; undo brings back page 1 cropped', async () => {
    const before = croppedPage(101, [200, 100]);
    await changePage(2);
    expect(getAsset(item(1).asset)).toMatchObject({ kind: 'pdf', page: 2 });
    expect(item(1).crop).toBeNull();
    expect(getView().flash?.text).toBe('La página 2 tiene otro tamaño, así que se quitó el recorte');
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(item(1)).toEqual(before);
  });

  test('of the same size: the crop stays, so the piece keeps its size, and nothing to say', async () => {
    const before = croppedPage(102, [148, 210]);
    const was = size(1);
    await changePage(2);
    expect(getAsset(item(1).asset)).toMatchObject({ kind: 'pdf', page: 2 });
    expect(item(1).crop).toEqual(before.crop);
    expect(size(1)).toEqual(was);
    expect(photoSizeOf(item(1))).toBe('9x13');
    expect(getView().flash).toBeNull();
  });
});
