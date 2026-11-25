// QR codes (ISO/IEC 18004, model 2): from a text to its matrix of modules.
// Pure module (no DOM). The text goes in one segment: numeric or alphanumeric
// when every character allows it (denser), otherwise bytes of its UTF-8,
// which phones read as UTF-8 without an ECI header. The steps are the
// standard's: the smallest version the data fits in, Reed–Solomon error
// correction per block, the blocks interleaved, the codewords laid in the
// zigzag around the function patterns, and the mask with the lowest penalty.
//
// codewordLayout says which codeword (and so which block) each module carries
// in a version: what a logo over the code's middle destroys can be counted
// exactly (qrshape.js keeps it within what error correction repairs).

/** Error correction levels, from the least to the most redundant: about 7, 15, 25 and 30 % of the codewords. */
export const QR_LEVELS = Object.freeze(['L', 'M', 'Q', 'H']);

/** The bits that name each level in the format information. */
const LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

// Error correction codewords per block and blocks, by level and version (index 0 unused).
const ECC_PER_BLOCK = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const BLOCKS = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const NUMERIC_RE = /^[0-9]*$/;
const ALPHANUMERIC_RE = /^[0-9A-Z $%*+\-./:]*$/;

/** Modules on a side of version `v`: 21 to 177. */
export const sizeOf = (v) => v * 4 + 17;

// ---------- The data ----------

// Mode indicator and the character count's width in versions 1–9, 10–26 and 27–40.
const MODES = {
  numeric: { indicator: 1, count: [10, 12, 14] },
  alphanumeric: { indicator: 2, count: [9, 11, 13] },
  byte: { indicator: 4, count: [8, 16, 16] },
};

const pushBits = (bits, value, length) => {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
};

/** The text as one segment: its mode, character count and data bits. */
function segment(text) {
  const bits = [];
  if (NUMERIC_RE.test(text)) {
    for (let i = 0; i < text.length; i += 3) {
      const group = text.slice(i, i + 3);
      pushBits(bits, Number(group), group.length * 3 + 1);
    }
    return { mode: MODES.numeric, count: text.length, bits };
  }
  if (ALPHANUMERIC_RE.test(text)) {
    for (let i = 0; i + 1 < text.length; i += 2) pushBits(bits, ALPHANUMERIC.indexOf(text[i]) * 45 + ALPHANUMERIC.indexOf(text[i + 1]), 11);
    if (text.length % 2) pushBits(bits, ALPHANUMERIC.indexOf(text.at(-1)), 6);
    return { mode: MODES.alphanumeric, count: text.length, bits };
  }
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) pushBits(bits, byte, 8);
  return { mode: MODES.byte, count: bytes.length, bits };
}

const countWidth = (mode, v) => mode.count[v < 10 ? 0 : v < 27 ? 1 : 2];

/** Bits the segment takes in version `v` (Infinity when its count doesn't fit its field). */
function segmentBits(seg, v) {
  const width = countWidth(seg.mode, v);
  return seg.count < 2 ** width ? 4 + width + seg.bits.length : Infinity;
}

/** Modules of version `v` left for codewords once the function patterns are drawn. */
function rawDataModules(v) {
  let result = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const align = Math.floor(v / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (v >= 7) result -= 36;
  }
  return result;
}

/** Data codewords of version `v` at `level` (the rest of its codewords correct errors). */
export const dataCodewords = (v, level) => Math.floor(rawDataModules(v) / 8) - ECC_PER_BLOCK[level][v] * BLOCKS[level][v];

/** Whether `text` fits a QR code at `level` (in version 40 at the most). */
export const fitsQr = (text, level = 'M') => versionFor(segment(text), level, MIN_VERSION) !== null;

function versionFor(seg, level, minVersion) {
  for (let v = Math.max(MIN_VERSION, minVersion); v <= MAX_VERSION; v++) {
    if (segmentBits(seg, v) <= dataCodewords(v, level) * 8) return v;
  }
  return null;
}

/** The data codewords: the segment, the terminator, padding to a byte and the pad bytes 0xEC, 0x11. */
function dataBytes(seg, v, level) {
  const capacity = dataCodewords(v, level) * 8;
  const bits = [];
  pushBits(bits, seg.mode.indicator, 4);
  pushBits(bits, seg.count, countWidth(seg.mode, v));
  bits.push(...seg.bits);
  pushBits(bits, 0, Math.min(4, capacity - bits.length));
  pushBits(bits, 0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) pushBits(bits, pad, 8);
  const bytes = new Uint8Array(bits.length / 8);
  bits.forEach((bit, i) => (bytes[i >>> 3] |= bit << (7 - (i & 7))));
  return bytes;
}

