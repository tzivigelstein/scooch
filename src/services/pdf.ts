// Export: one PDF page the size of the sheet for each sheet with pieces, in
// order, built with pdf-lib. Where each piece goes (cropped and rotated) comes
// from crop.drawParams; without a crop the numbers and operators are the same
// as always. A QR code is drawn, not embedded: its modules and eyes are the
// path data the screen shows (qrshape.js), filled as vectors; its logo is
// embedded as an image and its caption as the raster of its text the page
// made at print resolution (services/qr.ts). The export worker (export.worker.ts) builds it with pdfReply and
// a pdf-lib of its own; buildPdf loads pdf-lib in the page (a chunk of its
// own), where the worker can't build it (export.ts).

import type { PDFDocument as PdfLibDocument, PDFEmbeddedPage, PDFImage } from 'pdf-lib';
import type { CutPath } from '../core/contour.js';
import type { QrBox } from '../core/qrshape.js';
import { cutStyle as styleOf, type CutLine, type CutStyle } from '../core/cutmarks.js';
import { drawParams } from '../core/crop.js';
import type { Crop } from '../core/types.ts';
import type { ImageAsset, PdfAsset } from './assets.ts';

const PT_PER_MM = 72 / 25.4;

/**
 * What the PDF needs of a QR code: its square's side in modules (`units`,
 * quiet zone included) and its caption's band under it, its path data, its
 * colors as 0–1 RGB, its logo (`bytes`, empty without one, and where it goes)
 * and its caption as a PNG.
 */
export interface QrPdfSource {
  kind: 'qr';
  w: number;
  h: number;
  units: number;
  band: number;
  dots: string;
  eyes: string;
  color: [number, number, number];
  background: [number, number, number] | null;
  bytes: Uint8Array;
  logo: { format: 'jpg' | 'png'; box: QrBox } | null;
  caption: Uint8Array | null;
}

/** What the PDF needs of an asset (a PDF page's preview is embedded when the page can't be). */
export type PdfSource =
  | Pick<ImageAsset, 'kind' | 'src' | 'format' | 'bytes' | 'w' | 'h'>
  | Pick<PdfAsset, 'kind' | 'src' | 'page' | 'view' | 'pageRotation' | 'bytes' | 'preview' | 'w' | 'h'>
  | QrPdfSource;

export interface PdfPiece {
  asset: PdfSource;
  x: number;
  y: number;
  scale: number;
  r: number;
  crop: Crop | null;
}

export interface PdfPage {
  pieces: readonly PdfPiece[];
  lines?: readonly CutLine[];
  paths?: readonly CutPath[];
}

/** What to build: the sheet's size (mm), the pages, the document's title and creator, and how cut lines are drawn. */
export interface PdfJob {
  width: number;
  height: number;
  pages: readonly PdfPage[];
  title: string;
  creator?: string;
  cutStyle?: CutStyle;
}

/** From the export worker: the PDF, or why pdf-lib couldn't build it. */
export type PdfReply = { pdf: Blob; error?: undefined } | { error: string; pdf?: undefined };

export type PdfLib = typeof import('pdf-lib');
type Embedded = { page: PDFEmbeddedPage; image?: undefined } | { image: PDFImage; page?: undefined };

let pdfLibPromise: Promise<PdfLib> | null = null;

// pdf-lib lives in its own chunk: it is downloaded when exporting or printing.
function loadPdfLib() {
  pdfLibPromise ??= import('pdf-lib').catch((err) => {
    pdfLibPromise = null;
    throw err;
  });
  return pdfLibPromise;
}

/** The PDF's bytes as the file that is downloaded or printed. */
export const pdfFile = (bytes: Uint8Array) => new Blob([bytes as BlobPart], { type: 'application/pdf' });

/** Builds the PDF in the export worker. The reply's file goes to the page by reference: its bytes aren't copied there. */
export async function pdfReply(lib: PdfLib, job: PdfJob): Promise<PdfReply> {
  try {
    return { pdf: pdfFile(await drawPdf(lib, job)) };
  } catch (err) {
    return { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) };
  }
}

