// Length units for showing and typing lengths. The document is always in mm:
// this only converts, formats and reads what was typed. No DOM, no interface
// texts.

export const UNITS = ['mm', 'cm', 'in'];

const MM_PER = { mm: 1, cm: 10, in: 25.4 };

// Most decimals shown: 0.1 mm; 0.01 cm (0.1 mm); 0.001 in (~0.025 mm).
const DECIMALS = { mm: 1, cm: 2, in: 3 };

export const isUnit = (unit) => Object.hasOwn(MM_PER, unit);

// An unknown unit is a programming error, not something typed.
function checked(unit) {
  if (!isUnit(unit)) throw new RangeError(`unknown unit: ${unit}`);
  return unit;
}

const mmPer = (unit) => MM_PER[checked(unit)];

export const toMm = (value, unit) => value * mmPer(unit);

export const fromMm = (mm, unit) => mm / mmPer(unit);

/** Most decimals `unit` is shown with (mm 1, cm 2, in 3). */
export const decimalsFor = (unit) => DECIMALS[checked(unit)];

/** The unit's symbol: 'mm', 'cm' or 'in'. */
export const unitLabel = (unit) => checked(unit);

// Rounds to `decimals` decimals, halves away from zero (as Intl does).
// `toPrecision` absorbs the binary error: 1.005 × 100 gives 100.4999…
function roundTo(value, decimals) {
  const f = 10 ** decimals;
  const scaled = Number((Math.abs(value) * f).toPrecision(15));
  if (!Number.isFinite(scaled)) return value;
  return (Math.sign(value) * Math.round(scaled)) / f || 0; // || 0: never -0
}

const formats = new Map();

function numberFormat(locale, decimals) {
  const key = `${locale}|${decimals}`;
  let format = formats.get(key);
  if (!format) {
    // No thousands separator and Latin digits: parseLength has to be able to
    // read back what this writes.
    format = new Intl.NumberFormat(locale, {
      maximumFractionDigits: decimals,
      useGrouping: false,
      numberingSystem: 'latn',
    });
    formats.set(key, format);
  }
  return format;
}

/**
 * A number as a field shows it: up to `decimals` decimals (1 by default),
 * without trailing zeros, with the decimal separator of `locale` («147,6» in
 * Spanish and French, «147.6» in English, Chinese and Hindi), always digits
 * 0–9 and no thousands grouping, so parseDecimal reads it back. A value that
 * isn't finite gives ''.
 */
export function formatDecimal(value, { locale = 'es', decimals = 1 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return numberFormat(locale, decimals).format(roundTo(value, decimals));
}

/**
 * A length in mm shown in `unit`: «10,5 mm», «2,54 cm», «4 in». Up to 1
 * decimal in mm, 2 in cm and 3 in in, without trailing zeros; the decimal
 * separator follows `locale`; always digits 0–9 and no thousands grouping (so
 * parseLength reads it back). `withUnit` adds the symbol after a no-break
 * space (U+00A0). A value that isn't finite gives ''.
 */
export function formatLength(mm, unit, { locale = 'es', withUnit = true } = {}) {
  const text = typeof mm === 'number' ? formatDecimal(fromMm(mm, unit), { locale, decimals: decimalsFor(unit) }) : '';
  if (!text) return '';
  return withUnit ? `${text}\u00a0${unit}` : text;
}

// Accepted suffixes, lowercase. For inches also the typographic quotes a phone
// keyboard types («4”»), and the units' names in each interface language
// (src/copy): people type them as they say them.
const SUFFIXES = [
  ['mm', 'mm'],
  ['cm', 'cm'],
  ['inches', 'in'],
  ['inch', 'in'],
  ['in', 'in'],
  ['pulgadas', 'in'],
  ['pulgada', 'in'],
  ['pulg', 'in'],
  ['pouces', 'in'],
  ['pouce', 'in'],
  ['po', 'in'],
  ['毫米', 'mm'],
  ['厘米', 'cm'],
  ['公分', 'cm'],
  ['英寸', 'in'],
  ['मिमी', 'mm'],
  ['सेमी', 'cm'],
  ['इंच', 'in'],
  ["''", 'in'],
  ['"', 'in'],
  ['″', 'in'],
  ['”', 'in'],
  ['“', 'in'],
];

// Invisible text direction marks (some languages put them before the sign).
const BIDI_MARKS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

// What other keyboards type instead of ASCII numbers and signs: the full-width
// ones of a Chinese input method (and «。» for the point) and the Devanagari
// numerals of a Hindi keyboard.
const WIDE = /[\uff0b\uff0c\uff0d\uff0e\uff0f\uff10-\uff19\u3002\u0966-\u096f]/g;
const narrow = (c) => {
  if (c === '\u3002') return '.';
  const code = c.charCodeAt(0);
  return code >= 0x0966 && code <= 0x096f ? String(code - 0x0966) : String.fromCharCode(code - 0xfee0);
};

/** What was typed, ready to read: no direction marks, lowercase, ASCII numbers and signs, single spaces. */
const tidy = (text) =>
  text
    .replace(BIDI_MARKS, '')
    .replace(WIDE, narrow)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/−/g, '-');
