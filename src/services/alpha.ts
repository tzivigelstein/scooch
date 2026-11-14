// The alpha channel of an image file, to trace its shape (core/contour.js).
// Works in a worker (OffscreenCanvas) and in the page.

import type { AlphaMask } from '../core/contour.js';

export async function decodeAlpha(file: Blob): Promise<AlphaMask> {
  const bitmap = await createImageBitmap(file, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  try {
    const { width, height } = bitmap;
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error('No 2D canvas to read the image with');
    ctx.drawImage(bitmap, 0, 0);
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[4 * i + 3];
    return { width, height, alpha };
  } finally {
    bitmap.close();
  }
}
