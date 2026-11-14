// Unidades de longitud para mostrar y cargar medidas. El modelo interno es
// siempre mm: acá solo se convierte, se formatea y se interpreta lo tipeado.
// Módulo puro (sin DOM) y sin textos de interfaz.

/** Unidades disponibles. */
export const UNITS = ['mm', 'cm', 'in'];

const MM_PER = { mm: 1, cm: 10, in: 25.4 };

// Decimales máximos al mostrar: 0,1 mm; 0,01 cm (0,1 mm); 0,001 in (~0,025 mm).
const DECIMALS = { mm: 1, cm: 2, in: 3 };

/** ¿Es una de las unidades de UNITS? */
export const isUnit = (unit) => Object.hasOwn(MM_PER, unit);

// La misma unidad, o un error si no es una de UNITS (es un error de programa).
function checked(unit) {
  if (!isUnit(unit)) throw new RangeError(`unidad desconocida: ${unit}`);
  return unit;
}

const mmPer = (unit) => MM_PER[checked(unit)];

/** Valor expresado en `unit` → mm. */
export const toMm = (value, unit) => value * mmPer(unit);

/** mm → valor expresado en `unit`. */
export const fromMm = (mm, unit) => mm / mmPer(unit);

/** Decimales máximos con que se muestra `unit` (mm 1, cm 2, in 3). */
export const decimalsFor = (unit) => DECIMALS[checked(unit)];

/** Símbolo de la unidad: 'mm', 'cm' o 'in'. */
export const unitLabel = (unit) => checked(unit);

// Redondeo a `decimals` decimales, con las mitades hacia afuera del cero (como
// Intl). `toPrecision` absorbe el error binario: 1,005 × 100 da 100,4999…
function roundTo(value, decimals) {
  const f = 10 ** decimals;
  const scaled = Number((Math.abs(value) * f).toPrecision(15));
  if (!Number.isFinite(scaled)) return value;
  return (Math.sign(value) * Math.round(scaled)) / f || 0; // || 0: nada de -0
}

const formats = new Map();