const DECIMAL = /^(\d+(?:[.,]\d*)?|[.,]\d+)$/;
const FRACTION = /^(?:(\d+)(?:\s+|-))?(\d+)\/(\d+)$/;

// Whatever the interface language, both the comma and the point are decimal
// separators, and full-width or Devanagari numerals read as ASCII ones.
/**
 * A typed length in mm, or null when it can't be read. Accepts a decimal
 * comma or point («10,5», «10.5», «,5»), spaces around, a sign (+, - or −:
 * whether a negative is valid is the caller's call) and an optional unit
 * suffix that overrides `unit`: «2.5 cm», «4 in», «4"», «4”», «4 pulg». In
 * inches also simple fractions: «1/2», «1 1/2», «1-1/2 in». Rejects thousands
 * separators, exponents, fractions in mm or cm, and garbage. A number (not
 * text) is taken as a value in `unit`.
 */
export function parseLength(text, unit) {
  const scale = mmPer(unit);
  if (typeof text === 'number') return Number.isFinite(text) ? text * scale || 0 : null;
  if (typeof text !== 'string') return null;
  let s = tidy(text);

  let target = unit;
  for (const [suffix, u] of SUFFIXES) {
    if (s.endsWith(suffix)) {
      // «in» at the end of another word isn't the unit («10 min»).
      const before = s.slice(0, -suffix.length);
      if (/[a-z]$/.test(before)) return null;
      s = before.trimEnd();
      target = u;
      break;
    }
  }

  let sign = 1;
  if (s[0] === '-' || s[0] === '+') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1).trimStart();
  }

  let value = null;
  if (DECIMAL.test(s)) value = Number(s.replace(',', '.'));
  else if (target === 'in') {
    const m = FRACTION.exec(s);
    if (m && Number(m[3]) > 0) value = Number(m[1] ?? 0) + Number(m[2]) / Number(m[3]);
  }
  if (value === null || !Number.isFinite(value)) return null;
  const mm = sign * value * MM_PER[target];
  return Number.isFinite(mm) ? mm || 0 : null;
}

/**
 * A typed number, or null when it can't be read: a decimal comma or point
 * whatever the interface language («147,6», «147.6», «,5»), spaces around, a
 * sign (+, - or −), full-width or Devanagari numerals. Rejects thousands
 * separators («1.000,5»), exponents and anything else. The plain-number
 * counterpart of parseLength, which reads a length the same way.
 */
