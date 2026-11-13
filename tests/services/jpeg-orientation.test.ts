// The EXIF Orientation of a JPEG, read from its bytes: what decides whether an
// image is re-encoded upright before it goes into the PDF (pdf-lib ignores it).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { jpegOrientation } from '../../src/services/assets.ts';

const u16 = (v: number, little: boolean) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
const u32 = (v: number, little: boolean) => (little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** An APP1 segment with an EXIF block whose first IFD has these tags (SHORT values). */
function exif(tags: [number, number][], little = false) {
  const ifd = [...u16(tags.length, little), ...tags.flatMap(([tag, value]) => [...u16(tag, little), ...u16(3, little), ...u32(1, little), ...u16(value, little), 0, 0]), ...u32(0, little)];
  const tiff = [...ascii(little ? 'II' : 'MM'), ...u16(42, little), ...u32(8, little), ...ifd];
  const body = [...ascii('Exif\0\0'), ...tiff];
  return [0xff, 0xe1, ...u16(body.length + 2, false), ...body];
}
const JFIF = [0xff, 0xe0, 0, 16, ...ascii('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0];
const SCAN = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0xff, 0xd9];
const jpeg = (...segments: number[][]) => new Uint8Array([0xff, 0xd8, ...segments.flat(), ...SCAN]);

describe('jpegOrientation', () => {
  // 1 upright, 2 mirrored, 3 upside down, 4 mirrored upside down, 5 mirrored
  // and turned left, 6 turned right, 7 mirrored and turned right, 8 turned left.
  test('orientations 1 to 8 (3, 6, 8 and the mirrored ones), in both byte orders', () => {
    for (const value of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(jpegOrientation(jpeg(exif([[0x0112, value]]))), `big-endian ${value}`).toBe(value);
      expect(jpegOrientation(jpeg(exif([[0x0112, value]], true))), `little-endian ${value}`).toBe(value);
    }
  });

  test('after a JFIF segment and other tags (like a camera’s file)', () => {
    expect(jpegOrientation(jpeg(JFIF, exif([[0x010f, 7], [0x0112, 8], [0x0132, 1]])))).toBe(8);
    expect(jpegOrientation(jpeg([0xff], JFIF, exif([[0x0112, 3]], true)))).toBe(3); // a fill byte first
  });

  test('without EXIF, without the tag, or not a JPEG: 1 (as it is)', () => {
    expect(jpegOrientation(jpeg(JFIF))).toBe(1);
    expect(jpegOrientation(jpeg(exif([[0x010f, 7]])))).toBe(1);
    expect(jpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe(1);
    expect(jpegOrientation(jpeg(JFIF, exif([[0x0112, 6]])).subarray(0, 2 + JFIF.length + 2))).toBe(1); // cut short before its EXIF
    // The tag after the image data starts doesn't count.
    expect(jpegOrientation(new Uint8Array([0xff, 0xd8, ...SCAN.slice(0, -2), ...exif([[0x0112, 6]])]))).toBe(1);
  });

  test('the e2e fixture exif6.jpg', () => {
    const bytes = readFileSync(resolve(import.meta.dirname, '../../e2e/fixtures/exif6.jpg'));
    expect(jpegOrientation(new Uint8Array(bytes))).toBe(6);
    expect(jpegOrientation(new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../e2e/fixtures/small.jpg'))))).toBe(1);
  });
});
