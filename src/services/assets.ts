// Reading files: images and PDF pages become "assets" with their physical
// size in mm and everything needed to show, export and save them in a
// project: `bytes` (what gets embedded in the PDF; for a PDF, the original
// file), `original` (an image's original file, only if `derived`: what gets
// embedded was re-encoded) and `preview` (the rasterized preview, with its URL
// in `url`). In a restored project, the pdf.js document (`pdf`) is only opened
// when another page is needed.

import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { AssetMeta, StoredFile } from '../core/types.ts';
import { t } from '../copy/index.ts';
import { hashBlob, hashBytes } from './storage/hash.ts';

export const MAX_FILE_BYTES = 40 * 1024 * 1024;
export const DEFAULT_DPI = 300;

const MAX_PIXELS = 60e6;
const PREVIEW_PX = 1200;
const PDF_PREVIEW_PX = 2400;
const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

interface AssetBase {
  name: string;
  /** Source file: derived assets (another page, another resolution) share it, so it is embedded once. */
  src: number;
  px: [number, number];
  w: number;
  h: number;
  bytes: Uint8Array;
  preview: Blob;
  url: string;
  /**
   * The content hashes of its binaries (see storage/hash.ts), by the kind of
   * file (projectdoc.fileKeys): its source file, the bytes embedded when they
   * aren't the source (`derived` images) and the preview. Known once added.
   */
  hashes?: AssetHashes;
}

export interface AssetHashes {
  src: string;
  bytes?: string;
  preview: string;
}

export interface ImageAsset extends AssetBase {
  kind: 'image';
  format: 'jpg' | 'png';
  dpi: number;
  derived: boolean;
  original?: Blob;
}

export interface PdfAsset extends AssetBase {
  kind: 'pdf';
  pdf: PDFDocumentProxy | null;
  page: number;
  pages: number;
  pageRotation: number;
  view: [number, number, number, number];
}

export type AppAsset = ImageAsset | PdfAsset;

let lastSource = 0;

/** Reads a File into an image asset or a PDF asset (page 1), with its hashes. */
export async function readFile(file: File): Promise<AppAsset> {
  if (file.size > MAX_FILE_BYTES) throw new Error(t('errors.file.tooHeavy'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name || t('pieces.pastedName');
  return withHashes(await (looksLikePdf(file, bytes) ? readPdf(name, bytes) : readImage(name, file, bytes)));
}

/**
 * The asset with the hashes of its binaries (the ones it already has are
 * kept: a PDF's pages share their source file's).
 */
export async function withHashes<A extends AppAsset>(asset: A): Promise<A> {
  const derived = asset.kind === 'image' && asset.derived;
  const [src, bytes, preview] = await Promise.all([
    asset.hashes?.src || (derived && asset.original ? hashBlob(asset.original) : hashBytes(asset.bytes)),
    derived ? asset.hashes?.bytes || hashBytes(asset.bytes) : undefined,
    asset.hashes?.preview || hashBlob(asset.preview),
  ]);
  asset.hashes = bytes ? { src, bytes, preview } : { src, preview };
  return asset;
}

/** The same image asset with another resolution (its size in mm changes). */
export function withDpi(asset: ImageAsset, dpi: number): ImageAsset {
  const [pw, ph] = asset.px;
  return { ...asset, dpi, w: (pw / dpi) * MM_PER_INCH, h: (ph / dpi) * MM_PER_INCH };
}

// ---------- Images ----------

async function readImage(name: string, file: File, bytes: Uint8Array): Promise<ImageAsset> {
  const img = await decodeImage(file);
  const pw = img.naturalWidth;
  const ph = img.naturalHeight;
  if (!pw || !ph) throw new Error(t('errors.file.noSize'));
  if (pw * ph > MAX_PIXELS) {
    throw new Error(t('errors.file.tooManyPixels', { mp: Math.round((pw * ph) / 1e6) }));
  }

  // pdf-lib only embeds JPG and PNG and ignores the EXIF orientation: those
  // cases are re-encoded with a canvas, which applies it when drawing.
  let format = sniffImage(bytes);
  let data = bytes;
  if (format === 'jpg' && jpegOrientation(bytes) !== 1) {
    data = await canvasBytes(rasterize(img, pw, ph), 'image/jpeg', 0.95);
  } else if (!format) {
    format = 'png';
    data = await canvasBytes(rasterize(img, pw, ph), 'image/png');
  }

  const k = Math.min(1, PREVIEW_PX / Math.max(pw, ph));
  const preview = rasterize(img, Math.max(1, Math.round(pw * k)), Math.max(1, Math.round(ph * k)));
  const blob = await canvasBlob(preview, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.9);

  const derived = data !== bytes;
  const asset: ImageAsset = {
    kind: 'image',
    name,
    src: ++lastSource,
    px: [pw, ph],
    bytes: data,
    format,
    derived,
    original: derived ? new Blob([bytes as BlobPart], { type: file.type }) : undefined,
    preview: blob,
    url: URL.createObjectURL(blob),
    dpi: DEFAULT_DPI,
    w: 0,
    h: 0,
  };
  return withDpi(asset, DEFAULT_DPI);
}

async function decodeImage(file: File) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    return img;
  } catch {
    throw new Error(t('errors.file.unsupported'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rasterize(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('errors.file.processFailed')))), type, quality)
  );
}