/** Builds the PDF in the page, loading pdf-lib first (see drawPdf). */
export async function buildPdf(job: PdfJob) {
  return drawPdf(await loadPdfLib(), job);
}

/**
 * Builds the PDF with `lib` (pdf-lib) and returns its bytes. `pages`:
 * [{pieces, lines}] per page; each piece {asset, x, y, scale, r, crop} (x/y in
 * mm from the sheet's top left corner; crop as in crop.js) and each cut line
 * {x1, y1, x2, y2} in mm (cutmarks.cutLines), drawn with `cutStyle`
 * (cutmarks.cutStyle: the same weight, color and dash as on screen). A cropped
 * piece is drawn whole with a clipping path (PDF pages stay vector). Each
 * source (image or PDF page) is embedded once even if it shows up on several
 * pages. `paths` are the contour cut lines (contour.contourCuts), drawn as
 * vector paths with the same stroke.
 */
export async function drawPdf(lib: PdfLib, { width, height, pages, title, creator = title, cutStyle = styleOf() }: PdfJob) {
  const { PDFDocument, degrees, rgb } = lib;
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator(creator);
  const embed = embedder(doc, lib);
  const pt = (mm: number) => mm * PT_PER_MM;

  for (const { pieces, lines = [], paths = [] } of pages) {
    const page = doc.addPage([pt(width), pt(height)]);
    for (const piece of pieces) {
      if (piece.asset.kind === 'qr') {
        await drawQr(lib, doc, page, { ...piece, asset: piece.asset }, height);
        continue;
      }
      const target = await embed(piece.asset);
      const p = drawParams(piece, piece.asset, height);
      const options = { x: p.x, y: p.y, width: p.width, height: p.height, rotate: degrees(p.rotate) };
      if (p.clip) page.pushOperators(lib.pushGraphicsState(), lib.rectangle(p.clip.x, p.clip.y, p.clip.width, p.clip.height), lib.clip(), lib.endPath());
      if (target.page) page.drawPage(target.page, options);
      else page.drawImage(target.image, options);
      if (p.clip) page.pushOperators(lib.popGraphicsState());
    }
    const color = rgb(...cutStyle.rgb);
    const dash = cutStyle.dash ? { dashArray: [...cutStyle.dash], dashPhase: 0 } : {};
    for (const line of lines) {
      page.drawLine({ start: { x: pt(line.x1), y: pt(height - line.y1) }, end: { x: pt(line.x2), y: pt(height - line.y2) }, thickness: cutStyle.width, color, ...dash });
    }
    if (paths.length) {
      const ops = [lib.pushGraphicsState(), lib.setStrokingRgbColor(...cutStyle.rgb), lib.setLineWidth(cutStyle.width), lib.setDashPattern(cutStyle.dash ? [...cutStyle.dash] : [], 0)];
      for (const { points, closed } of paths) {
        ops.push(lib.moveTo(pt(points[0]), pt(height - points[1])));
        for (let i = 2; i < points.length; i += 2) ops.push(lib.lineTo(pt(points[i]), pt(height - points[i + 1])));
        if (closed) ops.push(lib.closePath());
      }
      ops.push(lib.stroke(), lib.popGraphicsState());
      page.pushOperators(...ops);
    }
  }
  return doc.save();
}

// A QR code's logo and caption, embedded once per document however many pieces show them.
const qrImages = new WeakMap<PdfLibDocument, Map<Uint8Array, Promise<PDFImage>>>();

function qrImage(doc: PdfLibDocument, bytes: Uint8Array, format: 'jpg' | 'png') {
  let cache = qrImages.get(doc);
  if (!cache) qrImages.set(doc, (cache = new Map()));
  if (!cache.has(bytes)) cache.set(bytes, format === 'jpg' ? doc.embedJpg(wholeBuffer(bytes)) : doc.embedPng(wholeBuffer(bytes)));
  return cache.get(bytes)!;
}

/**
 * A QR code piece, in units of its modules: the piece's box (crop.drawParams,
 * which never crops a QR code) mapped to its square and band with the origin
 * at the bottom left; the path data, which is y-down from the top left, is
 * flipped by drawSvgPath. The background, the modules and eyes, the logo,
 * then the caption.
 */
