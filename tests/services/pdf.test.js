import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, degrees, rgb } from 'pdf-lib';
import { buildPdf } from '../../src/services/pdf.ts';
import { cutStyle } from '../../src/core/cutmarks.js';
import { drawParams } from '../../src/core/crop.js';
import { cutLines } from '../../src/core/cutmarks.js';
import { qrDrawing } from '../../src/core/qrshape.js';

const PT = 72 / 25.4;

// A 2 × 2 px PNG (RGB), built by hand: enough for pdf-lib to embed it.
function png() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 0]);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const image = { kind: 'image', src: 1, format: 'png', bytes: png(), w: 50, h: 30 };
const SHEET = { width: 210, height: 297 };

// What the export did before crops existed (to compare byte for byte).
function oldPlacement({ x, y, scale, r }, asset, sheetHeight) {
  const k = scale / 100;
  const [w, h] = r % 180 ? [asset.h * k, asset.w * k] : [asset.w * k, asset.h * k];
  return {
    x: (x + (r === 180 || r === 270 ? w : 0)) * PT,
    y: (sheetHeight - y - (r === 90 || r === 180 ? 0 : h)) * PT,
    width: asset.w * k * PT,
    height: asset.h * k * PT,
    rotate: degrees(-r),
  };
}

async function oldPdf(pieces) {
  const doc = await PDFDocument.create();
  doc.setTitle('t');
  doc.setCreator('t');
  const page = doc.addPage([SHEET.width * PT, SHEET.height * PT]);
  const embedded = await doc.embedPng(image.bytes);
  for (const piece of pieces) page.drawImage(embedded, oldPlacement(piece, image, SHEET.height));
  return doc.save();
}

/** Each page's content operators, decoded. */
async function contents(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPages().map((page) => {
    const stream = page.node.Contents();
    const list = stream.asArray ? stream.asArray().map((ref) => doc.context.lookup(ref)) : [stream];
    return list.map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : '')).join('\n');
  });
}

async function xobjectTypes(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const xobj = doc.getPages()[0].node.Resources().lookup(PDFName.of('XObject'));
  return xobj.keys().map((key) => doc.context.lookup(xobj.get(key)).dict.get(PDFName.of('Subtype')).toString());
}

const numbers = (text) => text.trim().split(/\s+/).map(Number);

