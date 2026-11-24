// The pieces' contour cut lines (services/contours.ts): what is traced and
// when, with a tracer that traces masks drawn here as the worker traces an
// image (services/alpha.traceAlpha); what stands in meanwhile; why an image
// keeps its rectangle; and the PDF, which waits.
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { placeLoops, traceShape } from '../../src/core/contour.js';
import { pieceSize } from '../../src/core/crop.js';
import { cutLines } from '../../src/core/cutmarks.js';
import { DEFAULT_CUTS } from '../../src/core/projectdoc.js';
import type { Cuts } from '../../src/core/types.ts';
import { addAsset, getAsset } from '../../src/state/assets.ts';
import { setDocument, type Piece } from '../../src/state/document.ts';
import { makePdf } from '../../src/services/export.ts';
import { lacksTransparency, setTracer, shapeOf, shapesReady, sheetCuts, showShapes, type TraceRequest } from '../../src/services/contours.ts';
import { traceAlpha } from '../../src/services/alpha.ts';
import type { ImageAsset } from '../../src/services/assets.ts';
import { disc, maskOf } from '../support/contour.ts';
import { rgbPng } from '../support/png.ts';
import { fakeImage, fakePdf, piece, resetState } from '../support/state.ts';

const W = 210;
const H = 297;
const MM_PER_PT = 25.4 / 72;

/** A round sticker: 600 × 600 px, a disc of 250 px radius in the middle. */
const STICKER = maskOf(600, 600, disc(300, 300, 250));
/** A photo saved as PNG: nothing transparent anywhere. */
const PHOTO = maskOf(600, 600, () => true);

let traced: TraceRequest[] = [];
/** What the images traced are (the worker decodes each one's preview). */
let mask = STICKER;
/** Resolves the traces held back (with `hold`), in order. */
let held: (() => void)[] = [];
let hold = false;
let fail = false;

function tracer(request: TraceRequest) {
  traced.push(request);
  const run = () => {
    if (fail) throw new Error('no luck');
    return traceAlpha(mask, request);
  };
  if (!hold) return Promise.resolve().then(run);
  return new Promise<ReturnType<typeof run>>((resolve, reject) =>
    held.push(() => {
      try {
        resolve(run());
      } catch (err) {
        reject(err);
      }
    })
  );
}

