// Reading QR codes back in tests: what the app draws, rasterized here, then
// decoded by jsQR (an independent reader, a development dependency only). A
// code that jsQR reads back to the same text is one a phone can read.
import jsQR from 'jsqr';
import type { QrMatrix } from '../../src/core/qrcode.js';

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type Rgb = readonly [number, number, number];

/** A blank raster of `color`. */
export function blank(width: number, height: number, color: Rgb = [255, 255, 255]): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...color, 255], i * 4);
  return { data, width, height };
}

/** The bare matrix, `scale` px a module, with a quiet zone of `quiet` modules. */
export function rasterizeMatrix({ size, dark }: Pick<QrMatrix, 'size' | 'dark'>, { scale = 3, quiet = 4, ink = [0, 0, 0] as Rgb, paper = [255, 255, 255] as Rgb } = {}): Raster {
  const side = (size + 2 * quiet) * scale;
  const out = blank(side, side, paper);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!dark[y * size + x]) continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) out.data.set([...ink, 255], (((y + quiet) * scale + py) * side + (x + quiet) * scale + px) * 4);
      }
    }
  }
  return out;
}

/**
 * The text jsQR reads in the raster, or null. Only dark on light, as most
 * phones read (`invert`: also light on dark).
 */
export function decode({ data, width, height }: Raster, { invert = false } = {}): string | null {
  const found = jsQR(data, width, height, { inversionAttempts: invert ? 'attemptBoth' : 'dontInvert' });
  return found ? found.data : null;
}