async function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number) {
  const blob = await canvasBlob(canvas, type, quality);
  return new Uint8Array(await blob.arrayBuffer());
}

function sniffImage(b: Uint8Array): 'jpg' | 'png' | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  return null;
}

function looksLikePdf(file: File, bytes: Uint8Array) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return true;
  // The %PDF- header may not be right at the start.
  const head = String.fromCharCode(...bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

/** Value of the EXIF Orientation tag (0x0112) of a JPEG; 1 when it has none. */
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return 1;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return 1; // image data starts
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1 && size >= 16 && ascii(view, offset + 4, 6) === 'Exif\0\0') {
      return tiffOrientation(view, offset + 10, Math.min(offset + 2 + size, view.byteLength)) ?? 1;
    }
    offset += 2 + size;
  }
  return 1;
}

function tiffOrientation(view: DataView, start: number, end: number): number | null {
  const order = view.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const ifd = start + view.getUint32(start + 4, little);
  if (ifd + 2 > end) return null;
  const count = view.getUint16(ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
  }
  return null;
}

function ascii(view: DataView, start: number, length: number) {
  let text = '';
  for (let i = 0; i < length && start + i < view.byteLength; i++) {
    text += String.fromCharCode(view.getUint8(start + i));
  }
  return text;
}

// ---------- PDF ----------

type Pdfjs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<Pdfjs> | null = null;

// pdf.js and its worker live in their own files: they are downloaded with the
// first PDF (or, in a restored project, when another page is needed).
function loadPdfjs() {
  pdfjsPromise ??= import('pdfjs-dist').then(
    (lib) => {
      lib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return lib;
    },
    (err) => {
      pdfjsPromise = null;
      throw err;
    }
  );
  return pdfjsPromise;
}

async function readPdf(name: string, bytes: Uint8Array) {
  const pdfjs = await loadPdfjs();
  let pdf: PDFDocumentProxy;
  try {
    // pdf.js transfers the buffer to the worker: it gets a copy.
    pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  } catch (err) {
    if ((err as Error | null)?.name === 'PasswordException') {
      throw new Error(t('errors.file.password'));
    }
    throw new Error(t('errors.file.damaged'));
  }
  return pdfPage({ name, src: ++lastSource, pdf, bytes }, 1);
}

/** Opens the bytes of a PDF with pdf.js (for a restored project). */
export async function openPdf(bytes: Uint8Array) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
}

