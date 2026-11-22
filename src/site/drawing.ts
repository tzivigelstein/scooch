// The drawing of a sheet with copies on it: an inline SVG, built the same way
// on the server and in the calculator's script (so it imports nothing heavy);
// and of a sheet of stickers with their cut lines (the stickers guide).

import type { Rect } from '../core/types.ts';
import { esc } from './html.ts';

const r = (v: number) => Math.round(v * 100) / 100;

/** The stroke the drawing of a `w` × `h` mm sheet uses (mm). */
const strokeOf = (w: number, h: number) => Math.max(w, h) / 400;

/** The sheet with its margin (dashed), around `content` (in sheet mm). The sheet is white in both themes, like paper. */
function sheetFrame({ w, h, margin, label }: { w: number; h: number; margin: number; label: string }, content: string) {
  const pad = Math.max(w, h) * 0.03;
  const stroke = strokeOf(w, h);
  const area =
    margin > 0
      ? `<rect class="margin" x="${r(margin)}" y="${r(margin)}" width="${r(w - 2 * margin)}" height="${r(h - 2 * margin)}" stroke-width="${r(stroke)}" stroke-dasharray="${r(stroke * 4)} ${r(stroke * 3)}"/>`
      : '';
  return (
    `<svg class="sheet-svg" viewBox="${r(-pad)} ${r(-pad)} ${r(w + 2 * pad)} ${r(h + 2 * pad)}" role="img" aria-label="${esc(label)}">` +
    `<rect class="sheet" x="0" y="0" width="${r(w)}" height="${r(h)}" stroke-width="${r(stroke)}"/>${area}${content}</svg>`
  );
}

/**
 * A sheet of `w` × `h` mm with its margin (dashed) and the copies at
 * `placements` (in the printable area); `label` is its accessible name.
 */
export function sheetSvg({ w, h, margin, placements, label }: { w: number; h: number; margin: number; placements: readonly Rect[]; label: string }) {
  const stroke = strokeOf(w, h);
  const rects = placements
    .map((p) => `<rect class="photo" x="${r(margin + p.x)}" y="${r(margin + p.y)}" width="${r(p.w)}" height="${r(p.h)}" stroke-width="${r(stroke * 1.5)}"/>`)
    .join('');
  return sheetFrame({ w, h, margin, label }, rects);
}

/**
 * A sheet with stickers of a few shapes, each with its cut line: each shape
 * is drawn once (`fill`, its outline, and `cut`, its cut line: path data in
 * mm from the sticker's top left corner) and shown at `placements` (its top
 * left corner in the printable area). The shapes take the copies' colors
 * (as attributes: the page's CSS doesn't reach what <use> shows), and the cut
 * line is black, the app's first color for cut lines.
 */
export function shapesSheetSvg({ w, h, margin, shapes, placements, label }: { w: number; h: number; margin: number; shapes: readonly { fill: string; cut: string }[]; placements: readonly { x: number; y: number; shape: number }[]; label: string }) {
  const stroke = strokeOf(w, h);
  const defs = shapes
    .map(
      (s, i) =>
        `<g id="sticker-shape-${i}"><path d="${s.fill}" fill="#d6e4ff" fill-rule="evenodd" stroke="#0052cc" stroke-width="${r(stroke)}"/><path d="${s.cut}" fill="none" stroke="#000000" stroke-width="${r(stroke * 1.5)}"/></g>`
    )
    .join('');
  const uses = placements.map((p) => `<use href="#sticker-shape-${p.shape}" x="${r(margin + p.x)}" y="${r(margin + p.y)}"/>`).join('');
  return sheetFrame({ w, h, margin, label }, `<defs>${defs}</defs>${uses}`);
}