export function parseDecimal(text) {
  if (typeof text !== 'string') return null;
  let s = tidy(text);
  let sign = 1;
  if (s[0] === '-' || s[0] === '+') {
    if (s[0] === '-') sign = -1;
    s = s.slice(1).trimStart();
  }
  if (!DECIMAL.test(s)) return null;
  const value = sign * Number(s.replace(',', '.'));
  return Number.isFinite(value) ? value || 0 : null;
}

// The beginning of some suffix of SUFFIXES («p», «pul», «i», «c»…), or nothing.
const isSuffixStart = (tail) => !tail || SUFFIXES.some(([suffix]) => suffix.startsWith(tail));

/**
 * Could `text` be the beginning of a length parseLength would read? So what
 * is still being typed isn't marked as an error: «2,», «1/», «1 1/», «-»,
 * «10 c», «4 pul». What already reads is true too; «abc», «1..2» or «10 kg»
 * are false.
 */
export function isPartialLength(text, unit) {
  if (typeof text !== 'string') return false;
  if (parseLength(text, unit) !== null) return true;
  const s = tidy(text);
  // Sign, number (with a comma or a point), a half-typed fraction and a half-typed unit.
  const m = /^[+-]?\s?(\d*(?:[.,]\d*)?)(?:(?:\s+|-)\d*(?:\/\d*)?|\/\d*)?\s?([\p{L}\p{M}'"″”“]*)$/u.exec(s);
  return !!m && isSuffixStart(m[2]);
}

const STEPS = {
  mm: { fine: 0.1, normal: 1, coarse: 10 },
  cm: { fine: 0.01, normal: 0.1, coarse: 1 },
  in: { fine: 1 / 64, normal: 1 / 16, coarse: 1 / 2 },
};

/**
 * The step of the keyboard and the spinners in `unit`. Gives {value, mm}:
 * `value` in the unit (for an input's `step` attribute) and the same in `mm`
 * (to move or resize). mm: 0.1 / 1 / 10; cm: 0.01 / 0.1 / 1; in: 1/64 / 1/16
 * / 1/2.
 */
export function stepFor(unit, size = 'normal') {
  const steps = STEPS[checked(unit)];
  if (!Object.hasOwn(steps, size)) throw new RangeError(`unknown step: ${size}`);
  return { value: steps[size], mm: steps[size] * MM_PER[unit] };
}

// Inch steps as fractions, as people know them.
const STEP_FRACTIONS = { in: { fine: '1/64', normal: '1/16', coarse: '1/2' } };

/**
 * The step of `stepFor(unit, size)` to show, the number alone: «0,1», «1»,
 * «10» in mm; «0,01», «0,1», «1» in cm; «1/64», «1/16», «1/2» in in.
 */
export function stepLabel(unit, size = 'normal', { locale = 'es' } = {}) {
  const { value } = stepFor(unit, size);
  return STEP_FRACTIONS[unit]?.[size] ?? numberFormat(locale, decimalsFor(unit)).format(value);
}

const GRIDS = {
  mm: [
    [1, 1, null],
    [5, 5, null],
    [10, 10, null],
  ],
  cm: [
    [1, 0.1, null],
    [5, 0.5, null],
    [10, 1, null],
  ],
  in: [
    [3.175, 1 / 8, '1/8'],
    [6.35, 1 / 4, '1/4'],
    [12.7, 1 / 2, '1/2'],
  ],
};

/**
 * Suggested grid sizes for `unit`, smallest first: [{mm, value, label}]. `mm`
 * is the step in mm (what is stored), `value` the same step in the unit and
 * `label` the number alone to show (per `locale`; in inches, the fraction):
 * mm 1/5/10, cm 0.1/0.5/1, in 1/8, 1/4, 1/2.
 */
export function gridPresets(unit, { locale = 'es' } = {}) {
  return GRIDS[checked(unit)].map(([mm, value, fraction]) => ({
    mm,
    value,
    label: fraction ?? formatLength(mm, unit, { locale, withUnit: false }),
  }));
}
