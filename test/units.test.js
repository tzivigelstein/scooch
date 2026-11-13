import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNITS,
  isUnit,
  toMm,
  fromMm,
  decimalsFor,
  formatLength,
  parseLength,
  stepFor,
  gridPresets,
  unitLabel,
} from '../src/units.js';
import { prng } from './support.js';

const NB = '\u00a0';
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

describe('conversión', () => {
  test('unidades conocidas', () => {
    assert.deepEqual(UNITS, ['mm', 'cm', 'in']);
    for (const u of UNITS) assert.equal(isUnit(u), true);
    for (const u of ['m', 'MM', '', null, undefined, 'pt', 'toString', '__proto__']) assert.equal(isUnit(u), false, String(u));
  });

  test('toMm / fromMm', () => {
    assert.equal(toMm(10, 'mm'), 10);
    assert.equal(toMm(2.5, 'cm'), 25);
    assert.equal(toMm(1, 'in'), 25.4);
    assert.equal(toMm(0.5, 'in'), 12.7);
    assert.equal(fromMm(25, 'cm'), 2.5);
    assert.equal(fromMm(25.4, 'in'), 1);
    assert.equal(fromMm(210, 'mm'), 210);
    assert.equal(toMm(0, 'in'), 0);
    for (const u of UNITS) {
      for (const v of [0, 1, 3.3, 297, 1189, -7.25]) assert.ok(close(fromMm(toMm(v, u), u), v), `${v} ${u}`);
    }
  });

  test('unidad desconocida → RangeError', () => {
    for (const fn of [
      () => toMm(1, 'm'),
      () => fromMm(1, 'pt'),
      () => formatLength(1, 'px'),
      () => parseLength('1', 'yd'),
      () => stepFor('m'),
      () => gridPresets('ft'),
      () => unitLabel('x'),
      () => decimalsFor(undefined),
    ]) {
      assert.throws(fn, RangeError);
    }
  });

  test('símbolos y decimales', () => {
    assert.deepEqual(UNITS.map(unitLabel), ['mm', 'cm', 'in']);
    assert.deepEqual(UNITS.map(decimalsFor), [1, 2, 3]);
  });
});

describe('formatLength', () => {
  test('casos', () => {
    const cases = [
      [210, 'mm', {}, `210${NB}mm`],
      [210.04, 'mm', {}, `210${NB}mm`],
      [210.05, 'mm', {}, `210,1${NB}mm`],
      [10.5, 'mm', {}, `10,5${NB}mm`],
      [10.5, 'mm', { locale: 'en' }, `10.5${NB}mm`],
      [123.456, 'cm', {}, `12,35${NB}cm`],
      [100, 'cm', {}, `10${NB}cm`],
      [10.05, 'cm', {}, `1,01${NB}cm`], // 1,005 cm: la mitad sube pese al error binario
      [25.4, 'in', {}, `1${NB}in`],
      [10, 'in', {}, `0,394${NB}in`],
      [38.1, 'in', { locale: 'en-US' }, `1.5${NB}in`],
      [10, 'in', { withUnit: false }, '0,394'],
      [297, 'mm', { withUnit: false }, '297'],
      [0, 'mm', {}, `0${NB}mm`],
      [-0, 'cm', {}, `0${NB}cm`],
      [-0.04, 'mm', {}, `0${NB}mm`], // redondea a cero: sin signo
      [-12.5, 'mm', {}, `-12,5${NB}mm`],
      [-0.05, 'mm', {}, `-0,1${NB}mm`],
      [1e7, 'mm', {}, `10000000${NB}mm`], // sin separador de miles
      [12345.6, 'mm', { locale: 'en' }, `12345.6${NB}mm`],
      [12345.6, 'mm', { locale: 'de' }, `12345,6${NB}mm`],
      [1234.5, 'mm', { locale: 'ar-EG' }, `1234.5${NB}mm`], // dígitos latinos siempre
    ];
    for (const [mm, unit, opts, expected] of cases) {
      assert.equal(formatLength(mm, unit, opts), expected, `${mm} ${unit} ${JSON.stringify(opts)}`);
    }
  });

  test('no finitos y no números → cadena vacía', () => {
    for (const v of [NaN, Infinity, -Infinity, undefined, null, '10']) assert.equal(formatLength(v, 'mm'), '');
  });

  test('valores enormes no usan notación exponencial', () => {
    assert.equal(formatLength(1e21, 'mm', { withUnit: false }), '1000000000000000000000');
    assert.equal(parseLength(formatLength(1e21, 'mm'), 'mm'), 1e21);
    assert.equal(formatLength(Number.MAX_VALUE, 'mm').endsWith(`${NB}mm`), true);
  });
});

