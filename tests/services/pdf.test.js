import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, degrees, rgb } from 'pdf-lib';
import { buildPdf } from '../../src/services/pdf.ts';
import { cutStyle } from '../../src/core/cutmarks.js';
import { drawParams } from '../../src/core/crop.js';
import { cutLines } from '../../src/core/cutmarks.js';

const PT = 72 / 25.4;

// PNG de 2 × 2 px (RGB), armado a mano: alcanza para que pdf-lib lo embeba.
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

// Lo que hacía export.js antes del recorte (para comparar byte a byte).
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

/** Operadores del contenido de cada página, decodificados. */
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
  test('sin recorte ni líneas: el mismo contenido que antes, byte a byte, en los 4 giros', async () => {
    const pieces = [0, 90, 180, 270].map((r, i) => ({ asset: image, x: 10 + i * 45, y: 20 + i * 30, scale: 37.5 + i * 10, r, crop: null }));
    const now = await buildPdf({ ...SHEET, pages: [{ pieces, lines: [] }], title: 't' });
    const before = await oldPdf(pieces);
    assert.deepEqual(await contents(now), await contents(before));
  });

  test('con recorte: la imagen entera dentro de un trazado de recorte (el rectángulo de la pieza)', async () => {
    const piece = { asset: image, x: 30, y: 40, scale: 120, r: 90, crop: { x: 0.25, y: 0.1, w: 0.5, h: 0.6 } };
    const [content] = await contents(await buildPdf({ ...SHEET, pages: [{ pieces: [piece] }], title: 't' }));
    const p = drawParams(piece, image, SHEET.height);
    const match = /q\n(\S+) (\S+) (\S+) (\S+) re\nW\nn\n([\s\S]*?)\nQ/.exec(content);
    assert.ok(match, content);
    const rect = numbers(match.slice(1, 5).join(' '));
    for (const [got, want] of rect.map((v, i) => [v, [p.clip.x, p.clip.y, p.clip.width, p.clip.height][i]])) assert.ok(Math.abs(got - want) < 1e-3, `${got} ≠ ${want}`);
    assert.match(match[5], /\/Image-\d+ Do/, 'la imagen se dibuja adentro del recorte');
  });

  test('con recorte, una página de PDF sigue siendo vector (Form XObject)', async () => {
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

  test('líneas de corte: un trazo fino negro por segmento, en sus coordenadas; sin líneas, nada extra', async () => {
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
      strokes[i].forEach((v, j) => assert.ok(Math.abs(v - want[j]) < 1e-3, `línea ${i}: ${v} ≠ ${want[j]}`));
    });
    assert.match(withLines, /0\.25 w/);
    assert.match(withLines, /0 0 0 RG/);
    assert.doesNotMatch(withLines, /\[\d[^\]]*\] \S+ d/, 'solid: no dash pattern');
    assert.ok(withLines.startsWith(without), 'las líneas van después de las piezas, sin cambiar lo demás');
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

  test('varias páginas: cada una con lo suyo', async () => {
    const piece = { asset: image, x: 10, y: 10, scale: 100, r: 0, crop: null };
    const out = await buildPdf({ ...SHEET, pages: [{ pieces: [piece] }, { pieces: [piece, { ...piece, x: 100 }] }], title: 't' });
    const pages = await contents(out);
    assert.equal(pages.length, 2);
    assert.equal((pages[0].match(/ Do/g) ?? []).length, 1);
    assert.equal((pages[1].match(/ Do/g) ?? []).length, 2);
  });
});