// ---------- Reed–Solomon over GF(256), polynomial 0x11D ----------

function multiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function divisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = multiply(root, 0x02);
  }
  return result;
}

function remainder(data, div) {
  const result = new Uint8Array(div.length);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < div.length; i++) result[i] ^= multiply(div[i], factor);
  }
  return result;
}

/**
 * The blocks of version `v` at `level`: how many short ones (the long ones
 * carry one data codeword more), their length and the codewords that correct.
 */
function blockShape(v, level) {
  const blocks = BLOCKS[level][v];
  const ecc = ECC_PER_BLOCK[level][v];
  const raw = Math.floor(rawDataModules(v) / 8);
  return { blocks, ecc, short: blocks - (raw % blocks), shortLength: Math.floor(raw / blocks) };
}

/**
 * The final sequence of codewords: each block's data and its error correction,
 * interleaved. `blockOf[i]`: the block the i-th codeword of the sequence is of.
 */
function interleave(data, v, level) {
  const { blocks, ecc, short, shortLength } = blockShape(v, level);
  const div = divisor(ecc);
  const rows = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const length = shortLength - ecc + (i < short ? 0 : 1);
    const dat = data.subarray(k, k + length);
    k += length;
    rows.push({ data: dat, ecc: remainder(dat, div) });
  }
  const out = [];
  const blockOf = [];
  for (let i = 0; i < shortLength - ecc + 1; i++) {
    rows.forEach((row, b) => {
      if (i < row.data.length) {
        out.push(row.data[i]);
        blockOf.push(b);
      }
    });
  }
  for (let i = 0; i < ecc; i++) {
    rows.forEach((row, b) => {
      out.push(row.ecc[i]);
      blockOf.push(b);
    });
  }
  return { codewords: Uint8Array.from(out), blockOf: Uint8Array.from(blockOf) };
}

/** Only the block of each codeword in the sequence (interleave without the data). */
function blockOrder(v, level) {
  const { blocks, ecc, short, shortLength } = blockShape(v, level);
  const order = [];
  for (let i = 0; i < shortLength - ecc + 1; i++) {
    for (let b = 0; b < blocks; b++) if (i < shortLength - ecc + (b < short ? 0 : 1)) order.push(b);
  }
  for (let i = 0; i < ecc; i++) for (let b = 0; b < blocks; b++) order.push(b);
  return Uint8Array.from(order);
}

// ---------- The matrix ----------

/** Centres of the alignment patterns along a side of version `v`. */
export function alignmentPositions(v) {
  if (v === 1) return [];
  const count = Math.floor(v / 7) + 2;
  const step = Math.floor((v * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const result = [6];
  for (let pos = sizeOf(v) - 7; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** A grid of `size` × `size` modules: dark ones and function ones (finders, timing, alignment, format and version information). */
function grid(v) {
  const size = sizeOf(v);
  const dark = new Uint8Array(size * size);
  const reserved = new Uint8Array(size * size);
  const set = (x, y, on) => {
    dark[y * size + x] = on ? 1 : 0;
    reserved[y * size + x] = 1;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const align = alignmentPositions(v);
  const last = align.length - 1;
  align.forEach((cy, i) =>
    align.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    })
  );
  // Format information (written for real once the mask is chosen) and the dark module.
  formatBits(set, size, 'L', 0);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (v << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const on = (bits >>> i) & 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, on);
      set(b, a, on);
    }
  }
  return { size, dark, reserved };
}

function formatBits(set, size, level, mask) {
  const data = (LEVEL_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i) => (bits >>> i) & 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, 1);
}

/** The module each bit of the codewords goes to, in order: the zigzag from the bottom right, two columns at a time. */
function placement(size, reserved) {
  const order = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const i = y * size + right - j;
        if (!reserved[i]) order.push(i);
      }
    }
  }
  return order;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(dark, reserved, size, mask) {
  const test = MASKS[mask];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!reserved[y * size + x] && test(x, y)) dark[y * size + x] ^= 1;
}

// The penalty rules: runs of 5 or more, 2 × 2 blocks, finder-like patterns and the balance of dark and light.
const N1 = 3;
const N2 = 3;
const N3 = 40;
const N4 = 10;

