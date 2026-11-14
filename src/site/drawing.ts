// The drawing of a sheet with copies on it: an inline SVG, built the same way
// on the server and in the calculator's script (so it imports nothing heavy).

import type { Rect } from '../core/types.ts';
import { esc } from './html.ts';

const r = (v: number) => Math.round(v * 100) / 100;

/**
 * A sheet of `w` × `h` mm with its margin (dashed) and the copies at
 * `placements` (in the printable area). The sheet is white in both themes,
 * like paper; `label` is its accessible name.
 */
export function sheetSvg({ w, h, margin, placements, label }: { w: number; h: number; margin: number; placements: readonly Rect[]; label: string }) {
  const pad = Math.max(w, h) * 0.03;
  const stroke = Math.max(w, h) / 400;
  const rects = placements
    .map((p) => `<rect class="photo" x="${r(margin + p.x)}" y="${r(margin + p.y)}" width="${r(p.w)}" height="${r(p.h)}" stroke-width="${r(stroke * 1.5)}"/>`)
    .join('');
  const area =
    margin > 0
      ? `<rect class="margin" x="${r(margin)}" y="${r(margin)}" width="${r(w - 2 * margin)}" height="${r(h - 2 * margin)}" stroke-width="${r(stroke)}" stroke-dasharray="${r(stroke * 4)} ${r(stroke * 3)}"/>`
      : '';
  return (
    `<svg class="sheet-svg" viewBox="${r(-pad)} ${r(-pad)} ${r(w + 2 * pad)} ${r(h + 2 * pad)}" role="img" aria-label="${esc(label)}">` +
    `<rect class="sheet" x="0" y="0" width="${r(w)}" height="${r(h)}" stroke-width="${r(stroke)}"/>${area}${rects}</svg>`
  );
}
