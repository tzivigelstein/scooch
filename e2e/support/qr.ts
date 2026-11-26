// Reading a QR code back in a browser test: an image (a screenshot of the
// sheet, the PDF rasterized) turned into pixels by the page, then read by
// jsQR (a development dependency) here. A code that reads back is one a phone
// can read.
import { readFileSync } from 'node:fs';
import jsQR from 'jsqr';
import type { Page } from '@playwright/test';

/** The text of the QR code in a PNG (a file or its bytes), only dark on light as most phones read; null when none reads. */
export async function readQr(page: Page, png: string | Buffer): Promise<string | null> {
  const b64 = (typeof png === 'string' ? readFileSync(png) : png).toString('base64');
  const { width, height, rgba } = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let binary = '';
    for (let i = 0; i < pixels.length; i += 0x8000) binary += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
    return { width: canvas.width, height: canvas.height, rgba: btoa(binary) };
  }, b64);
  const found = jsQR(new Uint8ClampedArray(Buffer.from(rgba, 'base64')), width, height, { inversionAttempts: 'dontInvert' });
  return found ? found.data : null;
}
