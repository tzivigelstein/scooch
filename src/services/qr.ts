// QR code pieces in the page: their picture, built from their fields
// (core/qrshape.js) as an SVG the sheet shows like any image (crisp at every
// zoom), with their logo and their caption. A chunk of its own: it loads with
// the first QR code (added, or in a project that opens).
//
// The caption is the one part that is no path: its text is rasterized with
// the editor's fonts (and the system's, for scripts they don't cover), so
// nothing is downloaded and every script shows. The PDF gets the same raster
// at print resolution (services/export.ts), so both show the same glyphs.

import { CAPTION_BAND, cleanQr, qrDrawing } from '../core/qrshape.js';
import type { QrAssetMeta, StoredFile } from '../core/types.ts';
import { t } from '../copy/index.ts';
import type { QrAsset, QrLogo } from './assets.ts';
import type { QrPdfSource } from './pdf.ts';
import { knownBytes } from './storage/hash.ts';

/** A new QR code's side at 100 %, quiet zone included (mm). */
export const QR_SIDE = 40;
/** The caption's raster on screen: px across the code. */
const SCREEN_PX = 1600;

/** What makes a QR code: what editing it changes. */
export type QrFields = Pick<QrAsset, 'text' | 'color' | 'background' | 'dots' | 'eyes' | 'caption' | 'logo'>;

const num = (n: number) => String(Math.round(n * 1000) / 1000);

// ---------- Logo ----------

const MIME = { jpg: 'image/jpeg', png: 'image/png' } as const;
const logoUrls = new WeakMap<QrLogo, string>();
const logoImages = new WeakMap<QrLogo, HTMLImageElement>();

/** The logo as a data URL: an SVG shown as an image can't load anything, so it carries the logo inside. Made once per logo. */
function logoUrl(logo: QrLogo) {
  let url = logoUrls.get(logo);
  if (!url) {
    let binary = '';
    for (let i = 0; i < logo.bytes.length; i += 0x8000) binary += String.fromCharCode(...logo.bytes.subarray(i, i + 0x8000));
    url = `data:${MIME[logo.format]};base64,${btoa(binary)}`;
    logoUrls.set(logo, url);
  }
  return url;
}

/** The logo decoded, for drawing it into a canvas (a data URL: it never taints one). */
function logoImage(logo: QrLogo) {
  let img = logoImages.get(logo);
  if (!img) {
    img = new Image();
    img.src = logoUrl(logo);
    logoImages.set(logo, img);
  }
  return img;
}

// ---------- Caption ----------

/** The editor's font stack, with Hindi's font where it shows Hindi (src/styles/tokens.css). */
const fontFamily = () => getComputedStyle(document.body).fontFamily || 'sans-serif';
const captionFont = (px: number) => `600 ${px}px ${fontFamily()}`;

/**
 * The caption drawn into a canvas `width` px wide and `ratio` of that tall
 * (its band): centred, in `color`, as large as the band allows and smaller
 * when it is too long for the code's width. Null where there is no canvas.
 */
export async function captionCanvas(caption: string, color: string, width: number, ratio: number): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(width * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const band = canvas.height;
  try {
    // The faces its characters need (Inter's subsets load by script).
    await document.fonts?.load(captionFont(band), caption);
  } catch {
    // The fallback faces draw it.
  }
  let size = band * 0.6;
  ctx.font = captionFont(size);
  const room = canvas.width * 0.92;
  const measured = ctx.measureText(caption).width;
  if (measured > room) {
    size *= room / measured;
    ctx.font = captionFont(size);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption, canvas.width / 2, band / 2);
  return canvas;
}

// The last captions drawn for the screen: typing in another field draws the same one again.
const captions = new Map<string, string>();
const CAPTIONS_KEPT = 24;

async function captionUrl(caption: string, color: string, ratio: number) {
  const key = `${color}|${ratio}|${caption}`;
  let url = captions.get(key);
  if (url === undefined) {
    url = (await captionCanvas(caption, color, SCREEN_PX, ratio))?.toDataURL('image/png') ?? '';
    captions.set(key, url);
    if (captions.size > CAPTIONS_KEPT) captions.delete(captions.keys().next().value!);
  }
  return url;
}

// ---------- The picture ----------

/**
 * Builds a QR code of `w` mm (its square) from its fields: its style is read
 * as qrshape.cleanQr reads it. With a caption it is `h` mm tall when that
 * leaves room for one (an existing code keeps its band), otherwise its square
 * plus the band.
 */
