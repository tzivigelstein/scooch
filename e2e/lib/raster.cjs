// Comparing the exported PDF with the sheet on screen: the PDF rasterized with pdf.js inside the
// page, and a luma difference like PIL's convert('L') + ImageChops.difference.
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const PDFJS = path.join(ROOT, 'node_modules/pdfjs-dist/build');

/** Hides what the PDF doesn't carry (grid, margin, frames, toolbars, notice) and the sheet's shadow. */
async function bareSheet(page) {
  await page.addStyleTag({ content: '.grid-layer,.safe,#frame,.group-frame,#piecebar,#pill,.zoom-control{visibility:hidden!important}.sheet{box-shadow:none!important;border-radius:0!important}' });
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
}

/** Page `n` (from 1) of a PDF file rasterized at `width` CSS px, saved as a PNG; returns its path. */
async function rasterize(page, file, width, out, n = 1) {
  await page.route('**/__pdfjs/**', (route) => route.fulfill({ path: path.join(PDFJS, path.basename(route.request().url())), contentType: 'text/javascript' }));
  const b64 = fs.readFileSync(file).toString('base64');
  const dataUrl = await page.evaluate(
    async ({ b64, width, n }) => {
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
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return out;
}

/** [mean luma difference (0–255), share of pixels differing by more than 64] between two PNGs. */
async function difference(page, a, b) {
  const png = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
  return page.evaluate(
    async ([a, b]) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.naturalWidth;
      const h = ia.naturalHeight;
      const pixels = (img) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia);
      const pb = pixels(ib);
      const luma = (d, i) => (d[i] * 19595 + d[i + 1] * 38470 + d[i + 2] * 7471 + 0x8000) >> 16;
      let sum = 0;
      let big = 0;
      for (let i = 0; i < w * h * 4; i += 4) {
        const v = Math.abs(luma(pa, i) - luma(pb, i));
        sum += v;
        if (v > 64) big++;
      }
      return [sum / (w * h), big / (w * h)];
    },
    [png(a), png(b)]
  );
}

module.exports = { bareSheet, rasterize, difference };
