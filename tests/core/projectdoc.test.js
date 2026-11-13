import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { DOC_VERSION, DEFAULT_CUTS, LEGACY_CUT_STYLE, ProjectError, serialize, fileKeys, counts, nextIds, migrate, validate, deserialize } from '../../src/core/projectdoc.js';

const image = (props = {}) => ({
  kind: 'image',
  name: 'foto.jpg',
  src: 1,
  px: [1200, 800],
  format: 'jpg',
  dpi: 300,
  w: 101.6,
  h: 67.73,
  bytes: new Uint8Array([1, 2, 3]), // los binarios no van al documento
  url: 'blob:x',
  ...props,
});

const pdfPage = (props = {}) => ({
  kind: 'pdf',
  name: 'plano.pdf',
  src: 2,
  page: 2,
  pages: 3,
  pageRotation: 0,
  view: [0, 0, 595.28, 841.89],
  px: [1697, 2400],
  w: 210,
  h: 297,
  pdf: { numPages: 3 },
  url: 'blob:y',
  ...props,
});

function sampleState() {
  return {
    sheets: [{ id: 1 }, { id: 4 }],
    items: [
      { id: 3, asset: 'a1', sheet: 1, x: 10, y: 10, scale: 50, r: 0 },
      { id: 7, asset: 'a2', sheet: 4, x: 20.5, y: 12, scale: 80, r: 90, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } },
      { id: 8, asset: 'a1', sheet: 4, x: 120, y: 200, scale: 25, r: 270 },
    ],
    paper: { custom: true, w: 216, h: 330 },
    landscape: false,
    margin: 8,
    gap: 4,
    rotate: false,
    cuts: { mode: 'corners', length: 3, offset: 2 },
  };
}

const sampleAssets = () =>
  new Map([
    ['a1', image({ derived: true })],
    ['a2', pdfPage()],
    ['a9', image({ src: 9 })], // sin usar: no va
  ]);

describe('serialize', () => {
  test('forma del documento, solo con los assets usados y sin binarios', () => {
    const doc = serialize(sampleState(), sampleAssets());
    assert.equal(doc.version, DOC_VERSION);
    assert.deepEqual(doc.paper, { custom: true, w: 216, h: 330 });
    assert.deepEqual(doc.sheets, [{ id: 1 }, { id: 4 }]);
    assert.equal(doc.items.length, 3);
    assert.deepEqual(Object.keys(doc.assets), ['a1', 'a2']);
    assert.deepEqual(doc.assets.a1, { kind: 'image', name: 'foto.jpg', src: 1, px: [1200, 800], format: 'jpg', dpi: 300, w: 101.6, h: 67.73, derived: true });
    assert.deepEqual(doc.assets.a2, { kind: 'pdf', name: 'plano.pdf', src: 2, page: 2, pages: 3, pageRotation: 0, view: [0, 0, 595.28, 841.89], px: [1697, 2400], w: 210, h: 297 });
    assert.equal(doc.rotate, false);
    assert.deepEqual(doc.cuts, { mode: 'corners', length: 3, offset: 2, margin: 0, weight: 'thin', color: '#000000', dash: 'solid' }, 'the defaults fill what is missing');
    assert.deepEqual(doc.items.map((item) => item.crop), [null, { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, null], 'sin recorte → null');
    // Es JSON puro: ida y vuelta sin pérdidas.
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc);
    assert.deepEqual(validate(doc), []);
  });

  test('no comparte referencias con el estado', () => {
    const state = sampleState();
    const doc = serialize(state, sampleAssets());
    doc.items[0].x = 999;
    doc.sheets.push({ id: 99 });
    assert.equal(state.items[0].x, 10);
    assert.equal(state.sheets.length, 2);
  });

  test('una pieza sin su asset es un error', () => {
    const state = sampleState();
    state.items[0].asset = 'a5';
    assert.throws(() => serialize(state, sampleAssets()), ProjectError);
  });

  test('fileKeys, counts y nextIds', () => {
    const doc = serialize(sampleState(), sampleAssets());
    assert.deepEqual(fileKeys(doc), ['src:1', 'bytes:1', 'preview:a1', 'src:2', 'preview:a2']);
    assert.deepEqual(counts(doc), { sheets: 2, pieces: 3 });
    assert.deepEqual(nextIds(doc), { item: 9, sheet: 5, asset: 3, src: 3 });
    const empty = serialize({ ...sampleState(), items: [] }, sampleAssets());
    assert.deepEqual(fileKeys(empty), []);
    assert.deepEqual(nextIds(empty), { item: 1, sheet: 5, asset: 1, src: 1 });
  });
});