describe('parseLength', () => {
  test('tabla de casos válidos', () => {
    const cases = [
      ['10', 'mm', 10],
      ['10,5', 'mm', 10.5],
      ['10.5', 'mm', 10.5],
      ['  10  ', 'mm', 10],
      [',5', 'cm', 5],
      ['.5', 'cm', 5],
      ['5.', 'mm', 5],
      ['5,', 'mm', 5],
      ['0', 'in', 0],
      ['007', 'mm', 7],
      ['10', 'cm', 100],
      ['10', 'in', 254],
      ['2.5 cm', 'mm', 25],
      ['2,5cm', 'in', 25],
      ['10 mm', 'in', 10],
      ['10MM', 'cm', 10],
      ['4 in', 'mm', 101.6],
      ['4in', 'cm', 101.6],
      ['4 inch', 'mm', 101.6],
      ['4 inches', 'mm', 101.6],
      ['4 pulg', 'mm', 101.6],
      ['4 pulgadas', 'mm', 101.6],
      ['4"', 'mm', 101.6],
      ['4 "', 'mm', 101.6],
      ['4”', 'cm', 101.6], // comillas tipográficas del teclado del iPhone
      ['4″', 'mm', 101.6],
      ["4''", 'mm', 101.6],
      ['1/2 in', 'mm', 12.7],
      ['1/2', 'in', 12.7],
      ['3/16', 'in', 4.7625],
      ['1 1/2', 'in', 38.1],
      ['1-1/2"', 'mm', 38.1],
      ['2 3/4 in', 'cm', 69.85],
      ['-3', 'mm', -3],
      ['−3', 'mm', -3], // signo menos tipográfico
      ['- 3', 'mm', -3],
      ['+3', 'cm', 30],
      ['-1/2', 'in', -12.7],
      ['10\u00a0mm', 'cm', 10], // lo que devuelve formatLength
      ['\u200e-5', 'mm', -5], // marca de dirección antes del signo (ar-EG)
      ['99999999999999999999', 'mm', 1e20],
    ];
    for (const [text, unit, expected] of cases) {
      const got = parseLength(text, unit);
      assert.ok(got !== null && close(got, expected), `«${text}» (${unit}) → ${got}, se esperaba ${expected}`);
    }
  });

  test('tabla de casos inválidos → null', () => {
    const cases = [
      '',
      '   ',
      'abc',
      'mm',
      '.',
      ',',
      '-',
      '+',
      '--3',
      '3-',
      '10 mm mm',
      '10 m',
      '10 min',
      '10 cmm',
      '10 px',
      '1,000.5',
      '1.000,5',
      '1.2.3',
      '1 000',
      '1e3',
      '1E3',
      'Infinity',
      'NaN',
      '0x10',
      '10 20',
      '1/0 in',
      '1/2 cm', // fracciones solo en pulgadas
      '1/2 mm',
      '1//2 in',
      '1/2/3 in',
      '/2 in',
      '1/ in',
      '½ in',
    ];
    for (const text of cases) {
      assert.equal(parseLength(text, 'mm'), null, `«${text}»`);
    }
    assert.equal(parseLength('1/2', 'mm'), null, 'fracción con unidad global mm');
    assert.equal(parseLength('1/2', 'cm'), null, 'fracción con unidad global cm');
    for (const v of [null, undefined, {}, [], true]) assert.equal(parseLength(v, 'mm'), null, String(v));
  });

  test('números (no texto) se toman en la unidad global', () => {
    assert.equal(parseLength(12.5, 'cm'), 125);
    assert.equal(parseLength(0, 'in'), 0);
    assert.equal(Object.is(parseLength(-0, 'mm'), 0), true);
    assert.equal(parseLength(NaN, 'mm'), null);
    assert.equal(parseLength(Infinity, 'mm'), null);
  });

  test('nunca devuelve -0', () => {
    for (const text of ['-0', '-0,0', '−0 in', '-0/4']) {
      const v = parseLength(text, 'in');
      assert.equal(Object.is(v, -0), false, text);
    }
  });
});

