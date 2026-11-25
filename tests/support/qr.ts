// Reading QR codes back in tests: what the app draws, rasterized here, then
// decoded by jsQR (an independent reader, a development dependency only). A
// code that jsQR reads back to the same text is one a phone can read.
import jsQR from 'jsqr';
import type { QrMatrix } from '../../src/core/qrcode.js';

export interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export type Rgb = readonly [number, number, number];

/** A blank raster of `color`. */
export function blank(width: number, height: number, color: Rgb = [255, 255, 255]): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([...color, 255], i * 4);
  return { data, width, height };
}

/** The bare matrix, `scale` px a module, with a quiet zone of `quiet` modules. */
export function rasterizeMatrix({ size, dark }: Pick<QrMatrix, 'size' | 'dark'>, { scale = 3, quiet = 4, ink = [0, 0, 0] as Rgb, paper = [255, 255, 255] as Rgb } = {}): Raster {
  const side = (size + 2 * quiet) * scale;
  const out = blank(side, side, paper);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!dark[y * size + x]) continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) out.data.set([...ink, 255], (((y + quiet) * scale + py) * side + (x + quiet) * scale + px) * 4);
      }
    }
  }
  return out;
}

// ---------- Path data, as the screen and the PDF draw it ----------

type Polygon = number[]; // x0, y0, x1, y1, …

