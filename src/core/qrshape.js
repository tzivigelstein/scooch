// How a QR code piece is drawn: its modules and its three finder «eyes» as
// SVG path data, the room for a logo and the band of its caption. Pure module
// (no DOM): the screen (an SVG) and the PDF (pdf-lib's drawSvgPath) draw the
// same paths, so they match at any size. What a QR code is made of is the
// document's (projectdoc.js); cleanQr reads its style.
//
// Units are modules, with the origin at the top left of the code's square,
// which includes the quiet zone (QUIET_ZONE modules of background on every
// side, without which phones don't find the code). A caption goes in a band
// under that square (CAPTION_BAND of its side).
//
// A logo takes the middle of the code: the modules under it (and half a
// module around it) aren't drawn, so the code reads only thanks to error
// correction. With a logo the level is H and the version is the smallest in
// which those modules spoil, in every block, at most LOGO_BUDGET of what the
// block can repair (codewordLayout counts them exactly): the rest is left for
// a smudge, a fold or a poor print. Its size is fixed (LOGO_SIDE), so the
// person can't make it big enough to break the code.

import { isHexColor } from './cutmarks.js';
import { codewordLayout, encodeQr, fitsQr, MAX_VERSION } from './qrcode.js';

/** Shapes of the modules. */
export const QR_DOTS = Object.freeze(['square', 'rounded', 'circle']);
/** Shapes of the three finder patterns. */
export const QR_EYES = Object.freeze(['square', 'rounded']);
/** The most characters (UTF-16 code units, as a field's maxlength counts them) a caption has. */
export const CAPTION_MAX = 40;

/** Modules of background around the code (the standard asks for 4). */
export const QUIET_ZONE = 4;
/** The logo's longer side, as a share of the code without its quiet zone. */
export const LOGO_SIDE = 0.24;
/** Clear space around the logo, in modules. */
const LOGO_PAD = 0.5;
/** The share of what each block can repair that the logo may spoil. */
const LOGO_BUDGET = 0.6;
/** The caption's band under the code, as a share of the code's side. */
export const CAPTION_BAND = 0.16;
/** The level without a logo: about 15 % of the codewords can be repaired (more when the version has room). */
const LEVEL = 'M';
/** The diameter of a module drawn as a circle. */
const DOT = 0.9;
/** The corners' radius of the rounded eyes: the ring outside, its hole and the centre. */
const EYE_RADII = [2, 1, 1];

/**
 * A QR code's fields (a document's, an undo step's) as they are drawn: its
 * text cut to what fits (fitText) and a style it can't read with its default
 * (black on white, square, no caption). The document keeps the rest
 * (projectdoc.js).
 */
export function cleanQr(qr) {
  return {
    ...qr,
    text: fitText(String(qr.text)),
    color: isHexColor(qr.color) ? qr.color.toLowerCase() : '#000000',
    background: qr.background === null ? null : isHexColor(qr.background) ? qr.background.toLowerCase() : '#ffffff',
    dots: QR_DOTS.includes(qr.dots) ? qr.dots : 'square',
    eyes: QR_EYES.includes(qr.eyes) ? qr.eyes : 'square',
    caption: typeof qr.caption === 'string' ? qr.caption.slice(0, CAPTION_MAX) : '',
  };
}

/**
 * The longest start of `text` that fits a QR code at level H (what a logo
 * needs), cut between characters: the content field never takes more.
 */
export function fitText(text) {
  if (fitsQr(text, 'H')) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fitsQr(chars.slice(0, mid).join(''), 'H')) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join('');
}

// ---------- Numbers in path data ----------

const num = (n) => {
  const s = String(Math.round(n * 1000) / 1000);
  return s.replace(/^(-?)0\./, '$1.');
};

// ---------- The modules ----------

/** The finder patterns' 7 × 7 squares, by their top left module. */
const finders = (size) => [
  [0, 0],
  [size - 7, 0],
  [0, size - 7],
];

const inFinder = (size, x, y) => finders(size).some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);