function numberFormat(locale, decimals) {
  const key = `${locale}|${decimals}`;
  let format = formats.get(key);
  if (!format) {
    // Sin separador de miles y con dígitos latinos: lo formateado tiene que
    // poder volver a leerse con parseLength.
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
 * Formatea una medida en mm para mostrarla en `unit`: «10,5 mm», «2,54 cm»,
 * «4 in». Hasta 1 decimal en mm, 2 en cm y 3 en in, sin ceros de relleno; el
 * separador decimal sigue a `locale`; siempre con dígitos 0–9 y sin agrupar
 * miles (así se puede volver a leer con parseLength). Con `withUnit` agrega
 * el símbolo separado por un espacio duro (U+00A0). Un valor no finito
 * devuelve ''.
 */
export function formatLength(mm, unit, { locale = 'es', withUnit = true } = {}) {
  const decimals = decimalsFor(unit);
  if (typeof mm !== 'number' || !Number.isFinite(mm)) return '';
  const text = numberFormat(locale, decimals).format(roundTo(fromMm(mm, unit), decimals));
  return withUnit ? `${text}\u00a0${unit}` : text;
}

// Sufijos aceptados (en minúsculas). Para pulgadas también las comillas
// tipográficas que pone el teclado del celular («4”»).
// The units' names in each interface language (src/copy) too: people type them as they say them.
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

// Marcas invisibles de dirección de texto (algunos idiomas las ponen antes del signo).
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
 * Lee una medida tipeada y la devuelve en mm, o null si no se entiende.
 * Acepta coma o punto decimal («10,5», «10.5», «,5»), espacios alrededor,
 * signo (+, - o −: si un negativo vale o no lo decide quien llama) y un sufijo
 * de unidad opcional que pisa a `unit`: «2.5 cm», «4 in», «4"», «4”», «4 pulg».
 * En pulgadas acepta además fracciones simples: «1/2», «1 1/2», «1-1/2 in».
 * Rechaza separadores de miles, exponentes, fracciones en mm o cm, y basura.
 * Un número (no texto) se toma como valor en `unit`.
 */
export function parseLength(text, unit) {
  const scale = mmPer(unit);
  if (typeof text === 'number') return Number.isFinite(text) ? text * scale || 0 : null;
  if (typeof text !== 'string') return null;
  let s = tidy(text);

  let target = unit;
  for (const [suffix, u] of SUFFIXES) {
    if (s.endsWith(suffix)) {
      // «in» al final de otra palabra no es la unidad (p. ej. «10 min»).
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

// El principio de algún sufijo de SUFFIXES («p», «pul», «i», «c»…), o vacío.
const isSuffixStart = (tail) => !tail || SUFFIXES.some(([suffix]) => suffix.startsWith(tail));

/**
 * ¿`text` puede ser el principio de una medida que parseLength entendería?
 * Sirve para no marcar como error lo que todavía se está escribiendo: «2,»,
 * «1/», «1 1/», «-», «10 c», «4 pul». Lo que ya se entiende también da true.
 * «abc», «1..2» o «10 kg» dan false.
 */
export function isPartialLength(text, unit) {
  if (typeof text !== 'string') return false;
  if (parseLength(text, unit) !== null) return true;
  const s = tidy(text);
  // Signo, número (con coma o punto), fracción a medio escribir y unidad a medio escribir.
  const m = /^[+-]?\s?(\d*(?:[.,]\d*)?)(?:(?:\s+|-)\d*(?:\/\d*)?|\/\d*)?\s?([\p{L}\p{M}'"″”“]*)$/u.exec(s);
  return !!m && isSuffixStart(m[2]);
}

const STEPS = {
  mm: { fine: 0.1, normal: 1, coarse: 10 },
  cm: { fine: 0.01, normal: 0.1, coarse: 1 },
  in: { fine: 1 / 64, normal: 1 / 16, coarse: 1 / 2 },
};

/**
 * Paso para el teclado y los spinners en `unit`: `size` 'fine' | 'normal' |
 * 'coarse'. Devuelve {value, mm}: `value` en la unidad (para el atributo
 * `step` de un input) y `mm`, lo mismo en mm (para mover o redimensionar).
 * mm: 0,1 / 1 / 10; cm: 0,01 / 0,1 / 1; in: 1/64 / 1/16 / 1/2.
 */
export function stepFor(unit, size = 'normal') {
  const steps = STEPS[checked(unit)];
  if (!Object.hasOwn(steps, size)) throw new RangeError(`paso desconocido: ${size}`);
  return { value: steps[size], mm: steps[size] * MM_PER[unit] };
}

// Pasos en pulgadas como fracción (así se los conoce): 1/64, 1/16, 1/2.
const STEP_FRACTIONS = { in: { fine: '1/64', normal: '1/16', coarse: '1/2' } };

/**
 * El paso de `stepFor(unit, size)` para mostrarlo, solo el número: «0,1»,
 * «1», «10» en mm; «0,01», «0,1», «1» en cm; «1/64», «1/16», «1/2» en in.
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
 * Tamaños de grilla sugeridos para `unit`, de menor a mayor: [{mm, value,
 * label}]. `mm` es el paso en mm (lo que se guarda), `value` el mismo paso en
 * la unidad y `label` solo el número para mostrar (según `locale`; en
 * pulgadas, la fracción): mm 1/5/10, cm 0,1/0,5/1, in 1/8, 1/4, 1/2.
 */
export function gridPresets(unit, { locale = 'es' } = {}) {
  return GRIDS[checked(unit)].map(([mm, value, fraction]) => ({
    mm,
    value,
    label: fraction ?? formatLength(mm, unit, { locale, withUnit: false }),
  }));
}
