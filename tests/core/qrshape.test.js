// How a QR code piece is drawn (src/core/qrshape.js), read back: the paths
// the screen and the PDF draw, rasterized and decoded by jsQR, for each shape
// of the modules and the eyes, with a logo at its size over the middle,
// with custom colors, under a caption and with the longest content.
import { describe, expect, test } from 'vitest';
import { fitsQr } from '../../src/core/qrcode.js';
import { colorIssue, contrastRatio, fitText, LOGO_SIDE, logoFits, logoPlace, QR_DOTS, QR_EYES, QUIET_ZONE, qrDrawing } from '../../src/core/qrshape.js';
import { decode, polygonsBounds, polygonsOf, rasterizeQr } from '../support/qr.ts';

const SHAPES = QR_DOTS.flatMap((dots) => QR_EYES.map((eyes) => ({ dots, eyes })));

const CONTENTS = [
  { name: 'a short link', text: 'https://scooch.app' },
  { name: 'a long link', text: 'https://example.com/products/summer-sale?campaign=flyer&size=a4&color=blue#details' },
  { name: 'text in other scripts', text: 'Menú del día — 今日のメニュー — आज का मेनू 🍲' },
  { name: 'several lines', text: 'Juana Pérez\nDiseño gráfico\n+54 11 5555-5555\njuana@example.com' },
];

describe('qrDrawing reads back', () => {
  for (const { dots, eyes } of SHAPES) {
    test(`with ${dots} modules and ${eyes} eyes`, () => {
      for (const { name, text } of CONTENTS) {
        expect(decode(rasterizeQr(qrDrawing(text, { dots, eyes }))), name).toBe(text);
      }
    });

    test(`with ${dots} modules and ${eyes} eyes and a logo at its size`, () => {
      for (const aspect of [1, 0.5, 2.5]) {
        for (const text of ['', 'hi', ...CONTENTS.map((c) => c.text), 'x'.repeat(150), 'y'.repeat(400)]) {
          const drawing = qrDrawing(text, { dots, eyes, logo: aspect });
          expect(drawing.logo, `a logo of proportion ${aspect}`).not.toBeNull();
          expect(drawing.level).toBe('H');
          expect(decode(rasterizeQr(drawing)), `${text.length} characters, proportion ${aspect}`).toBe(text);
        }
      }
    });
  }

  test.each([
    { color: '#000000', background: '#ffffff' },
    { color: '#1f3a93', background: '#fff8e7' },
    { color: '#8b0000', background: null },
    { color: '#0b6e4f', background: '#f4f9c4' },
    { color: '#5b2a86', background: '#e8e0f0' },
    { color: '#1f6feb', background: '#ffffff' },
  ])('in $color on $background, with a logo and a caption', ({ color, background }) => {
    expect(colorIssue(color, background)).toBeNull();
    for (const dots of QR_DOTS) {
      const text = 'https://example.com/menu?table=12';
      expect(decode(rasterizeQr(qrDrawing(text, { dots, eyes: 'rounded', logo: 1 }), { color, background, caption: true })), dots).toBe(text);
    }
  });

  test('the longest content: all a code at level H holds', () => {
    const text = fitText('a link that goes on and on '.repeat(80));
    expect(fitsQr(text, 'H')).toBe(true);
    expect(fitsQr(`${text}a`, 'H')).toBe(false);
    for (const dots of QR_DOTS) {
      const drawing = qrDrawing(text, { dots, eyes: 'rounded', logo: 1 });
      expect(drawing.version).toBe(40);
      expect(decode(rasterizeQr(drawing, { scale: 5 })), dots).toBe(text);
    }
  });
});

