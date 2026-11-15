// The thumbnail of a project in the «Proyectos» dialog: its first sheet,
// drawn from the images already loaded on screen.

import { cssParams } from '../core/crop.js';
import type { AppAsset } from './assets.ts';
import { blobOfBytes } from './storage/hash.ts';
import type { Piece } from '../state/document.ts';

const THUMB_WIDTH = 220;

/** The signature of what the thumbnail shows (to skip redrawing it when nothing changed). */
export const thumbnailSignature = (W: number, H: number, items: readonly Piece[]) =>
  JSON.stringify([W, H, items.map((item) => [item.asset, item.x, item.y, item.scale, item.r, item.crop ?? null])]);

/**
 * Draws a W × H sheet with its pieces (in stacking order) into a WebP Blob
 * (PNG where the browser can't encode WebP).
 * `imageOf(item)`: the piece's loaded <img>, if any. The same math as the
 * screen (crop.cssParams): the whole image, rotated around its center,
 * clipped to the piece's rectangle.
 */
export async function drawThumbnail(
  W: number,
  H: number,
  items: readonly Piece[],
  assetOf: (key: string) => AppAsset | undefined,
  imageOf: (item: Piece) => HTMLImageElement | null
): Promise<Blob | null> {
  const k = THUMB_WIDTH / W;
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_WIDTH;
  canvas.height = Math.round(H * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const item of items) {
    const img = imageOf(item);
    const asset = assetOf(item.asset);
    if (!img?.complete || !img.naturalWidth || !asset) continue;
    const p = cssParams(item, asset, k);
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.left, p.top, p.width, p.height);
    ctx.clip();
    ctx.translate(p.left + p.img.left + p.img.width / 2, p.top + p.img.top + p.img.height / 2);
    ctx.rotate((item.r * Math.PI) / 180);
    ctx.drawImage(img, -p.img.width / 2, -p.img.height / 2, p.img.width, p.img.height);
    ctx.restore();
  }
  // Encoded at once, into bytes the app keeps (storage/hash.ts), so storing it
  // doesn't read a Blob: WebKit fails that read while the page is going away,
  // and the save after a file added right before closing the tab failed.
  // (Safari can't encode WebP: the data URL says what it got.)
  const url = canvas.toDataURL('image/webp', 0.82);
  const comma = url.indexOf(',');
  const type = /^data:([^;,]+)/.exec(url.slice(0, comma))?.[1];
  if (!type || comma === url.length - 1) return null;
  return blobOfBytes(Uint8Array.from(atob(url.slice(comma + 1)), (c) => c.charCodeAt(0)), type);
}
