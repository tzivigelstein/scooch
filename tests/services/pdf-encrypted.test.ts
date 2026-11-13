// An encrypted PDF page: pdf-lib can't load it to embed it as a vector, so the
// export falls back to the page's preview image (the `catch` in embedPdfAsset).
// e2e/fixtures/password.pdf is encrypted (RC4, with a user password): pdf-lib
// refuses it like any encrypted file. In the app pdf.js refuses it too when it
// is added, so this fallback is only reachable for encrypted files pdf.js opens
// (an owner password only); here the bytes are handed to the exporter directly.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, type PDFDict } from 'pdf-lib';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildPdf, type PdfSource } from '../../src/services/pdf.ts';

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../e2e/fixtures', name)));

const PASSWORD_PDF = fixture('password.pdf');
// The preview the app rendered for it (any PNG does: it is embedded as it is).
const PREVIEW = fixture('tile000.png');
const SHEET = { width: 210, height: 297 };
const MM = 25.4 / 72;

async function firstPage(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = doc.getPages()[0];
  const xobj = page.node.Resources()!.lookup(PDFName.of('XObject')) as PDFDict;
  const kinds = xobj.keys().map((key) => String((doc.context.lookup(xobj.get(key)) as PDFRawStream).dict.get(PDFName.of('Subtype'))));
  const contents = page.node.Contents()!;
  const streams = 'asArray' in contents ? contents.asArray().map((ref) => doc.context.lookup(ref)) : [contents];
  const text = streams.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : '')).join('\n');
  return { kinds, text };
}

afterEach(() => vi.restoreAllMocks());

describe('exporting a page of an encrypted PDF', () => {
  test('pdf-lib refuses the fixture (so the exporter can’t embed it as a vector)', async () => {
    await expect(PDFDocument.load(PASSWORD_PDF)).rejects.toThrow(/encrypted/i);
  });

  test('falls back to the page’s preview image, drawn at the piece’s place, and says why in the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const url = URL.createObjectURL(new Blob([PREVIEW], { type: 'image/png' }));
    const asset: PdfSource = { kind: 'pdf', src: 1, page: 1, pageRotation: 0, view: [0, 0, 200, 200], bytes: PASSWORD_PDF, url, w: 200 * MM, h: 200 * MM };
    try {
      const out = await buildPdf({ ...SHEET, pages: [{ pieces: [{ asset, x: 20, y: 30, scale: 50, r: 0, crop: null }] }], title: 't' });
      const { kinds, text } = await firstPage(out);
      expect(kinds).toEqual(['/Image']);
      // 200 pt at 50 %: a 100 × 100 pt image whose top left corner is 20 mm from the left and 30 mm from the top.
      // pdf-lib's drawImage: translate to the corner, (rotate), scale to the size, then draw.
      const draw = /^q\n1 0 0 1 (\S+) (\S+) cm\n1 0 0 1 0 0 cm\n(\S+) 0 0 (\S+) 0 0 cm\n1 0 0 1 0 0 cm\n\/Image-\d+ Do\nQ$/.exec(text.trim());
      expect(draw, text).not.toBeNull();
      const [x, y, w, h] = draw!.slice(1).map(Number);
      expect(w).toBeCloseTo(100, 3);
      expect(h).toBeCloseTo(100, 3);
      expect(x).toBeCloseTo(20 / MM, 3);
      expect(y).toBeCloseTo((297 - 30) / MM - 100, 3);
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toMatch(/could not be embedded as a vector/);
    } finally {
      URL.revokeObjectURL(url);
    }
  });

  test('the same page unencrypted stays a vector (no fallback)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const source = await PDFDocument.create();
    source.addPage([200, 200]).drawRectangle({ x: 10, y: 10, width: 50, height: 50 });
    const bytes = await source.save();
    const asset: PdfSource = { kind: 'pdf', src: 2, page: 1, pageRotation: 0, view: [0, 0, 200, 200], bytes, url: 'blob:unused', w: 200 * MM, h: 200 * MM };
    const out = await buildPdf({ ...SHEET, pages: [{ pieces: [{ asset, x: 20, y: 30, scale: 50, r: 0, crop: null }] }], title: 't' });
    expect((await firstPage(out)).kinds).toEqual(['/Form']);
    expect(warn).not.toHaveBeenCalled();
  });
});
