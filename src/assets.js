// Lectura de archivos: imágenes y páginas de PDF convertidas en "assets"
// con su tamaño físico en mm y todo lo necesario para mostrarlas, exportarlas
// y guardarlas en un proyecto: `bytes` (lo que se embebe en el PDF; en un PDF,
// el archivo original), `original` (el archivo original de una imagen, solo si
// `derived`: lo que se embebe se re-codificó) y `preview` (la vista previa
// rasterizada, con su URL en `url`). Al restaurar un proyecto, el documento
// de pdf.js (`pdf`) se abre recién si hace falta otra página.

import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { t } from './copy/index.js';

export const MAX_FILE_BYTES = 40 * 1024 * 1024;
export const DEFAULT_DPI = 300;

const MAX_PIXELS = 60e6;
const PREVIEW_PX = 1200;
const PDF_PREVIEW_PX = 2400;
const MM_PER_INCH = 25.4;
const PT_PER_INCH = 72;

// Identifica el archivo de origen: los assets derivados (otra página, otra
// resolución) lo comparten y así al exportar se embebe una sola vez.
let lastSource = 0;

/** Lee un File y devuelve un asset de imagen o de PDF (página 1). */
export async function readFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error(t('errors.file.tooHeavy'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name || t('pieces.pastedName');
  return looksLikePdf(file, bytes) ? readPdf(name, bytes) : readImage(name, file, bytes);
}

/** Mismo asset de imagen con otra resolución (cambia su tamaño en mm). */
export function withDpi(asset, dpi) {
  const [pw, ph] = asset.px;
  return { ...asset, dpi, w: (pw / dpi) * MM_PER_INCH, h: (ph / dpi) * MM_PER_INCH };
}

// ---------- Imágenes ----------

async function readImage(name, file, bytes) {
  const img = await decodeImage(file);
  const pw = img.naturalWidth;
  const ph = img.naturalHeight;
  if (!pw || !ph) throw new Error(t('errors.file.noSize'));
  if (pw * ph > MAX_PIXELS) {
    throw new Error(t('errors.file.tooManyPixels', { mp: Math.round((pw * ph) / 1e6) }));
  }

  // pdf-lib solo embebe JPG y PNG, y no aplica la orientación EXIF: en esos
  // casos se re-codifica con canvas, que sí la aplica al dibujar.
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
  const asset = {
    kind: 'image',
    name,
    src: ++lastSource,
    px: [pw, ph],
    bytes: data,
    format,
    derived,
    original: derived ? new Blob([bytes], { type: file.type }) : undefined,
    preview: blob,
    url: URL.createObjectURL(blob),
  };
  return withDpi(asset, DEFAULT_DPI);
}

async function decodeImage(file) {
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

function rasterize(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  return canvas;
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(t('errors.file.processFailed')))),
      type,
      quality
    )
  );
}

async function canvasBytes(canvas, type, quality) {
  const blob = await canvasBlob(canvas, type, quality);
  return new Uint8Array(await blob.arrayBuffer());
}

function sniffImage(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  return null;
}

function looksLikePdf(file, bytes) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return true;
  // El encabezado %PDF- puede no estar justo al principio.
  const head = String.fromCharCode(...bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

/** Valor del tag EXIF Orientation (0x0112) de un JPEG; 1 si no tiene. */
export function jpegOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return 1;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xff) {
      offset += 1; // byte de relleno
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return 1; // empiezan los datos de imagen
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1 && size >= 16 && ascii(view, offset + 4, 6) === 'Exif\0\0') {
      return tiffOrientation(view, offset + 10, Math.min(offset + 2 + size, view.byteLength)) ?? 1;
    }
    offset += 2 + size;
  }
  return 1;
}