export async function buildQr(fields: QrFields, w: number, h = w): Promise<QrAsset> {
  const qr = cleanQr(fields);
  const height = qr.caption ? (h > w ? h : w * (1 + CAPTION_BAND)) : w;
  const drawing = qrDrawing(qr.text, { dots: qr.dots, eyes: qr.eyes, logo: qr.logo ? qr.logo.px[0] / qr.logo.px[1] : null })!;
  const u = drawing.units;
  const band = (u * (height - w)) / w;
  const caption = qr.caption ? await captionUrl(qr.caption, qr.color, (height - w) / w) : '';
  const full = num(u + band);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${u} ${full}" preserveAspectRatio="none">`;
  if (qr.background) svg += `<rect width="${u}" height="${full}" fill="${qr.background}"/>`;
  svg += `<path fill="${qr.color}" d="${drawing.dots}"/><path fill="${qr.color}" d="${drawing.eyes}"/>`;
  const box = drawing.logo;
  if (qr.logo && box) svg += `<image href="${logoUrl(qr.logo)}" x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}"/>`;
  if (caption) svg += `<image href="${caption}" x="0" y="${u}" width="${u}" height="${num(band)}" preserveAspectRatio="none"/>`;
  svg += '</svg>';
  const preview = new Blob([svg], { type: 'image/svg+xml' });
  const { logo } = qr;
  return {
    kind: 'qr',
    text: qr.text,
    color: qr.color,
    background: qr.background,
    dots: qr.dots,
    eyes: qr.eyes,
    caption: qr.caption,
    logo,
    w,
    h: height,
    get name() {
      return qr.text.replace(/\s+/g, ' ').trim() || t('qr.name');
    },
    url: URL.createObjectURL(preview),
    preview,
    bytes: logo?.bytes ?? new Uint8Array(),
    hashes: { src: logo?.hash ?? '', preview: '' },
    drawing,
    signature: JSON.stringify([qr.text, qr.color, qr.background, qr.dots, qr.eyes, qr.caption, logo?.hash ?? null, w, height]),
    paint(ctx, bw, bh) {
      ctx.save();
      ctx.scale(bw / u, bh / (u + band));
      if (qr.background) {
        ctx.fillStyle = qr.background;
        ctx.fillRect(0, 0, u, u + band);
      }
      ctx.fillStyle = qr.color;
      ctx.fill(new Path2D(drawing.dots));
      ctx.fill(new Path2D(drawing.eyes));
      const img = logo && box && logoImage(logo);
      if (img?.complete && img.naturalWidth) ctx.drawImage(img, box!.x, box!.y, box!.w, box!.h);
      if (qr.caption) {
        ctx.font = captionFont(band * 0.6);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(qr.caption, u / 2, u + band / 2, u * 0.92);
      }
      ctx.restore();
    },
  };
}

// ---------- The PDF ----------

/** The caption's raster in the PDF: px per inch of its printed width, and at most this many px across. */
const PRINT_DPI = 600;
const PRINT_PX = 8000;

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

function pngBytes(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array | null>((resolve) =>
    canvas.toBlob((blob) => {
      if (!blob) resolve(null);
      else blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), () => resolve(null));
    }, 'image/png')
  );
}

/**
 * What the PDF draws of a QR code (pdf.ts drawQr): its paths and colors, its
 * logo's bytes and its caption rasterized at PRINT_DPI for its largest piece
 * (`scale`, in %), so it prints as sharp as its modules.
 */
export async function qrPdfSource(qr: QrAsset, scale: number): Promise<QrPdfSource> {
  const { units } = qr.drawing;
  const ratio = (qr.h - qr.w) / qr.w;
  let caption: Uint8Array | null = null;
  if (qr.caption) {
    const px = Math.min(PRINT_PX, Math.max(64, Math.round((((qr.w * scale) / 100) * PRINT_DPI) / 25.4)));
    const canvas = await captionCanvas(qr.caption, qr.color, px, ratio);
    caption = canvas && (await pngBytes(canvas));
  }
  return {
    kind: 'qr',
    w: qr.w,
    h: qr.h,
    units,
    band: units * ratio,
    dots: qr.drawing.dots,
    eyes: qr.drawing.eyes,
    color: rgb(qr.color),
    background: qr.background ? rgb(qr.background) : null,
    bytes: qr.bytes,
    logo: qr.logo && qr.drawing.logo ? { format: qr.logo.format, box: qr.drawing.logo } : null,
    caption,
  };
}

/** A QR code of a saved document, an undo step or the clipboard, with its logo from its files. */
export async function restoreQr(meta: QrAssetMeta, files: ReadonlyMap<string, StoredFile>): Promise<QrAsset> {
  let logo: QrLogo | null = null;
  if (meta.logo) {
    const file = files.get(`src:${meta.logo.src}`)!;
    const bytes = knownBytes(file.blob) ?? new Uint8Array(await file.blob.arrayBuffer());
    logo = { src: meta.logo.src, format: meta.logo.format, px: [meta.logo.px[0], meta.logo.px[1]], bytes, blob: file.blob, hash: file.hash };
  }
  return buildQr({ ...meta, logo }, meta.w, meta.h);
}