/** Lets every pending trace and its notification run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const cuts = (patch: Partial<Cuts> = {}): Cuts => ({ ...DEFAULT_CUTS, mode: 'contour', ...patch });

let png: string;

beforeEach(() => {
  traced = [];
  held = [];
  hold = false;
  fail = false;
  mask = STICKER;
  setTracer(tracer);
  resetState();
  png = fakeImage({ name: 'pegatina.png', px: [600, 600], format: 'png' });
});
afterEach(() => setTracer(null));

describe('what is traced', () => {
  test('a transparent PNG once per crop and margin: moving, rotating or another copy reuse it', async () => {
    const items = [piece(1, png, 10, 10), piece(2, png, 80, 10, { r: 90 })];
    showShapes('sheet', items, 0);
    await settle();
    expect(traced).toHaveLength(1);
    showShapes('sheet', [piece(1, png, 30, 40), piece(2, png, 80, 10, { r: 180 })], 0);
    await settle();
    expect(traced).toHaveLength(1);
    showShapes('sheet', [piece(1, png, 30, 40, { crop: { x: 0, y: 0, w: 0.5, h: 1 } })], 0);
    await settle();
    expect(traced).toHaveLength(2);
    showShapes('sheet', [piece(1, png, 30, 40)], 2);
    await settle();
    expect(traced).toHaveLength(3);
    expect(traced.map((r) => [r.w, r.h])).toEqual([
      [1, 1],
      [0.5, 1],
      [1, 1],
    ]);
  });

  test('resizing reuses the shape while the margin is 0; with a margin it traces again', async () => {
    showShapes('sheet', [piece(1, png, 10, 10)], 0);
    showShapes('sheet', [piece(1, png, 10, 10, { scale: 150 })], 0);
    await settle();
    expect(traced).toHaveLength(1);
    showShapes('sheet', [piece(1, png, 10, 10)], 3);
    await settle();
    showShapes('sheet', [piece(1, png, 10, 10, { scale: 150 })], 3);
    await settle();
    expect(traced.map((r) => r.margin)).toEqual([0, expect.closeTo(3 / 50.8, 3), expect.closeTo(3 / 76.2, 3)]);
  });

  test('JPEG images and PDF pages keep the rectangle and are never traced', async () => {
    const jpg = fakeImage({ name: 'foto.jpg', src: 2, format: 'jpg' });
    const pdf = fakePdf({ src: 3 });
    const items = [piece(1, jpg, 10, 10), piece(2, pdf, 60, 10, { scale: 20 })];
    showShapes('sheet', items, 0);
    await settle();
    expect(traced).toEqual([]);
    expect(items.map((item) => shapeOf(item, 0))).toEqual([null, null]);
    const boxes = items.map((item) => ({ x: item.x, y: item.y, ...pieceSize(getAsset(item.asset), item) }));
    expect(sheetCuts(items, cuts(), W, H)).toEqual({ lines: cutLines(boxes, { mode: 'outline', bounds: { x: 0, y: 0, w: W, h: H } }), paths: [] });
  });

  test('what a sheet stops showing before its turn is never traced', async () => {
    hold = true;
    const other = fakeImage({ name: 'otra.png', src: 2, px: [600, 600], format: 'png' });
    showShapes('sheet', [piece(1, png, 10, 10)], 0);
    await settle();
    // The first one is being traced; the second waits its turn, and goes.
    showShapes('sheet', [piece(1, png, 10, 10), piece(2, other, 80, 10)], 0);
    showShapes('sheet', [piece(1, png, 10, 10)], 0);
    held.shift()!();
    await settle();
    expect(traced).toHaveLength(1);
    expect(held).toEqual([]);
  });
});

describe('what the sheet shows meanwhile', () => {
  test('nothing until the first shape is ready; after a change, the previous shape until the new one is', async () => {
    hold = true;
    const item = piece(1, png, 10, 10);
    showShapes('sheet', [item], 0);
    await settle();
    expect(shapeOf(item, 0)).toBeUndefined();
    expect(sheetCuts([item], cuts(), W, H)).toEqual({ lines: [], paths: [] });
    held.shift()!();
    await settle();
    const exact = shapeOf(item, 0)!;
    const { uw, uh } = pieceSize(getAsset(png), item);
    expect(exact).toEqual(placeLoops(traceShape(STICKER, { w: 1, h: 1, margin: 0 })!, { x: 10, y: 10, r: 0, uw, uh, k: uw }));
    expect(sheetCuts([item], cuts(), W, H).paths).toHaveLength(1);
    // With a 2 mm margin, the shape without it stands in until it is traced.
    showShapes('sheet', [item], 2);
    await settle();
    expect(shapeOf(item, 2)).toEqual(exact);
    held.shift()!();
    await settle();
    expect(shapeOf(item, 2)).not.toEqual(exact);
  });

  test('a shape that can’t be traced is the rectangle', async () => {
    fail = true;
    const item = piece(1, png, 10, 10);
    await shapesReady([item], 0);
    expect(shapeOf(item, 0)).toBeNull();
    expect(sheetCuts([item], cuts(), W, H).lines).toHaveLength(4);
  });
});

describe('why an image keeps its rectangle', () => {
  test('a JPEG and a PDF page lack transparency from the start without being traced', async () => {
    const items = [piece(1, fakeImage({ name: 'foto.jpg', src: 2, format: 'jpg' }), 10, 10), piece(2, fakePdf({ src: 3 }), 60, 10, { scale: 20 })];
    expect(items.map((item) => lacksTransparency(item, 0))).toEqual([true, true]);
    showShapes('sheet', items, 0);
    await settle();
    expect(traced).toEqual([]);
  });

  test('a PNG with nothing transparent lacks it once traced and keeps its rectangle', async () => {
    hold = true;
    mask = PHOTO;
    const item = piece(1, png, 10, 10);
    showShapes('sheet', [item], 0);
    await settle();
    expect(lacksTransparency(item, 0), 'not known while it is traced').toBe(false);
    held.shift()!();
    await settle();
    expect(lacksTransparency(item, 0)).toBe(true);
    expect(shapeOf(item, 0)).toBeNull();
    expect(sheetCuts([item], cuts(), W, H)).toMatchObject({ lines: { length: 4 }, paths: [] });
    // With another margin, while it is traced again, the trace before still says so.
    showShapes('sheet', [item], 2);
    await settle();
    expect(lacksTransparency(item, 2)).toBe(true);
  });

  test('neither a PNG traced as a shape nor one whose trace failed is said to lack it', async () => {
    const item = piece(1, png, 10, 10);
    await shapesReady([item], 0);
    expect(lacksTransparency(item, 0)).toBe(false);
    fail = true;
    const other = piece(2, fakeImage({ name: 'otra.png', src: 2, px: [600, 600], format: 'png' }), 80, 10);
    await shapesReady([other], 0);
    expect(shapeOf(other, 0)).toBeNull();
    expect(lacksTransparency(other, 0), 'a failed trace says nothing of the image').toBe(false);
  });

  test('a crop decides: the transparent part cropped out lacks it and in view again does not', async () => {
    // Transparent only along the left tenth.
    mask = maskOf(600, 600, (x) => x > 60);
    const whole = piece(1, png, 10, 10);
    const cropped = piece(1, png, 10, 10, { crop: { x: 0.2, y: 0, w: 0.8, h: 1 } });
    await shapesReady([cropped], 0);
    expect(lacksTransparency(cropped, 0)).toBe(true);
    await shapesReady([whole], 0);
    expect(lacksTransparency(whole, 0)).toBe(false);
  });
});

describe('the PDF', () => {
  /** A real PNG (pdf-lib embeds it) for an asset traced as the round sticker. */
  function stickerAsset() {
    const asset: ImageAsset = { ...(getAsset(png) as ImageAsset), bytes: rgbPng(600, 600) };
    return addAsset(asset);
  }

  async function contentOf(pdf: Blob) {
    const doc = await PDFDocument.load(await pdf.arrayBuffer(), { updateMetadata: false });
    const stream = doc.getPages()[0].node.Contents();
    const list = stream && 'asArray' in stream ? stream.asArray().map((ref) => doc.context.lookup(ref)) : [stream];
    return list.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : '')).join('\n');
  }

  test('waits for every contour and draws it as a vector path, where the sheet draws it', async () => {
    hold = true;
    const key = stickerAsset();
    const item: Piece = piece(1, key, 20, 30, { r: 90, crop: { x: 0.25, y: 0, w: 0.75, h: 1 } });
    setDocument({ items: [item], cuts: cuts({ margin: 2 }) });
    const job = makePdf();
    await settle();
    expect(traced).toHaveLength(1);
    held.shift()!();
    const content = await contentOf(await job);
    const [path] = sheetCuts([item], cuts({ margin: 2 }), W, H).paths;
    expect(path.closed).toBe(true);
    const moves = [...content.matchAll(/(\S+) (\S+) m\n/g)].map((m) => [Number(m[1]) * MM_PER_PT, H - Number(m[2]) * MM_PER_PT]);
    expect(moves).toHaveLength(1);
    expect(moves[0][0]).toBeCloseTo(path.points[0], 3);
    expect(moves[0][1]).toBeCloseTo(path.points[1], 3);
    expect(content.match(/ l\n/g)).toHaveLength(path.points.length / 2 - 1);
    expect(content).toMatch(/h\nS\nQ/);
  });
});