function penalty(dark, size) {
  let result = 0;
  const line = (at) => {
    let color = 0;
    let run = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    const add = (length) => {
      if (history[0] === 0) length += size; // the light border before the first run
      history.pop();
      history.unshift(length);
    };
    const patterns = () => {
      const n = history[1];
      const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
      return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
    };
    for (let i = 0; i < size; i++) {
      if (at(i) === color) {
        run++;
        if (run === 5) result += N1;
        else if (run > 5) result++;
      } else {
        add(run);
        if (!color) result += patterns() * N3;
        color = at(i);
        run = 1;
      }
    }
    if (color) {
      add(run);
      run = 0;
    }
    add(run + size);
    result += patterns() * N3;
  };
  for (let y = 0; y < size; y++) line((x) => dark[y * size + x]);
  for (let x = 0; x < size; x++) line((y) => dark[y * size + x]);
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = dark[y * size + x];
      if (c === dark[y * size + x + 1] && c === dark[(y + 1) * size + x] && c === dark[(y + 1) * size + x + 1]) result += N2;
    }
  }
  const total = size * size;
  const darkCount = dark.reduce((sum, v) => sum + v, 0);
  result += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * N4;
  return result;
}

/**
 * The QR code of `text`: {version, size, level, mask, dark, reserved}, where
 * `dark` and `reserved` are size × size flags in rows (dark modules; function
 * modules), without the quiet zone. `level`: the least error correction
 * wanted; with `boost` (default) it rises while the data still fits the same
 * version. `minVersion`: no smaller version (a logo needs room). `mask`: that
 * mask (0–7) instead of the one with the lowest penalty. Null when the text
 * doesn't fit version 40.
 */
export function encodeQr(text, { level = 'M', minVersion = MIN_VERSION, boost = true, mask: forced = null } = {}) {
  if (!QR_LEVELS.includes(level)) throw new RangeError(`unknown level: ${level}`);
  const seg = segment(String(text));
  const v = versionFor(seg, level, minVersion);
  if (v === null) return null;
  let chosen = level;
  if (boost) {
    for (const higher of QR_LEVELS.slice(QR_LEVELS.indexOf(level) + 1)) if (segmentBits(seg, v) <= dataCodewords(v, higher) * 8) chosen = higher;
  }
  const { size, dark, reserved } = grid(v);
  const { codewords } = interleave(dataBytes(seg, v, chosen), v, chosen);
  const order = placement(size, reserved);
  // Remainder bits (the modules after the last codeword) stay light.
  for (let i = 0; i < codewords.length * 8; i++) dark[order[i]] = (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
  const set = (x, y, on) => {
    dark[y * size + x] = on ? 1 : 0;
  };
  let best = { mask: forced ?? 0, score: Infinity };
  for (let mask = 0; mask < 8 && forced === null; mask++) {
    applyMask(dark, reserved, size, mask);
    formatBits(set, size, chosen, mask);
    const score = penalty(dark, size);
    if (score < best.score) best = { mask, score };
    applyMask(dark, reserved, size, mask);
  }
  applyMask(dark, reserved, size, best.mask);
  formatBits(set, size, chosen, best.mask);
  return { version: v, size, level: chosen, mask: best.mask, dark, reserved };
}

/**
 * Where the codewords of version `v` at `level` are: `codeword[i]` is the
 * index (in the final sequence) of the codeword module i carries, −1 for
 * function modules and remainder bits, and `bit[i]` which of its bits (7 the
 * highest); `blockOf[k]` the block of codeword k; `ecc` the error correction
 * codewords of each block (a block repairs up to half as many codewords that
 * are wrong).
 */
export function codewordLayout(v, level) {
  const { size, reserved } = grid(v);
  const blockOf = blockOrder(v, level);
  const codeword = new Int16Array(size * size).fill(-1);
  const bit = new Int8Array(size * size).fill(-1);
  const order = placement(size, reserved);
  for (let i = 0; i < blockOf.length * 8; i++) {
    codeword[order[i]] = i >>> 3;
    bit[order[i]] = 7 - (i & 7);
  }
  return { size, codeword, bit, blockOf, blocks: BLOCKS[level][v], ecc: ECC_PER_BLOCK[level][v] };
}

/** Test-only: the interleaved codewords and their blocks for `text` (see interleave). */
export function codewordsOf(text, v, level) {
  const seg = segment(String(text));
  return interleave(dataBytes(seg, v, level), v, level);
}