async function drawQr(lib: PdfLib, doc: PdfLibDocument, page: ReturnType<PdfLibDocument['addPage']>, piece: PdfPiece & { asset: QrPdfSource }, sheetH: number) {
  const { asset } = piece;
  const p = drawParams(piece, asset, sheetH);
  const full = asset.units + asset.band;
  const [logo, caption] = await Promise.all([
    asset.logo && asset.bytes.length ? qrImage(doc, asset.bytes, asset.logo.format) : null,
    asset.caption ? qrImage(doc, asset.caption, 'png') : null,
  ]);
  page.pushOperators(lib.pushGraphicsState(), lib.translate(p.x, p.y), lib.rotateDegrees(p.rotate), lib.scale(p.width / asset.units, p.height / full));
  if (asset.background) page.drawRectangle({ x: 0, y: 0, width: asset.units, height: full, color: lib.rgb(...asset.background) });
  const color = lib.rgb(...asset.color);
  page.drawSvgPath(asset.dots, { x: 0, y: full, color });
  page.drawSvgPath(asset.eyes, { x: 0, y: full, color });
  if (logo && asset.logo) {
    const { x, y, w, h } = asset.logo.box;
    page.drawImage(logo, { x, y: full - y - h, width: w, height: h });
  }
  if (caption) page.drawImage(caption, { x: 0, y: 0, width: asset.units, height: asset.band });
  page.pushOperators(lib.popGraphicsState());
}

/**
 * The same bytes as the only content of their buffer. pdf-lib's JPEG embedder
 * reads `bytes.buffer` from its start, so a view into a larger buffer (a
 * subarray, a pooled Node Buffer) would be read from the wrong place.
 */
const wholeBuffer = (bytes: Uint8Array) => (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice());

// Returns a function that embeds each source only once.
function embedder(doc: PdfLibDocument, lib: PdfLib) {
  const cache = new Map<string, Promise<Embedded>>(); // source id → embedded page or image
  const sources = new Map<number, Promise<PdfLibDocument>>(); // src → the source PDF loaded with pdf-lib

  const embedImage = async (asset: Extract<PdfSource, { kind: 'image' }>): Promise<Embedded> => {
    const bytes = wholeBuffer(asset.bytes);
    return { image: asset.format === 'jpg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes) };
  };

  // A vector page, cropped to its visible box.
  const embedPage = async (asset: Extract<PdfSource, { kind: 'pdf' }>): Promise<Embedded> => {
    if (!sources.has(asset.src)) {
      sources.set(asset.src, lib.PDFDocument.load(asset.bytes, { updateMetadata: false }));
    }
    const source = await sources.get(asset.src)!;
    const [left, bottom, right, top] = asset.view;
    const [page] = await doc.embedPages([source.getPage(asset.page - 1)], [{ left, bottom, right, top }]);
    return { page };
  };

  // The preview (a PNG) already comes rotated as it should.
  const embedPreview = async (asset: Extract<PdfSource, { kind: 'pdf' }>): Promise<Embedded> => {
    const png = new Uint8Array(await asset.preview.arrayBuffer());
    return { image: await doc.embedPng(png) };
  };

  const embedPdfAsset = async (asset: Extract<PdfSource, { kind: 'pdf' }>): Promise<Embedded> => {
    if (asset.pageRotation % 360 === 0) {
      try {
        return await embedPage(asset);
      } catch (err) {
        // For example, encrypted PDFs that pdf.js opens but pdf-lib doesn't.
        console.warn('The page could not be embedded as a vector; using its image.', err);
      }
    }
    return embedPreview(asset);
  };

  return (asset: Exclude<PdfSource, QrPdfSource>) => {
    const id = asset.kind === 'pdf' ? `${asset.src}#${asset.page}` : String(asset.src);
    if (!cache.has(id)) cache.set(id, asset.kind === 'pdf' ? embedPdfAsset(asset) : embedImage(asset));
    return cache.get(id)!;
  };
}