describe('ida y vuelta', () => {
  const values = [0, 0.04, 0.05, 0.1, 1, 1.5875, 3.175, 10, 12.7, 25.4, 99.95, 101.6, 148, 210, 215.9, 297, 355.6, 1189, 2000];
  const rnd = prng(2024);
  for (let i = 0; i < 300; i++) values.push(rnd() * 2000, rnd() * 50, -rnd() * 100);

  test('mm → texto → mm queda dentro de la resolución del formato y es estable', () => {
    for (const locale of ['es', 'en', 'es-AR', 'de-CH', 'fr', 'sv', 'fi', 'ar-EG', 'hi-IN']) {
      for (const unit of UNITS) {
        const half = (0.5 * toMm(1, unit)) / 10 ** decimalsFor(unit);
        for (const mm of values) {
          const text = formatLength(mm, unit, { locale });
          const back = parseLength(text, unit);
          assert.ok(back !== null, `${locale} ${unit}: no se pudo leer «${text}»`);
          assert.ok(Math.abs(back - mm) <= half + 1e-9, `${locale} ${unit}: ${mm} → «${text}» → ${back}`);
          // Formatear lo leído da lo mismo: no hay deriva por más vueltas que dé.
          assert.equal(formatLength(back, unit, { locale }), text, `${locale} ${unit}: ${mm}`);
          // Sin símbolo, con la unidad global, también.
          const bare = formatLength(mm, unit, { locale, withUnit: false });
          assert.equal(parseLength(bare, unit), back, `${locale} ${unit}: «${bare}»`);
          // El sufijo pisa a la unidad global.
          const other = unit === 'mm' ? 'in' : 'mm';
          assert.equal(parseLength(text, other), back, `${locale} ${unit} leído con ${other}`);
        }
      }
    }
  });

  test('pasar por otra unidad no acumula error', () => {
    for (const mm of values.slice(0, 60)) {
      let v = mm;
      for (let i = 0; i < 5; i++) v = parseLength(formatLength(v, 'in'), 'in');
      const once = parseLength(formatLength(mm, 'in'), 'in');
      assert.equal(v, once, `${mm}`);
    }
  });
});

describe('pasos y grilla', () => {
  test('stepFor', () => {
    assert.deepEqual(stepFor('mm'), { value: 1, mm: 1 });
    assert.deepEqual(stepFor('mm', 'fine'), { value: 0.1, mm: 0.1 });
    assert.deepEqual(stepFor('mm', 'coarse'), { value: 10, mm: 10 });
    assert.equal(stepFor('cm').value, 0.1);
    assert.ok(close(stepFor('cm').mm, 1));
    assert.ok(close(stepFor('cm', 'fine').mm, 0.1));
    assert.equal(stepFor('cm', 'coarse').mm, 10);
    assert.deepEqual(stepFor('in'), { value: 1 / 16, mm: 1.5875 });
    assert.deepEqual(stepFor('in', 'fine'), { value: 1 / 64, mm: 0.396875 });
    assert.deepEqual(stepFor('in', 'coarse'), { value: 0.5, mm: 12.7 });
    for (const u of UNITS) {
      assert.ok(stepFor(u, 'fine').mm < stepFor(u).mm && stepFor(u).mm < stepFor(u, 'coarse').mm, u);
    }
    assert.throws(() => stepFor('mm', 'huge'), RangeError);
  });

  test('gridPresets', () => {
    assert.deepEqual(gridPresets('mm'), [
      { mm: 1, value: 1, label: '1' },
      { mm: 5, value: 5, label: '5' },
      { mm: 10, value: 10, label: '10' },
    ]);
    assert.deepEqual(gridPresets('cm'), [
      { mm: 1, value: 0.1, label: '0,1' },
      { mm: 5, value: 0.5, label: '0,5' },
      { mm: 10, value: 1, label: '1' },
    ]);
    assert.deepEqual(gridPresets('cm', { locale: 'en' }).map((p) => p.label), ['0.1', '0.5', '1']);
    assert.deepEqual(gridPresets('in'), [
      { mm: 3.175, value: 0.125, label: '1/8' },
      { mm: 6.35, value: 0.25, label: '1/4' },
      { mm: 12.7, value: 0.5, label: '1/2' },
    ]);
    for (const u of UNITS) {
      for (const p of gridPresets(u)) assert.ok(close(toMm(p.value, u), p.mm), `${u} ${p.label}`);
    }
  });
});