describe('colors', () => {
  test('a light code on a dark background is told apart: many readers only look for dark codes', () => {
    expect(colorIssue('#ffffff', '#000000')).toBe('inverted');
    expect(colorIssue('#ffe14d', '#1a1a2e')).toBe('inverted');
    const drawing = qrDrawing('https://scooch.app');
    const raster = rasterizeQr(drawing, { color: '#ffffff', background: '#000000' });
    expect(decode(raster)).toBeNull();
    expect(decode(raster, { invert: true })).toBe('https://scooch.app');
  });

  test('too little contrast is told, against the paper when the background is transparent', () => {
    expect(colorIssue('#aaaaaa', '#ffffff')).toBe('contrast');
    expect(colorIssue('#ffd400', null)).toBe('contrast');
    expect(colorIssue('#ffffff', null)).toBe('contrast');
    expect(colorIssue('#404040', '#5a5a5a')).toBe('contrast');
    expect(colorIssue('#333333', null)).toBeNull();
  });

  test('the contrast ratio is WCAG’s', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('the code’s square', () => {
  test.each(SHAPES)('the quiet zone stays empty around $dots modules and $eyes eyes', ({ dots, eyes }) => {
    const drawing = qrDrawing('quiet zone', { dots, eyes });
    for (const d of [drawing.dots, drawing.eyes]) {
      const { minX, minY, maxX, maxY } = polygonsBounds(polygonsOf(d));
      expect(minX).toBeGreaterThanOrEqual(QUIET_ZONE - 1e-9);
      expect(minY).toBeGreaterThanOrEqual(QUIET_ZONE - 1e-9);
      expect(maxX).toBeLessThanOrEqual(drawing.units - QUIET_ZONE + 1e-9);
      expect(maxY).toBeLessThanOrEqual(drawing.units - QUIET_ZONE + 1e-9);
    }
  });

  test('the logo is centred, its longer side the share of the code it may take', () => {
    for (const aspect of [1, 2, 0.25]) {
      const drawing = qrDrawing('logo', { logo: aspect });
      const size = drawing.units - 2 * QUIET_ZONE;
      const { x, y, w, h } = drawing.logo;
      expect(Math.max(w, h)).toBeCloseTo(LOGO_SIDE * size, 9);
      expect(w / h).toBeCloseTo(aspect, 9);
      expect(x + w / 2).toBeCloseTo(drawing.units / 2, 9);
      expect(y + h / 2).toBeCloseTo(drawing.units / 2, 9);
    }
  });

  test('no module is drawn under the logo or its clear space', () => {
    const drawing = qrDrawing('https://scooch.app', { logo: 1 });
    const { x, y, w, h } = drawing.logo;
    for (const poly of polygonsOf(drawing.dots)) {
      const xs = poly.filter((_, i) => i % 2 === 0);
      const ys = poly.filter((_, i) => i % 2 === 1);
      const apart = Math.max(...xs) <= x - 0.5 + 1e-9 || Math.min(...xs) >= x + w + 0.5 - 1e-9 || Math.max(...ys) <= y - 0.5 + 1e-9 || Math.min(...ys) >= y + h + 0.5 - 1e-9;
      expect(apart).toBe(true);
    }
  });

  test('a logo never clears a finder, the timing or the format and version information', () => {
    // Version 7 has 45 modules: the band within 9 modules of an edge is off limits.
    expect(logoFits(7, 'H', { x0: 8, x1: 20, y0: 18, y1: 26 })).toBe(false);
    expect(logoFits(7, 'H', { x0: 20, x1: 36, y0: 20, y1: 24 })).toBe(false);
    expect(logoFits(40, 'H', { x0: 80, x1: 96, y0: 80, y1: 96 })).toBe(true);
    // Too many spoiled codewords in a block, however central.
    expect(logoFits(40, 'H', { x0: 40, x1: 136, y0: 40, y1: 136 })).toBe(false);
    expect(logoPlace(21, 1).cleared).toEqual({ x0: 7, x1: 13, y0: 7, y1: 13 });
  });

  test('the same content and style give the same paths', () => {
    expect(qrDrawing('same', { dots: 'rounded', eyes: 'rounded', logo: 1.5 })).toEqual(qrDrawing('same', { dots: 'rounded', eyes: 'rounded', logo: 1.5 }));
  });
});

describe('fitText', () => {
  test('keeps what fits and cuts the rest between characters', () => {
    expect(fitText('short')).toBe('short');
    const cut = fitText('🙂'.repeat(400));
    expect(fitsQr(cut, 'H')).toBe(true);
    expect([...cut].every((c) => c === '🙂')).toBe(true);
    expect(fitsQr(`${cut}🙂`, 'H')).toBe(false);
  });
});
