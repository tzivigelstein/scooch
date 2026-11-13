// Comparing the exported PDF with the sheet on screen: the PDF rasterized with
// pdf.js inside the page, and a luma difference like PIL's convert('L') +
// ImageChops.difference.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

const PDFJS = resolve(import.meta.dirname, '../../node_modules/pdfjs-dist/build');

/**
 * Hides what the PDF doesn't carry (grid, margin, frames, toolbars, notice) and
 * the sheet's shadow, then waits until no piece shows a hover or focus outline.
 */
export async function bareSheet(page: Page) {
  await page.addStyleTag({
    content:
      '.grid-layer,.safe,#frame,.group-frame,#piecebar,#pill,.zoom-control{visibility:hidden!important}.sheet{box-shadow:none!important;border-radius:0!important}*,*::before,*::after{transition:none!important;animation:none!important}',
  });
  await page.mouse.move(2, 2);
  // Images still decoding would rasterize blank.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('#sheets img')].every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
}

/** Page `n` (from 1) of a PDF rasterized at `width` CSS px, saved as a PNG at `out`. */
export async function rasterize(page: Page, file: string, width: number, out: string, n = 1) {
  await page.route('**/__pdfjs/**', (route) => route.fulfill({ path: join(PDFJS, basename(route.request().url())), contentType: 'text/javascript' }));
  const b64 = readFileSync(file).toString('base64');
  const dataUrl = await page.evaluate(
    async ({ b64, width, n }) => {
      // @ts-expect-error: served by the route above, not a module TypeScript knows.
      const pdfjs = await import('/__pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/__pdfjs/pdf.worker.min.mjs';
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      const pg = await pdf.getPage(n);
      const base = pg.getViewport({ scale: 1 });
      const viewport = pg.getViewport({ scale: (width * devicePixelRatio) / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await pg.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return canvas.toDataURL('image/png');
    },
    { b64, width, n }
  );
  writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return out;
}

/** [mean luma difference (0–255), share of pixels differing by more than 64] between two PNGs. */
export async function difference(page: Page, a: string, b: string): Promise<[number, number]> {
  const png = (file: string) => 'data:image/png;base64,' + readFileSync(file).toString('base64');
  return page.evaluate(
    async ([a, b]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((done, fail) => {
          const img = new Image();
          img.onload = () => done(img);
          img.onerror = fail;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.naturalWidth;
      const h = ia.naturalHeight;
      const pixels = (img: HTMLImageElement) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      const luma = (d: Uint8ClampedArray, i: number) => (d[i] * 19595 + d[i + 1] * 38470 + d[i + 2] * 7471 + 0x8000) >> 16;
      let sum = 0;
      let big = 0;
      for (let i = 0; i < w * h * 4; i += 4) {
        const v = Math.abs(luma(pa, i) - luma(pb, i));
        sum += v;
        if (v > 64) big++;
      }
      return [sum / (w * h), big / (w * h)] as [number, number];
    },
    [png(a), png(b)] as const
  );
}
