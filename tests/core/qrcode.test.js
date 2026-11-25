// The QR encoder (src/core/qrcode.js), read back by an independent decoder
// (jsQR): every version at every level, each kind of text, the capacity, and
// where each codeword lies (what a logo over the middle can destroy).
import { describe, expect, test } from 'vitest';
import { alignmentPositions, codewordLayout, codewordsOf, dataCodewords, encodeQr, fitsQr, MAX_VERSION, QR_LEVELS, sizeOf } from '../../src/core/qrcode.js';
import { prng } from '../support/prng.js';
import { decode, rasterizeMatrix } from '../support/qr.ts';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789-_/.';

/** A random lowercase text of `n` letters (bytes mode: one byte each). */
function words(n, seed) {
  const rnd = prng(seed);
  return Array.from({ length: n }, () => LETTERS[Math.floor(rnd() * LETTERS.length)]).join('');
}

/** The most bytes version `v` holds at `level` (mode and count take 12 bits up to version 9, 20 after). */
const byteCapacity = (v, level) => Math.floor((dataCodewords(v, level) * 8 - (v < 10 ? 12 : 20)) / 8);

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// jsQR 1.4.0 puts version 23's fourth alignment pattern at 74 instead of 78
// (ISO/IEC 18004, annex E): it reads those modules as data, which only the
// higher levels repair. The positions are checked against the standard below.
const JSQR_MISREADS = (v, level) => v === 23 && level === 'L';

describe('encodeQr', () => {
  for (const level of QR_LEVELS) {
    test(`every version at level ${level} reads back when full`, () => {
      for (let v = 1; v <= MAX_VERSION; v++) {
        const text = words(byteCapacity(v, level), v * 7 + level.charCodeAt(0));
        const code = encodeQr(text, { level, boost: false });
        expect(code, `version ${v}`).not.toBeNull();
        expect([code.version, code.level, code.size]).toEqual([v, level, sizeOf(v)]);
        if (!JSQR_MISREADS(v, level)) expect(decode(rasterizeMatrix(code)), `version ${v}`).toBe(text);
        // One byte more needs the next version.
        if (v < MAX_VERSION) expect(encodeQr(`${text}x`, { level, boost: false }).version).toBe(v + 1);
      }
    });
  }

  test.each([
    { name: 'empty', text: '' },
    { name: 'digits', text: '0123456789012345678901234567890123456789' },
    { name: 'alphanumeric', text: 'HTTPS://EXAMPLE.COM/A-B $%*+' },
    { name: 'a link', text: 'https://scooch.app/es/hacer-stickers-en-casa?utm=qr#top' },
    { name: 'other scripts', text: 'Hola, ¿qué tal? 你好 नमस्ते Привет 🙂' },
    { name: 'several lines', text: 'Wi-Fi: Casa\nClave: 1234\tfin' },
  ])('$name reads back as it was', ({ text }) => {
    expect(decode(rasterizeMatrix(encodeQr(text)))).toBe(text);
  });

  test('digits and capitals take the denser modes', () => {
    // Version 1 at L holds 41 digits, 25 alphanumeric characters or 17 bytes.
    expect(encodeQr('1'.repeat(41), { level: 'L', boost: false }).version).toBe(1);
    expect(encodeQr('1'.repeat(42), { level: 'L', boost: false }).version).toBe(2);
    expect(encodeQr('A'.repeat(25), { level: 'L', boost: false }).version).toBe(1);
    expect(encodeQr('A'.repeat(26), { level: 'L', boost: false }).version).toBe(2);
    expect(encodeQr('a'.repeat(17), { level: 'L', boost: false }).version).toBe(1);
    expect(encodeQr('a'.repeat(18), { level: 'L', boost: false }).version).toBe(2);
  });

  test('the level rises while the data fits the same version, and a minimum version holds', () => {
    expect(encodeQr('hi', { level: 'M' })).toMatchObject({ version: 1, level: 'H' });
    expect(encodeQr('hi', { level: 'M', boost: false })).toMatchObject({ version: 1, level: 'M' });
    const big = encodeQr('hi', { level: 'H', minVersion: 6 });
    expect(big).toMatchObject({ version: 6, level: 'H' });
    expect(decode(rasterizeMatrix(big))).toBe('hi');
  });

  test('version 40 holds 2953 bytes at L and 1273 at H, and no more', () => {
    expect(fitsQr('a'.repeat(2953), 'L')).toBe(true);
    expect(fitsQr('a'.repeat(2954), 'L')).toBe(false);
    expect(fitsQr('a'.repeat(1273), 'H')).toBe(true);
    expect(fitsQr('a'.repeat(1274), 'H')).toBe(false);
    expect(encodeQr('a'.repeat(1274), { level: 'H' })).toBeNull();
    // A character outside ASCII takes more than one byte.
    expect(fitsQr('ñ'.repeat(636), 'H')).toBe(true);
    expect(fitsQr('ñ'.repeat(637), 'H')).toBe(false);
  });

  test('the same text gives the same code', () => {
    const a = encodeQr('https://example.com');
    const b = encodeQr('https://example.com');
    expect(a.mask).toBe(b.mask);
    expect(a.dark).toEqual(b.dark);
  });

  test('an unknown level is refused', () => {
    expect(() => encodeQr('x', { level: 'X' })).toThrow(RangeError);
  });

  test('every mask reads back', () => {
    for (let mask = 0; mask < 8; mask++) {
      const code = encodeQr('https://example.com/mask', { mask });
      expect(code.mask).toBe(mask);
      expect(decode(rasterizeMatrix(code)), `mask ${mask}`).toBe('https://example.com/mask');
    }
  });
});