/** A module (its top left at x, y) with each corner's radius: top left, top right, bottom right, bottom left. Clockwise. */
function cell(x, y, [tl, tr, br, bl]) {
  let d = `M${num(x + tl)} ${num(y)}`;
  if (1 - tl - tr) d += `h${num(1 - tl - tr)}`;
  if (tr) d += `a${num(tr)} ${num(tr)} 0 0 1 ${num(tr)} ${num(tr)}`;
  if (1 - tr - br) d += `v${num(1 - tr - br)}`;
  if (br) d += `a${num(br)} ${num(br)} 0 0 1 ${num(-br)} ${num(br)}`;
  if (1 - br - bl) d += `h${num(-(1 - br - bl))}`;
  if (bl) d += `a${num(bl)} ${num(bl)} 0 0 1 ${num(-bl)} ${num(-bl)}`;
  if (1 - bl - tl) d += `v${num(-(1 - bl - tl))}`;
  if (tl) d += `a${num(tl)} ${num(tl)} 0 0 1 ${num(tl)} ${num(-tl)}`;
  return `${d}z`;
}

/**
 * The path of the dark modules (finders apart, and none in `cleared`), in
 * units: squares joined along each row, rounded modules whose outer corners
 * are round where both neighbours are light, or circles.
 */
function dotsPath({ size, dark }, dots, cleared) {
  const on = (x, y) => x >= 0 && y >= 0 && x < size && y < size && dark[y * size + x] === 1 && !inFinder(size, x, y) && !(cleared && x >= cleared.x0 && x <= cleared.x1 && y >= cleared.y0 && y <= cleared.y1);
  const parts = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!on(x, y)) continue;
      const ux = x + QUIET_ZONE;
      const uy = y + QUIET_ZONE;
      if (dots === 'square') {
        let end = x;
        while (on(end + 1, y)) end++;
        parts.push(`M${ux} ${uy}h${end - x + 1}v1h${-(end - x + 1)}z`);
        x = end;
      } else if (dots === 'circle') {
        const r = DOT / 2;
        parts.push(`M${num(ux + 0.5 - r)} ${num(uy + 0.5)}a${num(r)} ${num(r)} 0 1 1 ${num(DOT)} 0a${num(r)} ${num(r)} 0 1 1 ${num(-DOT)} 0z`);
      } else {
        const up = on(x, y - 1);
        const down = on(x, y + 1);
        const left = on(x - 1, y);
        const right = on(x + 1, y);
        const r = (a, b) => (a || b ? 0 : 0.5);
        parts.push(cell(ux, uy, [r(up, left), r(up, right), r(down, right), r(down, left)]));
      }
    }
  }
  return parts.join('');
}

// ---------- The eyes ----------

/** A rectangle with round corners of radius r; clockwise, or counterclockwise to cut a hole. */
function roundRect(x, y, w, h, r, clockwise = true) {
  if (!r) return clockwise ? `M${x} ${y}h${w}v${h}h${-w}z` : `M${x} ${y}v${h}h${w}v${-h}z`;
  const a = (dx, dy) => `a${num(r)} ${num(r)} 0 0 ${clockwise ? 1 : 0} ${num(dx)} ${num(dy)}`;
  if (clockwise) return `M${num(x + r)} ${y}h${num(w - 2 * r)}${a(r, r)}v${num(h - 2 * r)}${a(-r, r)}h${num(-(w - 2 * r))}${a(-r, -r)}v${num(-(h - 2 * r))}${a(r, -r)}z`;
  return `M${num(x + r)} ${y}${a(-r, r)}v${num(h - 2 * r)}${a(r, r)}h${num(w - 2 * r)}${a(r, -r)}v${num(-(h - 2 * r))}${a(-r, -r)}z`;
}

/** The three finder patterns: a ring 7 modules wide (its hole cut by winding the other way) and a 3 × 3 centre. */
function eyesPath(size, eyes) {
  const [outer, hole, centre] = eyes === 'rounded' ? EYE_RADII : [0, 0, 0];
  return finders(size)
    .map(([fx, fy]) => {
      const x = fx + QUIET_ZONE;
      const y = fy + QUIET_ZONE;
      return roundRect(x, y, 7, 7, outer) + roundRect(x + 1, y + 1, 5, 5, hole, false) + roundRect(x + 2, y + 2, 3, 3, centre);
    })
    .join('');
}

// ---------- The logo ----------