/** The asset of page `n` (from 1) of a PDF (`base.pdf` already open). */
export async function pdfPage(base: { name: string; src: number; pdf: PDFDocumentProxy; bytes: Uint8Array }, n: number): Promise<PdfAsset> {
  const page = await base.pdf.getPage(n);
  try {
    const natural = page.getViewport({ scale: 1 }); // includes the page's own rotation
    const scale = Math.min(3, PDF_PREVIEW_PX / Math.max(natural.width, natural.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    const blob = await canvasBlob(canvas, 'image/png');
    const [x0, y0, x1, y1] = page.view;
    return {
      kind: 'pdf',
      name: base.name,
      src: base.src,
      pdf: base.pdf,
      bytes: base.bytes,
      page: n,
      pages: base.pdf.numPages,
      preview: blob,
      pageRotation: page.rotate,
      view: [x0, y0, x1, y1], // visible box (CropBox) in points, unrotated
      px: [canvas.width, canvas.height], // the preview (embedded when not drawn as a vector)
      w: (natural.width / PT_PER_INCH) * MM_PER_INCH,
      h: (natural.height / PT_PER_INCH) * MM_PER_INCH,
      url: URL.createObjectURL(blob),
    };
  } finally {
    page.cleanup();
  }
}

// ---------- Saved projects ----------

/** A source id no asset of the open project uses (for pieces pasted from another project). */
export const newSource = () => ++lastSource;

/** New sources don't clash with the ones of a restored project. */
export function reserveSources(next: number) {
  lastSource = Math.max(lastSource, next - 1);
}

const MIME = { jpg: 'image/jpeg', png: 'image/png' } as const;

/**
 * The binary of a projectdoc.fileKeys key, to save it: the original file, the
 * bytes to embed (when they differ) or the preview.
 */
export function assetBlob(asset: AppAsset, kind: 'original' | 'bytes' | 'preview'): Blob {
  if (kind === 'preview') return asset.preview;
  if (kind === 'bytes') return new Blob([asset.bytes as BlobPart], { type: asset.kind === 'image' ? MIME[asset.format] : 'application/pdf' });
  if (asset.kind === 'image' && asset.original) return asset.original;
  return new Blob([asset.bytes as BlobPart], { type: asset.kind === 'pdf' ? 'application/pdf' : MIME[asset.format] });
}

/**
 * The assets of a saved document (projectdoc), an undo history or the
 * clipboard (their `assets`) from their files (key → StoredFile). Pages of
 * the same PDF share their bytes; pdf.js is not loaded. If something fails,
 * it releases what it created and throws.
 */
export async function restoreAssets(doc: { assets: Record<string, AssetMeta> }, files: ReadonlyMap<string, StoredFile>): Promise<Map<string, AppAsset>> {
  const read = (blob: Blob) => blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  const shared = new Map<string, Promise<Uint8Array>>(); // binary key → its bytes
  const out = new Map<string, AppAsset>();
  try {
    for (const [key, meta] of Object.entries(doc.assets)) {
      const derived = meta.kind === 'image' && meta.derived;
      const bytesKey = derived ? `bytes:${meta.src}` : `src:${meta.src}`;
      if (!shared.has(bytesKey)) shared.set(bytesKey, read(files.get(bytesKey)!.blob));
      const preview = files.get(`preview:${key}`)!;
      const source = files.get(`src:${meta.src}`)!;
      const hashes: AssetHashes = derived ? { src: source.hash, bytes: files.get(bytesKey)!.hash, preview: preview.hash } : { src: source.hash, preview: preview.hash };
      const common = { px: [...meta.px] as [number, number], bytes: await shared.get(bytesKey)!, preview: preview.blob, url: URL.createObjectURL(preview.blob), hashes };
      out.set(
        key,
        meta.kind === 'image'
          ? { ...meta, ...common, original: derived ? source.blob : undefined }
          : { ...meta, ...common, view: [...meta.view] as [number, number, number, number], pdf: null }
      );
    }
  } catch (err) {
    for (const asset of out.values()) URL.revokeObjectURL(asset.url);
    throw err;
  }
  reserveSources(Math.max(1, ...Object.values(doc.assets).map((meta) => meta.src + 1)));
  return out;
}