describe('alignmentPositions', () => {
  // ISO/IEC 18004, annex E.
  test.each([
    [1, []],
    [2, [6, 18]],
    [6, [6, 34]],
    [7, [6, 22, 38]],
    [14, [6, 26, 46, 66]],
    [22, [6, 26, 50, 74, 98]],
    [23, [6, 30, 54, 78, 102]],
    [32, [6, 34, 60, 86, 112, 138]],
    [36, [6, 24, 50, 76, 102, 128, 154]],
    [40, [6, 30, 58, 86, 114, 142, 170]],
  ])('version %i: as the standard lists them', (v, positions) => {
    expect(alignmentPositions(v)).toEqual(positions);
  });
});

describe('codewordLayout', () => {
  test.each([1, 2, 6, 7, 14, 27, 40])('version %i: each codeword is 8 modules and the blocks are as the standard says', (v) => {
    for (const level of QR_LEVELS) {
      const { size, codeword, blockOf, blocks, ecc } = codewordLayout(v, level);
      const counts = new Map();
      for (const k of codeword) if (k >= 0) counts.set(k, (counts.get(k) ?? 0) + 1);
      expect(size).toBe(sizeOf(v));
      expect(counts.size).toBe(blockOf.length);
      expect([...counts.values()].every((n) => n === 8)).toBe(true);
      const perBlock = new Array(blocks).fill(0);
      for (const b of blockOf) perBlock[b]++;
      // Every block carries its error correction and its data (the long ones one codeword more).
      expect(Math.max(...perBlock) - Math.min(...perBlock)).toBeLessThanOrEqual(1);
      expect(blockOf.length - blocks * ecc).toBe(dataCodewords(v, level));
    }
  });

  test.each([
    { v: 1, level: 'H', text: 'a.co' },
    { v: 5, level: 'Q', text: 'logo test 123' },
    { v: 10, level: 'H', text: 'Ünïcödé 文字' },
  ])('it says which codeword each module of the code carries (version $v, level $level)', ({ v, level, text }) => {
    const code = encodeQr(text, { level, minVersion: v, boost: false });
    expect(code.version).toBe(v);
    const { codeword, bit } = codewordLayout(v, level);
    const { codewords } = codewordsOf(text, v, level);
    const mask = MASKS[code.mask];
    // Unmasked, the modules of codeword k spell its bits.
    const read = new Uint8Array(codewords.length);
    for (let i = 0; i < codeword.length; i++) {
      if (codeword[i] < 0) continue;
      const on = code.dark[i] ^ (mask(i % code.size, Math.floor(i / code.size)) ? 1 : 0);
      read[codeword[i]] |= on << bit[i];
    }
    expect(read).toEqual(codewords);
  });
});