describe('deserialize', () => {
  test('ida y vuelta', () => {
    const doc = serialize(sampleState(), sampleAssets());
    assert.deepEqual(deserialize(JSON.parse(JSON.stringify(doc))), doc);
  });

  test('migra la versión 0 (una sola hoja, papeles por nombre)', () => {
    const v0 = {
      paper: 'Carta',
      landscape: true,
      margin: 10,
      gap: 5,
      items: [{ id: 1, asset: 'a1', x: 1, y: 2, scale: 100, r: 0 }],
      assets: { a1: { kind: 'image', name: 'x.png', src: 1, px: [10, 10], format: 'png', dpi: 300, w: 1, h: 1 } },
    };
    const doc = deserialize(v0);
    assert.equal(doc.version, DOC_VERSION);
    assert.deepEqual(doc.cuts, { ...DEFAULT_CUTS, ...LEGACY_CUT_STYLE });
    assert.equal(doc.items[0].crop, null);
    assert.equal(doc.paper, 'letter');
    assert.equal(doc.rotate, true);
    assert.deepEqual(doc.sheets, [{ id: 1 }]);
    assert.equal(doc.items[0].sheet, 1);
    assert.equal(v0.version, undefined, 'no toca el original');
    assert.equal(migrate({ ...v0, paper: 'Oficio' }).paper, 'legal');
  });

  test('migra la versión 1 (sin recorte ni líneas de corte)', () => {
    const v1 = { ...serialize(sampleState(), sampleAssets()), version: 1 };
    delete v1.cuts;
    for (const item of v1.items) delete item.crop;
    const doc = deserialize(v1);
    assert.equal(doc.version, DOC_VERSION);
    assert.deepEqual(doc.cuts, { mode: 'none', length: 4, offset: 1.5, margin: 0, ...LEGACY_CUT_STYLE });
    assert.ok(doc.items.every((item) => item.crop === null));
    assert.equal(v1.cuts, undefined, 'no toca el original');
  });

  test('migrates version 2: the cut lines keep the stroke they printed with', () => {
    const v2 = serialize(sampleState(), sampleAssets());
    v2.version = 2;
    v2.cuts = { mode: 'corners', length: 3, offset: 2 };
    const doc = deserialize(v2);
    assert.equal(doc.version, 3);
    assert.deepEqual(doc.cuts, { mode: 'corners', length: 3, offset: 2, margin: 0, weight: 'thin', color: '#333333', dash: 'solid' });
    assert.deepEqual(v2.cuts, { mode: 'corners', length: 3, offset: 2 }, 'the original stays as it was');
  });

  test('a version 3 document keeps its chosen stroke', () => {
    const state = { ...sampleState(), cuts: { mode: 'outline', length: 4, offset: 1.5, margin: -1.5, weight: 'thick', color: '#12A0fF', dash: 'dotted' } };
    const doc = deserialize(JSON.parse(JSON.stringify(serialize(state, sampleAssets()))));
    assert.deepEqual(doc.cuts, state.cuts);
  });

  test('sin recorte en una pieza: vale (es «sin recorte»); el recorte de la imagen entera se guarda como null', () => {
    const doc = serialize(sampleState(), sampleAssets());
    delete doc.items[0].crop;
    assert.deepEqual(validate(doc), []);
    const whole = serialize({ ...sampleState(), items: [{ ...sampleState().items[0], crop: { x: 0, y: 0, w: 1, h: 1 } }] }, sampleAssets());
    assert.equal(whole.items[0].crop, null);
  });

  test('versión futura → «newer»; cualquier otra cosa rara → «corrupt»', () => {
    const doc = serialize(sampleState(), sampleAssets());
    assert.throws(() => deserialize({ ...doc, version: DOC_VERSION + 1 }), (err) => err instanceof ProjectError && err.code === 'newer');
    const broken = [
      null,
      'texto',
      [],
      { ...doc, version: -1 },
      { ...doc, version: 1.5 },
      { ...doc, paper: 'A9' },
      { ...doc, paper: { custom: true, w: 5, h: 300 } },
      { ...doc, landscape: 'no' },
      { ...doc, margin: 80 },
      { ...doc, gap: NaN },
      { ...doc, sheets: [] },
      { ...doc, sheets: [{ id: 1 }, { id: 1 }] },
      { ...doc, items: [{ ...doc.items[0], sheet: 99 }] },
      { ...doc, items: [{ ...doc.items[0], asset: 'a7' }] },
      { ...doc, items: [{ ...doc.items[0], r: 45 }] },
      { ...doc, items: [{ ...doc.items[0], scale: 0 }] },
      { ...doc, items: [doc.items[0], doc.items[0]] },
      { ...doc, assets: { ...doc.assets, a2: { ...doc.assets.a2, page: 5 } } },
      { ...doc, assets: { ...doc.assets, a1: { ...doc.assets.a1, format: 'gif' } } },
      { ...doc, assets: { ...doc.assets, a1: { ...doc.assets.a1, px: [0, 10] } } },
      { ...doc, assets: { ...doc.assets, a1: { ...doc.assets.a1, kind: 'video' } } },
      { ...doc, assets: { ...doc.assets, x1: doc.assets.a1 } },
      { ...doc, assets: null },
      { ...doc, cuts: undefined },
      { ...doc, cuts: { mode: 'dotted', length: 4, offset: 1 } },
      { ...doc, cuts: { mode: 'corners', length: 0, offset: 1 } },
      { ...doc, cuts: { mode: 'corners', length: 4, offset: -1 } },
      { ...doc, cuts: { mode: 'outline', length: 4, offset: 50 } },
      { ...doc, cuts: { ...doc.cuts, weight: 'hairline' } },
      { ...doc, cuts: { ...doc.cuts, color: 'red' } },
      { ...doc, cuts: { ...doc.cuts, color: '#12345' } },
      { ...doc, cuts: { ...doc.cuts, dash: 'dashed' } },
      { ...doc, cuts: { ...doc.cuts, margin: 25 } },
      { ...doc, cuts: { ...doc.cuts, margin: -6 } },
      { ...doc, cuts: { ...doc.cuts, margin: undefined } },
      { ...doc, cuts: { mode: 'corners', length: 4, offset: 1 } },
      { ...doc, items: [{ ...doc.items[0], crop: { x: 0.5, y: 0, w: 0.6, h: 1 } }] },
      { ...doc, items: [{ ...doc.items[0], crop: { x: 0, y: 0, w: 0.001, h: 1 } }] },
      { ...doc, items: [{ ...doc.items[0], crop: { x: 0, y: 0, w: NaN, h: 1 } }] },
      { ...doc, items: [{ ...doc.items[0], crop: 'todo' }] },
    ];
    for (const raw of broken) {
      assert.throws(
        () => deserialize(raw),
        (err) => err instanceof ProjectError && err.code === 'corrupt',
        JSON.stringify(raw)?.slice(0, 80)
      );
    }
  });
});