describe('buildPdf', () => {
  test('without crop or lines: the same content as before, byte for byte, in the 4 rotations', async () => {
    const pieces = [0, 90, 180, 270].map((r, i) => ({ asset: image, x: 10 + i * 45, y: 20 + i * 30, scale: 37.5 + i * 10, r, crop: null }));
    const now = await buildPdf({ ...SHEET, pages: [{ pieces, lines: [] }], title: 't' });
    const before = await oldPdf(pieces);
    assert.deepEqual(await contents(now), await contents(before));
  });

  test('with a crop: the whole image inside a clipping path (the piece’s rectangle)', async () => {
    const piece = { asset: image, x: 30, y: 40, scale: 120, r: 90, crop: { x: 0.25, y: 0.1, w: 0.5, h: 0.6 } };
    const [content] = await contents(await buildPdf({ ...SHEET, pages: [{ pieces: [piece] }], title: 't' }));
    const p = drawParams(piece, image, SHEET.height);
    const match = /q\n(\S+) (\S+) (\S+) (\S+) re\nW\nn\n([\s\S]*?)\nQ/.exec(content);
    assert.ok(match, content);
    const rect = numbers(match.slice(1, 5).join(' '));
    for (const [got, want] of rect.map((v, i) => [v, [p.clip.x, p.clip.y, p.clip.width, p.clip.height][i]])) assert.ok(Math.abs(got - want) < 1e-3, `${got} ≠ ${want}`);
    assert.match(match[5], /\/Image-\d+ Do/, 'the image is drawn inside the clip');
  });

  test('with a crop, a PDF page stays vector (a Form XObject)', async () => {
    const source = await PDFDocument.create();
    const pg = source.addPage([200, 100]);
    pg.drawRectangle({ x: 10, y: 10, width: 50, height: 30, color: rgb(1, 0, 0) });
    const bytes = await source.save();
    const pdf = { kind: 'pdf', src: 2, page: 1, pages: 1, pageRotation: 0, view: [0, 0, 200, 100], bytes, w: (200 / 72) * 25.4, h: (100 / 72) * 25.4 };
    const out = await buildPdf({ ...SHEET, pages: [{ pieces: [{ asset: pdf, x: 10, y: 10, scale: 100, r: 0, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } }] }], title: 't' });
    assert.deepEqual(await xobjectTypes(out), ['/Form']);
    const [content] = await contents(out);
    assert.match(content, /re\nW\nn\n[\s\S]*Do\nQ/);
  });

  test('cut lines: one thin black stroke per segment, at its coordinates; without lines, nothing extra', async () => {
    const boxes = [
      { x: 20, y: 20, w: 50, h: 30 },
      { x: 80, y: 20, w: 50, h: 30 },
    ];
    const lines = cutLines(boxes, { mode: 'corners', length: 4, offset: 1.5, bounds: { x: 0, y: 0, w: SHEET.width, h: SHEET.height } });
    const pieces = boxes.map((b) => ({ asset: image, x: b.x, y: b.y, scale: 100, r: 0, crop: null }));
    const [withLines] = await contents(await buildPdf({ ...SHEET, pages: [{ pieces, lines }], title: 't' }));
    const [without] = await contents(await buildPdf({ ...SHEET, pages: [{ pieces, lines: [] }], title: 't' }));
    const strokes = [...withLines.matchAll(/(\S+) (\S+) m\n(\S+) (\S+) l\nS/g)].map((m) => m.slice(1, 5).map(Number));
    assert.equal(strokes.length, lines.length);
    lines.forEach((line, i) => {
      const want = [line.x1 * PT, (SHEET.height - line.y1) * PT, line.x2 * PT, (SHEET.height - line.y2) * PT];
      strokes[i].forEach((v, j) => assert.ok(Math.abs(v - want[j]) < 1e-3, `line ${i}: ${v} ≠ ${want[j]}`));
    });
    assert.match(withLines, /0\.25 w/);
    assert.match(withLines, /0 0 0 RG/);
    assert.doesNotMatch(withLines, /\[\d[^\]]*\] \S+ d/, 'solid: no dash pattern');
    assert.ok(withLines.startsWith(without), 'the lines go after the pieces, without changing the rest');
    assert.equal((without.match(/ l\nS/g) ?? []).length, 0);
  });

  test('cut lines take the chosen weight, color and dash', async () => {
    const lines = [{ x1: 10, y1: 10, x2: 60, y2: 10 }];
    const pieces = [{ asset: image, x: 20, y: 20, scale: 100, r: 0, crop: null }];
    const style = cutStyle({ weight: 'thick', color: '#ff8000', dash: 'dotted' });
    const [content] = await contents(await buildPdf({ ...SHEET, pages: [{ pieces, lines }], title: 't', cutStyle: style }));
    assert.match(content, /\n1 w\n/);
    assert.match(content, /1 0\.50196\d* 0 RG/);
    assert.match(content, new RegExp(`\\[${style.dash[0]} ${style.dash[1]}\\] 0 d`));
  });

  test('contour cut lines: vector paths after the pieces and the segments, closed ones closed, in the chosen stroke', async () => {
    const pieces = [{ asset: image, x: 20, y: 20, scale: 100, r: 0, crop: null }];
    const lines = [{ x1: 10, y1: 10, x2: 60, y2: 10 }];
    const paths = [
      { points: [20, 20, 70, 20, 70, 50, 20, 50], closed: true },
      { points: [100, 100, 120, 110, 140, 100], closed: false },
    ];
    const style = cutStyle({ weight: 'medium', color: '#ff8000', dash: 'dotted' });
    const [withPaths] = await contents(await buildPdf({ ...SHEET, pages: [{ pieces, lines, paths }], title: 't', cutStyle: style }));
    const [without] = await contents(await buildPdf({ ...SHEET, pages: [{ pieces, lines }], title: 't', cutStyle: style }));
    assert.ok(withPaths.startsWith(without), 'the paths go last, without changing the rest');
    const drawn = withPaths.slice(without.length);
    assert.match(drawn, /\n1 0\.50196\d* 0 RG\n0\.5 w\n/);
    assert.match(drawn, new RegExp(`\\[${style.dash[0]} ${style.dash[1]}\\] 0 d`));
    const subpaths = [...drawn.matchAll(/(\S+) (\S+) m\n((?:\S+ \S+ l\n)*)(h\n)?/g)].map((m) => ({
      points: [m[1], m[2], ...m[3].trim().split(/\s+/).filter((v) => v !== 'l')].map(Number),
      closed: !!m[4],
    }));
    assert.equal(subpaths.length, 2);
    subpaths.forEach((got, i) => {
      assert.equal(got.closed, paths[i].closed);
      const want = paths[i].points.map((v, j) => (j % 2 ? (SHEET.height - v) * PT : v * PT));
      assert.equal(got.points.length, want.length);
      got.points.forEach((v, j) => assert.ok(Math.abs(v - want[j]) < 1e-3, `path ${i}: ${v} ≠ ${want[j]}`));
    });
    assert.match(drawn, /\nS\nQ\n?$/, 'one stroke for every path');
  });

  test('a JPEG given as a view into a larger buffer is embedded from its own bytes', async () => {
    const file = readFileSync(new URL('../../e2e/fixtures/small.jpg', import.meta.url));
    const padded = new Uint8Array(file.byteLength + 7);
    padded.set(file, 7);
    const jpg = { kind: 'image', src: 2, format: 'jpg', bytes: padded.subarray(7), w: 80, h: 60 };
    const out = await buildPdf({ ...SHEET, pages: [{ pieces: [{ asset: jpg, x: 10, y: 10, scale: 100, r: 0, crop: null }] }], title: 't' });
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const streams = doc.context.enumerateIndirectObjects().map(([, object]) => object).filter((object) => object instanceof PDFRawStream && String(object.dict.get(PDFName.of('Subtype'))) === '/Image');
    assert.equal(streams.length, 1);
    assert.deepEqual(Buffer.from(streams[0].contents), Buffer.from(file));
  });

  test('a QR code is drawn as vector paths in its box; only its logo and caption are images, each embedded once', async () => {
    const drawing = qrDrawing('https://scooch.app', { dots: 'rounded', eyes: 'rounded', logo: 1 });
    const band = drawing.units * 0.16;
    const qr = { kind: 'qr', w: 40, h: 46.4, units: drawing.units, band, dots: drawing.dots, eyes: drawing.eyes, color: [0.1, 0.2, 0.6], background: [1, 1, 0.9], bytes: png(), logo: { format: 'png', box: drawing.logo }, caption: png() };
    const pieces = [
      { asset: qr, x: 20, y: 30, scale: 50, r: 0, crop: null },
      { asset: qr, x: 100, y: 30, scale: 75, r: 90, crop: null },
    ];
    const out = await buildPdf({ ...SHEET, pages: [{ pieces }], title: 't' });
    // Each drawing names the image again; behind the names, two images.
    const doc = await PDFDocument.load(out, { updateMetadata: false });
    const xobj = doc.getPages()[0].node.Resources().lookup(PDFName.of('XObject'));
    assert.equal(new Set(xobj.keys().map((key) => xobj.get(key).toString())).size, 2);
    assert.deepEqual([...new Set(await xobjectTypes(out))], ['/Image']);
    const [content] = await contents(out);
    // Each piece: its box (crop.drawParams) in module units, then the background, the modules and the eyes filled, the logo and the caption.
    for (const piece of pieces) {
      const p = drawParams(piece, qr, SHEET.height);
      assert.ok(content.includes(`q\n1 0 0 1 ${p.x} ${p.y} cm\n`), `placed at ${p.x}, ${p.y}`);
      assert.ok(content.includes(` 0 0 cm\n${p.width / qr.units} 0 0 ${p.height / (qr.units + band)} 0 0 cm\n`), 'scaled to its modules');
    }
    assert.equal((content.match(/\nf\n/g) ?? []).length, 6, 'background, modules and eyes, twice');
    assert.ok((content.match(/ c\n/g) ?? []).length > 200, 'rounded modules and eyes are curves');
    assert.equal((content.match(/ Do\n/g) ?? []).length, 4, 'the logo and the caption, twice');
  });

  test('several pages: each with its own', async () => {
    const piece = { asset: image, x: 10, y: 10, scale: 100, r: 0, crop: null };
    const out = await buildPdf({ ...SHEET, pages: [{ pieces: [piece] }, { pieces: [piece, { ...piece, x: 100 }] }], title: 't' });
    const pages = await contents(out);
    assert.equal(pages.length, 2);
    assert.equal((pages[0].match(/ Do/g) ?? []).length, 1);
    assert.equal((pages[1].match(/ Do/g) ?? []).length, 2);
  });
});
