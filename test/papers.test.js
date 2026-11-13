import { describe as suite, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAPER_GROUPS,
  PAPERS,
  CUSTOM_MIN,
  CUSTOM_MAX,
  MATCH_TOLERANCE,
  getPaper,
  validateSide,
  validateCustom,
  customPaper,
  sizeOf,
  matchPreset,
  describe,
} from '../src/papers.js';

suite('presets', () => {
  test('ids estables, únicos, en vertical y agrupados', () => {
    assert.deepEqual(PAPERS.map((p) => p.id), [
      'A0',
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'B4',
      'B5',
      'letter',
      'legal',
      'tabloid',
      'photo-9x13',
      'photo-10x15',
      'photo-13x18',
      'photo-15x20',
      'photo-20x30',
    ]);
    assert.deepEqual(PAPER_GROUPS, ['iso-a', 'iso-b', 'us', 'photo']);
    for (const p of PAPERS) {
      assert.ok(p.w > 0 && p.w <= p.h, `${p.id} en vertical`);
      assert.ok(PAPER_GROUPS.includes(p.group), `${p.id}: grupo ${p.group}`);
      assert.equal(validateCustom(p.w, p.h), null, `${p.id} dentro de los límites de personalizado`);
    }
    // Los de cada grupo, juntos y en el orden de PAPER_GROUPS.
    const order = PAPERS.map((p) => PAPER_GROUPS.indexOf(p.group));
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.ok(Object.isFrozen(PAPERS) && Object.isFrozen(PAPERS[0]) && Object.isFrozen(PAPER_GROUPS));
  });

  test('medidas', () => {
    const size = (id) => {
      const p = getPaper(id);
      return [p.w, p.h];
    };
    assert.deepEqual(size('A4'), [210, 297]);
    assert.deepEqual(size('A0'), [841, 1189]);
    assert.deepEqual(size('B4'), [250, 353]);
    assert.deepEqual(size('B5'), [176, 250]);
    assert.deepEqual(size('letter'), [215.9, 279.4]);
    assert.deepEqual(size('legal'), [215.9, 355.6]);
    assert.deepEqual(size('tabloid'), [279.4, 431.8]);
    assert.deepEqual(size('photo-9x13'), [88.9, 127]);
    assert.deepEqual(size('photo-10x15'), [101.6, 152.4]);
    assert.deepEqual(size('photo-13x18'), [127, 177.8]);
    assert.deepEqual(size('photo-15x20'), [152.4, 203.2]);
    assert.deepEqual(size('photo-20x30'), [203.2, 304.8]);
  });

  test('serie A: cada una es la anterior partida al medio (redondeada hacia abajo)', () => {
    const a = PAPERS.filter((p) => p.group === 'iso-a');
    for (let i = 1; i < a.length; i++) {
      assert.equal(a[i].h, a[i - 1].w, a[i].id);
      assert.equal(a[i].w, Math.floor(a[i - 1].h / 2), a[i].id);
    }
  });

  test('getPaper', () => {
    assert.equal(getPaper('A4').w, 210);
    for (const id of ['a4', 'Carta', '', null, undefined, 42, 'toString']) assert.equal(getPaper(id), null, String(id));
  });
});

suite('sizeOf', () => {
  test('presets en las dos orientaciones', () => {
    assert.deepEqual(sizeOf('A4'), { w: 210, h: 297 });
    assert.deepEqual(sizeOf('A4', false), { w: 210, h: 297 });
    assert.deepEqual(sizeOf('A4', true), { w: 297, h: 210 });
    assert.deepEqual(sizeOf('legal', true), { w: 355.6, h: 215.9 });
    for (const p of PAPERS) {
      const v = sizeOf(p.id, false);
      const l = sizeOf(p.id, true);
      assert.ok(v.w <= v.h && l.w >= l.h, p.id);
      assert.deepEqual([l.w, l.h], [v.h, v.w], p.id);
    }
  });

  test('personalizados: la orientación la da `landscape`', () => {
    assert.deepEqual(sizeOf({ custom: true, w: 200, h: 300 }), { w: 200, h: 300 });
    assert.deepEqual(sizeOf({ custom: true, w: 300, h: 200 }), { w: 200, h: 300 });
    assert.deepEqual(sizeOf({ custom: true, w: 300, h: 200 }, true), { w: 300, h: 200 });
    assert.deepEqual(sizeOf({ custom: true, w: 100, h: 100 }, true), { w: 100, h: 100 });
  });

  test('papeles inválidos → null', () => {
    for (const paper of [
      'A7',
      '',
      null,
      undefined,
      { w: 200, h: 300 }, // falta custom: true
      { custom: true, w: 10, h: 300 },
      { custom: true, w: 200, h: 2001 },
      { custom: true, w: NaN, h: 300 },
      { custom: true, w: '200', h: 300 },
    ]) {
      assert.equal(sizeOf(paper), null, JSON.stringify(paper));
      assert.equal(describe(paper), null, JSON.stringify(paper));
    }
  });
});