function tiffOrientation(view, start, end) {
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

function ascii(view, start, length) {
  let text = '';
  for (let i = 0; i < length && start + i < view.byteLength; i++) {
    text += String.fromCharCode(view.getUint8(start + i));
  }
  return text;
}

// ---------- PDF ----------

let pdfjsPromise = null;

// pdf.js y su worker van en archivos aparte: se descargan recién con el primer
// PDF (o, en un proyecto restaurado, cuando se pide otra página).
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

async function readPdf(name, bytes) {
  const pdfjs = await loadPdfjs();
  let pdf;
  try {
    // pdf.js transfiere el buffer al worker: se le pasa una copia.
    pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new Error(t('errors.file.password'));
    }
    throw new Error(t('errors.file.damaged'));
  }
  return pdfPage({ name, src: ++lastSource, pdf, bytes }, 1);
}

/** Abre con pdf.js los bytes de un PDF (de un proyecto restaurado). */
export async function openPdf(bytes) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
}

/** Asset para la página `n` (desde 1) de un PDF (`base.pdf` ya abierto). */
export async function pdfPage(base, n) {
  const page = await base.pdf.getPage(n);
  try {
    const natural = page.getViewport({ scale: 1 }); // ya incluye la rotación de la página
    const scale = Math.min(3, PDF_PREVIEW_PX / Math.max(natural.width, natural.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const blob = await canvasBlob(canvas, 'image/png');
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
      view: [...page.view], // caja visible (CropBox) en puntos, sin rotar
      px: [canvas.width, canvas.height], // vista previa (lo que se embebe si no va como vector)
      w: (natural.width / PT_PER_INCH) * MM_PER_INCH,
      h: (natural.height / PT_PER_INCH) * MM_PER_INCH,
      url: URL.createObjectURL(blob),
    };
  } finally {
    page.cleanup();
  }
}

// ---------- Proyectos guardados ----------

/** Los próximos orígenes nuevos no chocan con los de un proyecto restaurado. */
export function reserveSources(next) {
  lastSource = Math.max(lastSource, next - 1);
}

const MIME = { jpg: 'image/jpeg', png: 'image/png' };

/**
 * Binario de una clave de projectdoc.fileKeys para guardar: el archivo
 * original, los bytes a embeber (si difieren) o la vista previa.
 */
export function assetBlob(asset, kind) {
  if (kind === 'preview') return asset.preview;
  if (kind === 'bytes') return new Blob([asset.bytes], { type: MIME[asset.format] });
  if (asset.original) return asset.original;
  return new Blob([asset.bytes], { type: asset.kind === 'pdf' ? 'application/pdf' : MIME[asset.format] });
}

/**
 * Assets de un documento guardado (projectdoc) a partir de sus archivos
 * (Map clave → Blob). Las páginas de un mismo PDF comparten sus bytes; pdf.js
 * no se carga. Si algo falla, libera lo que alcanzó a crear y lanza.
 */
export async function restoreAssets(doc, files) {
  const read = (blob) => blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  const shared = new Map(); // clave del binario → promesa de bytes
  const out = new Map();
  try {
    for (const [key, meta] of Object.entries(doc.assets)) {
      const derived = meta.kind === 'image' && meta.derived;
      const bytesKey = derived ? `bytes:${meta.src}` : `src:${meta.src}`;
      if (!shared.has(bytesKey)) shared.set(bytesKey, read(files.get(bytesKey)));
      const preview = files.get(`preview:${key}`);
      out.set(key, {
        ...meta,
        px: [...meta.px],
        ...(meta.view ? { view: [...meta.view] } : {}),
        bytes: await shared.get(bytesKey),
        original: derived ? files.get(`src:${meta.src}`) : undefined,
        preview,
        pdf: null,
        url: URL.createObjectURL(preview),
      });
    }
  } catch (err) {
    for (const asset of out.values()) URL.revokeObjectURL(asset.url);
    throw err;
  }
  reserveSources(Math.max(1, ...Object.values(doc.assets).map((meta) => meta.src + 1)));
  return out;
}
