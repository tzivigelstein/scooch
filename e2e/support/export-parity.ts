// The exported PDF against the screen and against a committed reference.
//   - rasterParity: the sheet on screen and the PDF's page rasterized by pdf.js
//     (support/raster.ts), as a mean luma difference and a share of very
//     different pixels;
//   - inkParity: for thin marks in one color (cut lines), the pixels in that
//     color in the two images, each matched against the other within 2 px;
//   - exportSummary: what a PDF contains, reduced to what is deterministic, for
//     a snapshot (see export-parity.spec.ts).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, type PDFDict, type PDFRef } from 'pdf-lib';
import type { Page, TestInfo } from '@playwright/test';
import { bareSheet, difference, rasterize } from './raster.ts';
import { fixture, type App } from './test.ts';

const hash = (chunks: readonly Uint8Array[]) => {
  const h = createHash('sha1');
  for (const c of chunks) h.update(c);
  return h.digest('hex').slice(0, 12);
};

export interface Parity {
  /** Mean luma difference (0–255) and share of pixels differing by more than 64. */
  mean: number;
  big: number;
  screen: string;
  pdf: string;
  file: string;
  /** Screen px per mm of the screenshot (device pixels). */
  scale: number;
}

/**
 * Screenshot of the first sheet (without what the PDF doesn't carry), the PDF
 * downloaded and its first page rasterized at the same size, and their difference.
 */
export async function rasterParity(app: App, info: TestInfo, name: string): Promise<Parity> {
  const { page } = app;
  await page.keyboard.press('Escape');
  await bareSheet(page);
  const sheet = page.locator('.sheet').first();
  const box = (await sheet.boundingBox())!;
  const screen = info.outputPath(`${name}-screen.png`);
  await sheet.screenshot({ path: screen });
  const { file } = await app.download();
  const pdf = await rasterize(page, file, box.width, info.outputPath(`${name}-pdf.png`));
  const [mean, big] = await difference(page, screen, pdf);
  await info.attach(`${name}-screen`, { path: screen, contentType: 'image/png' });
  await info.attach(`${name}-pdf`, { path: pdf, contentType: 'image/png' });
  info.annotations.push({ type: 'parity', description: `${name}: mean ${mean.toFixed(2)}/255, ${(big * 100).toFixed(2)} % very different` });
  const { W } = await app.geometry();
  const dpr = await page.evaluate(() => devicePixelRatio);
  return { mean, big, screen, pdf, file, scale: (box.width * dpr) / W };
}

export interface InkParity {
  /** Pixels in the marks' color in each image. */
  screen: number;
  pdf: number;
  /** Share of each image's mark pixels with one in the other within `reach` px. */
  screenMatched: number;
  pdfMatched: number;
}

/**
 * Compares thin marks drawn in one color (cut lines): a pixel belongs to them
 * when it lies between white and `color` (anti-aliasing blends them), at least
 * `least` of the way. Each image's mark pixels are matched against the other's
 * within `reach` px; a frame of `edge` px around the images is left out.
 */
export function inkParity(page: Page, a: string, b: string, color: string, { least = 0.15, reach = 2, edge = 3 } = {}): Promise<InkParity> {
  const png = (file: string) => 'data:image/png;base64,' + readFileSync(file).toString('base64');
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  return page.evaluate(
    async ({ a, b, rgb, least, reach, edge }) => {
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
      // The channel that moves most from white to the color tells how far along a pixel is.
      const depth = rgb.map((c) => 255 - c);
      const main = depth.indexOf(Math.max(...depth));
      const marks = (img: HTMLImageElement) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        const out = new Uint8Array(w * h);
        for (let y = edge; y < h - edge; y++)
          for (let x = edge; x < w - edge; x++) {
            const i = (y * w + x) * 4;
            const t = (255 - d[i + main]) / depth[main];
            if (t < least || t > 1.1) continue;
            if ([0, 1, 2].every((c) => Math.abs(255 - d[i + c] - depth[c] * t) <= 25)) out[y * w + x] = 1;
          }
        return out;
      };
      const sa = marks(ia);
      const sb = marks(ib);
      const near = (set: Uint8Array, x: number, y: number) => {
        for (let dy = -reach; dy <= reach; dy++)
          for (let dx = -reach; dx <= reach; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && set[ny * w + nx]) return true;
          }
        return false;
      };
      const matched = (from: Uint8Array, to: Uint8Array) => {
        let n = 0;
        let hit = 0;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++)
            if (from[y * w + x]) {
              n++;
              if (near(to, x, y)) hit++;
            }
        return { n, share: n ? hit / n : 0 };
      };
      const ma = matched(sa, sb);
      const mb = matched(sb, sa);
      return { screen: ma.n, pdf: mb.n, screenMatched: ma.share, pdfMatched: mb.share };
    },
    { a: png(a), b: png(b), rgb, least, reach, edge }
  );
}