/**
 * Where a logo of proportion `aspect` (width / height) goes in a code of
 * `size` modules: its box, centred, in units, and the modules it clears (its
 * box and LOGO_PAD around it, in whole modules: x0…x1, y0…y1).
 */
export function logoPlace(size, aspect) {
  const side = LOGO_SIDE * size;
  const w = aspect >= 1 ? side : side * aspect;
  const h = aspect >= 1 ? side / aspect : side;
  const cx = size / 2;
  const cleared = {
    x0: Math.floor(cx - w / 2 - LOGO_PAD),
    x1: Math.ceil(cx + w / 2 + LOGO_PAD) - 1,
    y0: Math.floor(cx - h / 2 - LOGO_PAD),
    y1: Math.ceil(cx + h / 2 + LOGO_PAD) - 1,
  };
  return { box: { x: cx - w / 2 + QUIET_ZONE, y: cx - h / 2 + QUIET_ZONE, w, h }, cleared };
}

/**
 * Whether clearing those modules leaves the code readable with room to spare:
 * no function pattern but the alignment ones (the finders, timing and the
 * format and version information are all within 9 modules of an edge), and
 * in each block at most LOGO_BUDGET of the codewords it can repair spoiled.
 */
export function logoFits(version, level, cleared) {
  const { size, codeword, blockOf, blocks, ecc } = codewordLayout(version, level);
  if (cleared.x0 < 9 || cleared.y0 < 9 || cleared.x1 > size - 10 || cleared.y1 > size - 10) return false;
  const spoiled = new Set();
  for (let y = cleared.y0; y <= cleared.y1; y++) {
    for (let x = cleared.x0; x <= cleared.x1; x++) {
      const k = codeword[y * size + x];
      if (k >= 0) spoiled.add(k);
    }
  }
  const perBlock = new Array(blocks).fill(0);
  for (const k of spoiled) perBlock[blockOf[k]]++;
  const budget = Math.floor((ecc / 2) * LOGO_BUDGET);
  return perBlock.every((n) => n <= budget);
}

// ---------- The drawing ----------

/**
 * How to draw the QR code of `text`: {version, level, size, units (the
 * square's side, quiet zone included), dots and eyes (path data in units),
 * logo (its box in units, or null)}. `dots` and `eyes`: their shapes;
 * `logo`: the logo's proportion (width / height), or null without one. Null
 * when the text doesn't fit (fitText cuts it so it always does).
 */
export function qrDrawing(text, { dots = 'square', eyes = 'square', logo = null } = {}) {
  let code = encodeQr(text, { level: logo === null ? LEVEL : 'H' });
  if (!code) return null;
  let place = null;
  if (logo !== null) {
    const aspect = Number.isFinite(logo) && logo > 0 ? logo : 1;
    for (;;) {
      place = logoPlace(code.size, aspect);
      if (logoFits(code.version, code.level, place.cleared)) break;
      // No version is safe (a logo far wider than tall, in a huge code): no logo.
      if (code.version >= MAX_VERSION) {
        place = null;
        break;
      }
      code = encodeQr(text, { level: 'H', minVersion: code.version + 1 });
    }
  }
  return {
    version: code.version,
    level: code.level,
    size: code.size,
    units: code.size + 2 * QUIET_ZONE,
    dots: dotsPath(code, dots, place?.cleared ?? null),
    eyes: eyesPath(code.size, eyes),
    logo: place?.box ?? null,
  };
}

// ---------- Colors ----------

/** Contrast between the code and its background (or the white paper) under which phones may not read it (WCAG's ratio). */
export const MIN_CONTRAST = 4;

const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Relative luminance of a #rrggbb color (0 black to 1 white). */
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => channel(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two #rrggbb colors (1 to 21). */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * What about the colors may keep phones from reading the code: 'contrast'
 * (too little against the background, or the paper when it is transparent),
 * 'inverted' (lighter than its background: many readers only look for dark
 * codes) or null.
 */
export function colorIssue(color, background) {
  const under = background ?? '#ffffff';
  if (contrastRatio(color, under) < MIN_CONTRAST) return 'contrast';
  return luminance(color) > luminance(under) ? 'inverted' : null;
}
