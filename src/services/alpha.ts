// The alpha channel of an image file, and what it traces (core/contour.js).
// Works in a worker (OffscreenCanvas) and in the page.

import { opaqueInView, traceShape, type AlphaMask } from '../core/contour.js';
import type { TraceRequest, Traced } from './contours.ts';

/** The loops of the shape in view, or why its rectangle applies (contours.Traced). */
export const traceAlpha = (mask: AlphaMask, request: Omit<TraceRequest, 'source'>): Traced => traceShape(mask, request) ?? (opaqueInView(mask, request) ? 'opaque' : null);

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