suite('validateCustom', () => {
  test('límites inclusivos y códigos', () => {
    assert.equal(CUSTOM_MIN, 20);
    assert.equal(CUSTOM_MAX, 2000);
    assert.equal(validateCustom(20, 20), null);
    assert.equal(validateCustom(2000, 2000), null);
    assert.equal(validateCustom(210, 297), null);
    assert.equal(validateCustom(19.99, 297), 'too-small');
    assert.equal(validateCustom(210, 2000.01), 'too-large');
    assert.equal(validateCustom(0, 100), 'too-small');
    assert.equal(validateCustom(-50, 100), 'too-small');
    assert.equal(validateCustom(NaN, 100), 'invalid');
    assert.equal(validateCustom(100, Infinity), 'invalid');
    assert.equal(validateCustom('100', 100), 'invalid');
    assert.equal(validateCustom(undefined, 100), 'invalid');
    assert.equal(validateCustom(5000, 5), 'too-large', 'primero el ancho');
    assert.equal(validateCustom(5, 5000), 'too-small', 'primero el ancho');
  });

  test('validateSide', () => {
    assert.equal(validateSide(20), null);
    assert.equal(validateSide(19), 'too-small');
    assert.equal(validateSide(2001), 'too-large');
    assert.equal(validateSide(null), 'invalid');
  });

  test('customPaper', () => {
    assert.deepEqual(customPaper(300, 200), { paper: { custom: true, w: 200, h: 300 }, landscape: true });
    assert.deepEqual(customPaper(200, 300), { paper: { custom: true, w: 200, h: 300 }, landscape: false });
    assert.deepEqual(customPaper(100, 100), { paper: { custom: true, w: 100, h: 100 }, landscape: false });
    assert.equal(customPaper(10, 300), null);
    // Ida y vuelta: lo que se cargó es lo que se ve.
    for (const [w, h] of [
      [300, 200],
      [200, 300],
      [55.5, 1999],
    ]) {
      const { paper, landscape } = customPaper(w, h);
      assert.deepEqual(sizeOf(paper, landscape), { w, h });
    }
  });
});

suite('matchPreset', () => {
  test('reconoce presets en cualquier orientación, con tolerancia', () => {
    assert.equal(MATCH_TOLERANCE, 0.5);
    assert.deepEqual(matchPreset(210, 297), { id: 'A4', landscape: false });
    assert.deepEqual(matchPreset(297, 210), { id: 'A4', landscape: true });
    assert.deepEqual(matchPreset(210.5, 296.5), { id: 'A4', landscape: false });
    assert.deepEqual(matchPreset(216, 279), { id: 'letter', landscape: false });
    assert.deepEqual(matchPreset(152.4, 101.6), { id: 'photo-10x15', landscape: true });
    assert.equal(matchPreset(210.6, 297), null);
    assert.equal(matchPreset(100, 150), null, '10×15 métrico no es 4×6 in');
    assert.equal(matchPreset(500, 500), null);
    assert.equal(matchPreset(NaN, 297), null);
    assert.deepEqual(matchPreset(100, 150, 2.5), { id: 'photo-10x15', landscape: false }, 'tolerancia propia');
  });

  test('todo preset se reconoce a sí mismo', () => {
    for (const p of PAPERS) {
      for (const landscape of [false, true]) {
        const { w, h } = sizeOf(p.id, landscape);
        assert.deepEqual(matchPreset(w, h), { id: p.id, landscape }, `${p.id} ${landscape}`);
        assert.deepEqual(matchPreset(w + 0.3, h - 0.3), { id: p.id, landscape }, `${p.id} ${landscape} ±0,3`);
      }
    }
  });

  test('con dos candidatos dentro de la tolerancia gana el más parecido', () => {
    // 215,9 × 279,4 (carta) y 210 × 297 (A4) están lejos; con tolerancia 20 entran los dos.
    assert.deepEqual(matchPreset(214, 282, 20), { id: 'letter', landscape: false });
    assert.deepEqual(matchPreset(211, 294, 20), { id: 'A4', landscape: false });
  });
});

suite('describe', () => {
  test('preset', () => {
    assert.deepEqual(describe('A4', true), {
      custom: false,
      id: 'A4',
      match: 'A4',
      group: 'iso-a',
      w: 297,
      h: 210,
      landscape: true,
    });
    assert.deepEqual(describe('photo-10x15'), {
      custom: false,
      id: 'photo-10x15',
      match: 'photo-10x15',
      group: 'photo',
      w: 101.6,
      h: 152.4,
      landscape: false,
    });
  });

  test('personalizado que coincide con un preset y que no', () => {
    assert.deepEqual(describe({ custom: true, w: 297.2, h: 210 }, true), {
      custom: true,
      id: null,
      match: 'A4',
      group: 'iso-a',
      w: 297.2,
      h: 210,
      landscape: true,
    });
    assert.deepEqual(describe({ custom: true, w: 100, h: 180 }), {
      custom: true,
      id: null,
      match: null,
      group: null,
      w: 100,
      h: 180,
      landscape: false,
    });
    // Cuadrado: nunca apaisado.
    assert.equal(describe({ custom: true, w: 100, h: 100 }, true).landscape, false);
  });
});