/** SVG path data (M, L, H, V, A and Z, absolute or relative) as closed polygons, arcs in short segments. */
export function polygonsOf(d: string): Polygon[] {
  const tokens = d.match(/[MLHVAZmlhvaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const polygons: Polygon[] = [];
  let current: Polygon = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let i = 0;
  const next = () => Number(tokens[i++]);
  const close = () => {
    if (current.length >= 6) polygons.push(current);
    current = [];
  };
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    switch (cmd.toUpperCase()) {
      case 'M': {
        close();
        x = next() + (rel ? x : 0);
        y = next() + (rel ? y : 0);
        [sx, sy] = [x, y];
        current.push(x, y);
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L':
        x = next() + (rel ? x : 0);
        y = next() + (rel ? y : 0);
        current.push(x, y);
        break;
      case 'H':
        x = next() + (rel ? x : 0);
        current.push(x, y);
        break;
      case 'V':
        y = next() + (rel ? y : 0);
        current.push(x, y);
        break;
      case 'A': {
        const [rx, ry, rot, large, sweep] = [next(), next(), next(), next(), next()];
        const ex = next() + (rel ? x : 0);
        const ey = next() + (rel ? y : 0);
        current.push(...arcPoints(x, y, rx, ry, rot, !!large, !!sweep, ex, ey));
        [x, y] = [ex, ey];
        break;
      }
      case 'Z':
        close();
        [x, y] = [sx, sy];
        break;
      default:
        throw new Error(`unexpected path command ${cmd}`);
    }
  }
  close();
  return polygons;
}

/** The box around some polygons. */
export function polygonsBounds(polygons: readonly Polygon[]) {
  const xs = polygons.flatMap((p) => p.filter((_, i) => i % 2 === 0));
  const ys = polygons.flatMap((p) => p.filter((_, i) => i % 2 === 1));
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** The points of an SVG arc after its start (SVG 1.1, F.6.5), every few degrees. */
function arcPoints(x1: number, y1: number, rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, x2: number, y2: number): number[] {
  if (rotation !== 0 || rx !== ry) throw new Error('only circular arcs');
  let r = rx;
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  r = Math.max(r, Math.hypot(dx, dy));
  const sign = large === sweep ? -1 : 1;
  const k = sign * Math.sqrt(Math.max(0, (r * r - dx * dx - dy * dy) / (dx * dx + dy * dy)));
  const cx = k * dy + (x1 + x2) / 2;
  const cy = -k * dx + (y1 + y2) / 2;
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  let delta = Math.atan2(y2 - cy, x2 - cx) - a1;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  const steps = Math.max(2, Math.ceil(Math.abs(delta) / (Math.PI / 16)));
  const out: number[] = [];
  for (let s = 1; s <= steps; s++) {
    const a = a1 + (delta * s) / steps;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return out;
}

/** Fills path data (nonzero winding, as SVG and PDF fill it) into the raster, `scale` px a unit, sampling each pixel's centre. */
export function fillPath(raster: Raster, d: string, color: Rgb, scale: number, offset = { x: 0, y: 0 }) {
  const edges: [number, number, number, number, number][] = []; // x0, y0, x1, y1, winding (down: +1)
  for (const poly of polygonsOf(d)) {
    for (let j = 0; j < poly.length; j += 2) {
      const x0 = (poly[j] + offset.x) * scale;
      const y0 = (poly[j + 1] + offset.y) * scale;
      const x1 = (poly[(j + 2) % poly.length] + offset.x) * scale;
      const y1 = (poly[(j + 3) % poly.length] + offset.y) * scale;
      if (y0 !== y1) edges.push(y0 < y1 ? [x0, y0, x1, y1, 1] : [x1, y1, x0, y0, -1]);
    }
  }
  // Edges by the rows they cross, then a scanline per row of pixels.
  const rows: (typeof edges)[] = Array.from({ length: raster.height }, () => []);
  for (const e of edges) {
    const first = Math.max(0, Math.ceil(e[1] - 0.5));
    const last = Math.min(raster.height - 1, Math.ceil(e[3] - 0.5) - 1);
    for (let row = first; row <= last; row++) rows[row].push(e);
  }
  for (let row = 0; row < raster.height; row++) {
    const yc = row + 0.5;
    const hits = rows[row].map(([x0, y0, x1, y1, w]) => [x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0), w]).sort((a, b) => a[0] - b[0]);
    let winding = 0;
    for (let h = 0; h < hits.length; h++) {
      const before = winding;
      winding += hits[h][1];
      if (before === 0 && winding !== 0) {
        let end = h + 1;
        let w = winding;
        while (end < hits.length && (w += hits[end][1]) !== 0) end++;
        const from = Math.max(0, Math.ceil(hits[h][0] - 0.5));
        const to = Math.min(raster.width - 1, Math.ceil((hits[end]?.[0] ?? raster.width) - 0.5) - 1);
        for (let px = from; px <= to; px++) raster.data.set([...color, 255], (row * raster.width + px) * 4);
        winding = 0;
        h = end;
      }
    }
  }
}

/** #rrggbb as [r, g, b]. */
export const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function fillRect(raster: Raster, x: number, y: number, w: number, h: number, color: Rgb) {
  for (let py = Math.max(0, Math.round(y)); py < Math.min(raster.height, Math.round(y + h)); py++) {
    for (let px = Math.max(0, Math.round(x)); px < Math.min(raster.width, Math.round(x + w)); px++) raster.data.set([...color, 255], (py * raster.width + px) * 4);
  }
}

export interface Drawn {
  units: number;
  dots: string;
  eyes: string;
  logo: { x: number; y: number; w: number; h: number } | null;
}

/**
 * A QR drawing (qrshape.qrDrawing) as the page prints it: `scale` px a
 * module, the paper white under a transparent background (null). A logo is
 * the worst one for a reader: noise of dark, light and colored specks. A
 * caption is a row of glyph-like bars under the code, in its color.
 */
export function rasterizeQr(drawing: Drawn, { scale = 6, color = '#000000', background = '#ffffff' as string | null, caption = false, band = 0.16 } = {}): Raster {
  const side = drawing.units * scale;
  const height = caption ? Math.round(side * (1 + band)) : side;
  const out = blank(side, height);
  if (background) fillRect(out, 0, 0, side, height, rgb(background));
  fillPath(out, drawing.dots, rgb(color), scale);
  fillPath(out, drawing.eyes, rgb(color), scale);
  if (drawing.logo) {
    const { x, y, w, h } = drawing.logo;
    const speck = Math.max(1, Math.round(scale / 2));
    const specks: Rgb[] = [
      [0, 0, 0],
      [255, 255, 255],
      [200, 30, 30],
      [30, 30, 200],
    ];
    let seed = 7;
    for (let py = Math.round(y * scale); py < Math.round((y + h) * scale); py += speck) {
      for (let px = Math.round(x * scale); px < Math.round((x + w) * scale); px += speck) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        fillRect(out, px, py, speck, speck, specks[seed % specks.length]);
      }
    }
  }
  if (caption) {
    const top = side + (height - side) * 0.25;
    for (let x = side * 0.1; x < side * 0.9; x += scale * 2) fillRect(out, x, top, scale * 1.2, (height - side) * 0.5, rgb(color));
  }
  return out;
}

/**
 * The text jsQR reads in the raster, or null. Only dark on light, as most
 * phones read (`invert`: also light on dark).
 */
export function decode({ data, width, height }: Raster, { invert = false } = {}): string | null {
  const found = jsQR(data, width, height, { inversionAttempts: invert ? 'attemptBoth' : 'dontInvert' });
  return found ? found.data : null;
}
