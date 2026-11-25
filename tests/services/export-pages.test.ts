// @vitest-environment jsdom
// The document’s PDF (makePdf, built with pdf-lib): one page per sheet
// that has pieces, empty sheets skipped, in the sheets' order, each the size of
// the paper. Every piece is a different real PNG (its width in pixels tells
// which one it is), so each page's images say which sheet it came from.
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, type PDFDict } from 'pdf-lib';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { addAsset } from '../../src/state/assets.ts';
import { makePdf } from '../../src/services/export.ts';
import { buildQr } from '../../src/services/qr.ts';
import { getDocument } from '../../src/state/document.ts';
import { choosePaper } from '../../src/state/actions/sheets.ts';
import { piece, resetState } from '../support/state.ts';

const MM_PER_PT = 25.4 / 72;

/** A `w` × 2 px RGB PNG (pdf-lib embeds it as it is). */
function png(w: number) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 128)]);
  const raw = Buffer.concat([row, row]);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/** An image asset whose PNG is `w` px wide (and 30 × 20 mm on the sheet). */
const image = (w: number) =>
  addAsset({ kind: 'image', name: `img${w}.png`, src: w, px: [w, 2], w: 30, h: 20, bytes: png(w), preview: new Blob(), url: 'blob:test', format: 'png', dpi: 300, derived: false });

/** Each page: its size in mm (rounded to 0.1) and the pixel widths of its images, sorted. */
async function pagesOf(pdf: Blob) {
  const doc = await PDFDocument.load(await pdf.arrayBuffer(), { updateMetadata: false });
  return doc.getPages().map((page) => {
    const { width, height } = page.getSize();
    const xobjects = page.node.Resources()?.lookup(PDFName.of('XObject')) as PDFDict | undefined;
    const widths = (xobjects?.keys() ?? []).map((key) => {
      const stream = doc.context.lookup(xobjects!.get(key)) as PDFRawStream;
      return Number(String(stream.dict.get(PDFName.of('Width'))));
    });
    return { w: Math.round(width * MM_PER_PT * 10) / 10, h: Math.round(height * MM_PER_PT * 10) / 10, images: widths.sort((a, b) => a - b) };
  });
}

/**
 * Four sheets: 3 pieces, none, 1 and 2; the sheets' order (ids 4, 2, 9, 7) is
 * not the order of their ids nor of the pieces in the document.
 */
function fourSheets() {
  const at = (id: number, sheet: number, w: number, x: number) => piece(id, image(w), x, 20, { sheet });
  resetState({
    sheets: [{ id: 4 }, { id: 2 }, { id: 9 }, { id: 7 }],
    items: [at(1, 7, 61, 20), at(2, 4, 11, 20), at(3, 9, 41, 20), at(4, 4, 12, 60), at(5, 7, 62, 60), at(6, 4, 13, 100)],
  });
}

beforeEach(fourSheets);

describe('the PDF of several sheets', () => {
  test('one page per sheet with pieces, empty sheets skipped, in the sheets’ order, each piece on its sheet’s page', async () => {
    const pages = await pagesOf(await makePdf());
    expect(pages.map((page) => page.images)).toEqual([[11, 12, 13], [41], [61, 62]]);
  });

  test('every page is the size of the paper: A4, and A5 after choosing it', async () => {
    expect((await pagesOf(await makePdf())).map(({ w, h }) => [w, h])).toEqual([
      [210, 297],
      [210, 297],
      [210, 297],
    ]);
    choosePaper('A5');
    expect((await pagesOf(await makePdf())).map(({ w, h }) => [w, h])).toEqual([
      [148, 210],
      [148, 210],
      [148, 210],
    ]);
  });

  test('a sheet emptied in the middle drops its page; the others keep their order', async () => {
    const { sheets, items } = getDocument();
    resetState({ sheets, items: items.filter((item) => item.sheet !== 9) });
    const pages = await pagesOf(await makePdf());
    expect(pages.map((page) => page.images)).toEqual([
      [11, 12, 13],
      [61, 62],
    ]);
  });
});

describe('a QR code', () => {
  test('its caption is rasterized at 600 ppi for its largest piece and its logo is embedded as it is', async () => {
    let n = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:qr/${++n}`);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({ measureText: () => ({ width: 10 }) }, { get: (target, key) => (target as Record<PropertyKey, unknown>)[key] ?? (() => {}) }) as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
    // The caption's raster is as many px wide as the canvas it was drawn into.
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, done: BlobCallback) {
      done(new Blob([png(this.width) as BlobPart], { type: 'image/png' }));
    });
    const logo = png(7);
    const qr = await buildQr({ text: 'https://scooch.app', color: '#000000', background: '#ffffff', dots: 'square', eyes: 'square', caption: 'Menú', logo: { src: 99, format: 'png', px: [7, 2], bytes: logo, blob: new Blob([logo as BlobPart]), hash: 'h-logo' } }, 40);
    const key = addAsset(qr);
    resetState({ items: [piece(1, key, 20, 20, { scale: 50 }), piece(2, key, 100, 20, { scale: 100 })] });
    const [page] = await pagesOf(await makePdf());
    // Both pieces draw the same logo and the same caption: 40 mm at 100 % is 945 px at 600 ppi.
    const caption = Math.round((40 * 600) / 25.4);
    expect(page.images).toEqual([7, 7, caption, caption]);
    vi.restoreAllMocks();
  });
});
