// @vitest-environment jsdom
// A QR code piece's picture (src/services/qr.ts): the SVG the sheet shows,
// read back by jsQR from its own path data, with its colors, logo and
// caption; its size, name and signature; and one restored from a document
// with its logo's file.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { assetMeta } from '../../src/core/projectdoc.js';
import { CAPTION_BAND } from '../../src/core/qrshape.js';
import type { QrAssetMeta } from '../../src/core/types.ts';
import type { QrLogo } from '../../src/services/assets.ts';
import { buildQr, restoreQr, type QrFields } from '../../src/services/qr.ts';
import { blobOfBytes } from '../../src/services/storage/hash.ts';
import { decode, rasterizeQr } from '../support/qr.ts';

const FIELDS: QrFields = { text: 'https://scooch.app/es/', color: '#1f3a93', background: '#fff8e7', dots: 'rounded', eyes: 'rounded', caption: '', logo: null };
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const logo = (): QrLogo => ({ src: 4, format: 'png', px: [200, 100], bytes: PNG, blob: blobOfBytes(PNG, 'image/png'), hash: 'h-logo' });

/** The picture's text (jsdom's Blob can't be read back, so it is read from its parts). */
async function svgOf(blob: Blob) {
  return new TextDecoder().decode(await blob.arrayBuffer());
}

/** The SVG's paths, drawn as the browser draws them, read by jsQR. */
function read(svg: string, { color = '#000000', background = '#ffffff' as string | null } = {}) {
  const [, units] = /viewBox="0 0 (\d+) /.exec(svg)!;
  const [dots, eyes] = [...svg.matchAll(/<path fill="[^"]+" d="([^"]*)"\/>/g)].map((m) => m[1]);
  const box = /<image href="data:image\/png;base64,[^"]+" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"\/>/.exec(svg);
  const logoBox = box ? { x: +box[1], y: +box[2], w: +box[3], h: +box[4] } : null;
  return decode(rasterizeQr({ units: Number(units), dots, eyes, logo: logoBox }, { color, background }));
}

beforeEach(() => {
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:qr/${++n}`);
  // jsdom has no canvas: a caption is drawn into a fake one.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({ measureText: () => ({ width: 10 }) }, { get: (target, key) => (target as Record<PropertyKey, unknown>)[key] ?? (() => {}) }) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,Q0FQVElPTg==');
});

afterEach(() => vi.restoreAllMocks());

describe('buildQr', () => {
  test('its picture is an SVG of its paths in its colors that reads back as its text', async () => {
    const qr = await buildQr(FIELDS, 40);
    expect(qr.preview.type).toBe('image/svg+xml');
    expect(qr.url).toMatch(/^blob:/);
    const svg = await svgOf(qr.preview);
    expect(svg).toContain(`fill="${FIELDS.color}"`);
    expect(svg).toContain(`<rect width="${qr.drawing.units}" height="${qr.drawing.units}" fill="${FIELDS.background}"/>`);
    expect(svg).toContain(qr.drawing.dots);
    expect(svg).toContain(qr.drawing.eyes);
    expect(read(svg, { color: FIELDS.color, background: FIELDS.background })).toBe(FIELDS.text);
    expect(qr).toMatchObject({ kind: 'qr', w: 40, h: 40, logo: null, bytes: new Uint8Array() });
  });

  test('a transparent background draws nothing under the code', async () => {
    const svg = await svgOf((await buildQr({ ...FIELDS, background: null }, 40)).preview);
    expect(svg).not.toContain('<rect');
  });

  test('a logo goes inside the picture as data and the code still reads', async () => {
    const qr = await buildQr({ ...FIELDS, logo: logo() }, 40);
    const svg = await svgOf(qr.preview);
    expect(svg).toContain(`<image href="data:image/png;base64,${btoa(String.fromCharCode(...PNG))}"`);
    expect(qr.drawing.logo!.w / qr.drawing.logo!.h).toBeCloseTo(2, 9);
    expect(read(svg)).toBe(FIELDS.text);
    expect(qr.bytes).toBe(PNG);
    expect(qr.hashes?.src).toBe('h-logo');
  });

  test('a caption adds its band under the code, and an existing band is kept', async () => {
    const qr = await buildQr({ ...FIELDS, caption: 'Escanea el menú' }, 40);
    expect(qr.h).toBeCloseTo(40 * (1 + CAPTION_BAND), 9);
    const svg = await svgOf(qr.preview);
    expect(svg).toContain(`<image href="data:image/png;base64,Q0FQVElPTg==" x="0" y="${qr.drawing.units}"`);
    expect((await buildQr({ ...FIELDS, caption: 'Otro' }, 40, 50)).h).toBe(50);
    expect((await buildQr(FIELDS, 40, 50)).h).toBe(40);
  });

  test('its name is its text on one line or «Código QR» without one', async () => {
    expect((await buildQr({ ...FIELDS, text: '  Hola\nmundo ' }, 40)).name).toBe('Hola mundo');
    expect((await buildQr({ ...FIELDS, text: '' }, 40)).name).toBe('Código QR');
  });

  test('it knows what keeps it from reading at any size: no content or its colors', async () => {
    expect((await buildQr(FIELDS, 40)).issue).toBeNull();
    expect((await buildQr({ ...FIELDS, text: '' }, 40)).issue).toBe('empty');
    expect((await buildQr({ ...FIELDS, color: '#ffffff', background: '#000000' }, 40)).issue).toBe('inverted');
    expect((await buildQr({ ...FIELDS, color: '#dddddd', background: null }, 40)).issue).toBe('contrast');
  });

  test('codes drawn the same have the same signature', async () => {
    const a = await buildQr(FIELDS, 40);
    expect((await buildQr({ ...FIELDS }, 40)).signature).toBe(a.signature);
    for (const change of [{ text: 'x' }, { color: '#000000' }, { background: null }, { dots: 'circle' as const }, { eyes: 'square' as const }, { caption: 'x' }, { logo: logo() }]) {
      expect((await buildQr({ ...FIELDS, ...change }, 40)).signature, JSON.stringify(change)).not.toBe(a.signature);
    }
    expect((await buildQr(FIELDS, 30)).signature).not.toBe(a.signature);
  });

  test('a style it can’t read takes its default', async () => {
    const qr = await buildQr({ ...FIELDS, color: 'blue', dots: 'stars' as never }, 40);
    expect([qr.color, qr.dots]).toEqual(['#000000', 'square']);
  });
});

describe('restoreQr', () => {
  test('a saved QR code comes back the same with its logo from its file', async () => {
    const meta: QrAssetMeta = { kind: 'qr', ...FIELDS, caption: 'Menú', logo: { src: 4, format: 'png', px: [200, 100] }, w: 40, h: 46.4 };
    const file = logo();
    const qr = await restoreQr(meta, new Map([['src:4', { blob: file.blob, hash: 'h-logo' }]]));
    expect(qr.logo).toMatchObject({ src: 4, format: 'png', px: [200, 100], hash: 'h-logo' });
    expect(qr.logo!.bytes).toEqual(PNG);
    expect(assetMeta(qr)).toEqual(meta);
  });
});
