// Export: one PDF page the size of the sheet for each sheet with pieces, in
// order, built with pdf-lib. Where each piece goes (cropped and rotated) comes
// from crop.drawParams; without a crop the numbers and operators are the same
// as always.

import type { PDFDocument as PdfLibDocument, PDFEmbeddedPage, PDFImage } from 'pdf-lib';
import type { CutPath } from '../core/contour.js';
import { cutStyle as styleOf, type CutLine, type CutStyle } from '../core/cutmarks.js';
import { drawParams } from '../core/crop.js';
import type { Crop } from '../core/types.ts';
import type { ImageAsset, PdfAsset } from './assets.ts';

const PT_PER_MM = 72 / 25.4;

/** What the PDF needs of an asset. */
export type PdfSource =
  | Pick<ImageAsset, 'kind' | 'src' | 'format' | 'bytes' | 'w' | 'h'>
  | Pick<PdfAsset, 'kind' | 'src' | 'page' | 'view' | 'pageRotation' | 'bytes' | 'url' | 'w' | 'h'>;

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

type PdfLib = typeof import('pdf-lib');
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

/**
 * Builds the PDF and returns its bytes. `pages`: [{pieces, lines}] per page;
 * each piece {asset, x, y, scale, r, crop} (x/y in mm from the sheet's top
 * left corner; crop as in crop.js) and each cut line {x1, y1, x2, y2} in mm
 * (cutmarks.cutLines), drawn with `cutStyle` (cutmarks.cutStyle: the same
 * weight, color and dash as on screen). A cropped piece is drawn whole with a
 * clipping path (PDF pages stay vector). Each source (image or PDF page) is
 * embedded once even if it shows up on several pages. `paths` are the contour
 * cut lines (contour.contourCuts), drawn as vector paths with the same stroke.
 */
export async function buildPdf({
  width,
  height,
  pages,
  title,
  creator = title,
  cutStyle = styleOf(),
}: {
  width: number;
  height: number;
  pages: readonly PdfPage[];
  title: string;
  creator?: string;
  cutStyle?: CutStyle;
}) {
  const lib = await loadPdfLib();
  const { PDFDocument, degrees, rgb } = lib;
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator(creator);
  const embed = embedder(doc, lib);
  const pt = (mm: number) => mm * PT_PER_MM;

  for (const { pieces, lines = [], paths = [] } of pages) {
    const page = doc.addPage([pt(width), pt(height)]);
    for (const piece of pieces) {
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

  // The preview already comes rotated as it should.
  const embedPreview = async (asset: Extract<PdfSource, { kind: 'pdf' }>): Promise<Embedded> => {
    const png = new Uint8Array(await (await fetch(asset.url)).arrayBuffer());
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

  return (asset: PdfSource) => {
    const id = asset.kind === 'pdf' ? `${asset.src}#${asset.page}` : String(asset.src);
    if (!cache.has(id)) cache.set(id, asset.kind === 'pdf' ? embedPdfAsset(asset) : embedImage(asset));
    return cache.get(id)!;
  };
}