/** The XObjects a PDF's page uses: name, subtype, its stream and (images) its pixel size. */
function xobjects(doc: PDFDocument, n: number) {
  const page = doc.getPage(n);
  const dict = page.node.Resources()?.lookup(PDFName.of('XObject')) as PDFDict | undefined;
  return (dict?.keys() ?? [])
    .map((key) => {
      const obj = doc.context.lookup(dict!.get(key) as PDFRef) as PDFRawStream;
      const num = (k: string) => (obj.dict.get(PDFName.of(k)) as PDFNumber | undefined)?.asNumber() ?? null;
      return {
        name: key.decodeText(),
        subtype: String(obj.dict.get(PDFName.of('Subtype'))),
        filter: obj.dict.get(PDFName.of('Filter'))?.toString() ?? null,
        px: [num('Width'), num('Height')],
        hash: hash([obj.contents]),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The kinds of XObject a PDF's first page draws (/Form: an embedded PDF page, a vector; /Image: pixels). */
export async function xobjectKinds(file: string, n = 0) {
  const doc = await PDFDocument.load(readFileSync(file), { updateMetadata: false });
  return xobjects(doc, n)
    .map((x) => x.subtype)
    .sort();
}

/**
 * What pdf-lib embeds for each of these image files (PNG or JPG, used as they
 * are), by the hash of the image stream: pdf-lib in Node, the same library and
 * version the app bundles.
 */
export async function embeddedFixtures(names: readonly string[]) {
  const byHash = new Map<string, string>();
  for (const name of names) {
    const doc = await PDFDocument.create();
    // A copy with a buffer of its own: Node may hand out a view into a shared pool, and pdf-lib's JPEG embedder reads the buffer from its start.
    const bytes = new Uint8Array(readFileSync(fixture(name)));
    const image = name.endsWith('.jpg') ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    doc.addPage().drawImage(image, { x: 0, y: 0 });
    const saved = await PDFDocument.load(await doc.save());
    for (const x of xobjects(saved, 0)) byHash.set(x.hash, name);
  }
  return byHash;
}

/**
 * A PDF reduced to what is deterministic, for a snapshot: per page, its size
 * (mm), the hash of its content (positions, sizes, rotations, clipping, the
 * order of the pieces and the XObjects' names) and its XObjects. A vector page
 * (/Form) is pdf-lib's copy of the source page: hashed. An image that is one of
 * `fixtures` as pdf-lib embeds it is named after that file. Any other image was
 * encoded by the browser (an EXIF-rotated JPEG, a WebP turned PNG, the preview
 * of a PDF page with /Rotate): its bytes depend on the browser's encoder or
 * rasterizer, so only its pixel size and encoding are kept.
 */
export async function exportSummary(file: string, fixtures: Map<string, string>) {
  const doc = await PDFDocument.load(readFileSync(file), { updateMetadata: false });
  return doc.getPages().map((page, n) => {
    const { width, height } = page.getSize();
    const contents = page.node.Contents();
    const refs = contents ? ('asArray' in contents ? (contents.asArray() as PDFRef[]) : [contents]) : [];
    const raw = refs.map((ref) => doc.context.lookup(ref)).filter((s): s is PDFRawStream => s instanceof PDFRawStream);
    const mm = (pt: number) => Math.round((pt / 72) * 25.4 * 10) / 10;
    return {
      size: [mm(width), mm(height)],
      content: hash(raw.map((s) => s.contents)),
      xobjects: xobjects(doc, n).map((x) =>
        x.subtype === '/Form'
          ? { name: x.name, kind: 'vector page', hash: x.hash }
          : fixtures.has(x.hash)
            ? { name: x.name, kind: 'image', file: fixtures.get(x.hash) }
            : { name: x.name, kind: 'image encoded by the browser', px: x.px, filter: x.filter }
      ),
    };
  });
}
