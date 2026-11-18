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
  bytes: new Uint8Array([1, 2, 3]), // binaries don't go into the document
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
    ['a9', image({ src: 9 })], // unused: left out
  ]);

describe('serialize', () => {
  test('the document’s shape, with only the assets in use and no binaries', () => {
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
    assert.deepEqual(doc.items.map((item) => item.crop), [null, { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, null], 'no crop → null');
    // Plain JSON: a lossless round trip.
    assert.deepEqual(JSON.parse(JSON.stringify(doc)), doc);
    assert.deepEqual(validate(doc), []);
  });

  test('shares no references with the state', () => {
    const state = sampleState();
    const doc = serialize(state, sampleAssets());
    doc.items[0].x = 999;
    doc.sheets.push({ id: 99 });
    assert.equal(state.items[0].x, 10);
    assert.equal(state.sheets.length, 2);
  });

  test('a piece without its asset is an error', () => {
    const state = sampleState();
    state.items[0].asset = 'a5';
    assert.throws(() => serialize(state, sampleAssets()), ProjectError);
  });

  test('fileKeys, counts and nextIds', () => {
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
  test('round trip', () => {
    const doc = serialize(sampleState(), sampleAssets());
    assert.deepEqual(deserialize(JSON.parse(JSON.stringify(doc))), doc);
  });

  test('migrates version 0 (a single sheet, papers by name)', () => {
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
    assert.equal(v0.version, undefined, 'the original stays as it was');
    assert.equal(migrate({ ...v0, paper: 'Oficio' }).paper, 'legal');
  });

  test('migrates version 1 (no crops nor cut lines)', () => {
    const v1 = { ...serialize(sampleState(), sampleAssets()), version: 1 };
    delete v1.cuts;
    for (const item of v1.items) delete item.crop;
    const doc = deserialize(v1);
    assert.equal(doc.version, DOC_VERSION);
    assert.deepEqual(doc.cuts, { mode: 'none', length: 4, offset: 1.5, margin: 0, ...LEGACY_CUT_STYLE });
    assert.ok(doc.items.every((item) => item.crop === null));
    assert.equal(v1.cuts, undefined, 'the original stays as it was');
  });

  test('migrates version 2: the cut lines keep the stroke they printed with', () => {
    const v2 = serialize(sampleState(), sampleAssets());
    v2.version = 2;
    v2.cuts = { mode: 'corners', length: 3, offset: 2 };
    const doc = deserialize(v2);
    assert.equal(doc.version, DOC_VERSION);
    assert.deepEqual(doc.cuts, { mode: 'corners', length: 3, offset: 2, margin: 0, weight: 'thin', color: '#333333', dash: 'solid' });
    assert.deepEqual(v2.cuts, { mode: 'corners', length: 3, offset: 2 }, 'the original stays as it was');
  });

  test('migrates version 4: «Permitir superposición» was the device’s, so the project takes the value the device had', () => {
    const v4 = { ...serialize(sampleState(), sampleAssets()), version: 4 };
    delete v4.allowOverlap;
    assert.equal(deserialize(v4, { allowOverlap: true }).allowOverlap, true);
    assert.equal(deserialize(v4, { allowOverlap: false }).allowOverlap, false);
    assert.equal(deserialize(v4).allowOverlap, false, 'without a device value: not allowed');
    assert.equal(migrate(v4, { allowOverlap: true }).version, DOC_VERSION);
  });

  test('a version 5 document keeps its own «Permitir superposición», whatever the device had', () => {
    const doc = serialize({ ...sampleState(), allowOverlap: true }, sampleAssets());
    assert.equal(doc.allowOverlap, true);
    assert.equal(deserialize(doc, { allowOverlap: false }).allowOverlap, true);
    assert.equal(deserialize({ ...doc, allowOverlap: 'yes' }).allowOverlap, false, 'unreadable: not allowed');
  });

  test('a version 3 document keeps its chosen stroke', () => {
    const state = { ...sampleState(), cuts: { mode: 'outline', length: 4, offset: 1.5, margin: -1.5, weight: 'thick', color: '#12A0fF', dash: 'dotted' } };
    const doc = deserialize(JSON.parse(JSON.stringify(serialize(state, sampleAssets()))));
    assert.deepEqual(doc.cuts, state.cuts);
  });

  test('a piece without a crop is valid (no crop); a crop of the whole image is stored as null', () => {
    const doc = serialize(sampleState(), sampleAssets());
    delete doc.items[0].crop;
    assert.deepEqual(validate(doc), []);
    const whole = serialize({ ...sampleState(), items: [{ ...sampleState().items[0], crop: { x: 0, y: 0, w: 1, h: 1 } }] }, sampleAssets());
    assert.equal(whole.items[0].crop, null);
  });

  test('optional settings that are missing or unreadable take their default; numbers are clamped', () => {
    const doc = serialize(sampleState(), sampleAssets());
    const open = (changes) => deserialize({ ...doc, ...changes });
    assert.deepEqual(open({ cuts: undefined }).cuts, DEFAULT_CUTS);
    assert.equal(open({ cuts: { ...doc.cuts, mode: 'dotted' } }).cuts.mode, 'none');
    assert.equal(open({ cuts: { ...doc.cuts, length: 0 } }).cuts.length, 0.5);
    assert.equal(open({ cuts: { ...doc.cuts, offset: -1 } }).cuts.offset, 0);
    assert.equal(open({ cuts: { ...doc.cuts, offset: 50 } }).cuts.offset, 10);
    assert.equal(open({ cuts: { ...doc.cuts, weight: 'hairline' } }).cuts.weight, 'thin');
    assert.equal(open({ cuts: { ...doc.cuts, color: 'red' } }).cuts.color, '#000000');
    assert.equal(open({ cuts: { ...doc.cuts, dash: 'dashed' } }).cuts.dash, 'solid');
    assert.equal(open({ cuts: { ...doc.cuts, margin: 25 } }).cuts.margin, 20);
    assert.equal(open({ cuts: { ...doc.cuts, margin: -6 } }).cuts.margin, -5);
    assert.equal(open({ cuts: { mode: 'corners', length: 4, offset: 1 } }).cuts.margin, 0);
    assert.equal(open({ margin: 80, gap: -2 }).margin, 50);
    assert.equal(open({ margin: 80, gap: -2 }).gap, 0);
    assert.equal(open({ paper: 'B0' }).paper, 'A4');
    assert.equal(open({ paper: { custom: true, w: 5, h: 300 } }).paper, 'A4');
    assert.equal(open({ gap: NaN }).gap, 5);
    assert.equal(open({ gap: 'x' }).gap, 5);
    assert.equal(open({ landscape: 'yes', rotate: null }).landscape, false);
    const item = (changes) => open({ items: [{ ...doc.items[0], ...changes }] }).items[0];
    assert.equal(item({ crop: 'all' }).crop, null);
    assert.equal(item({ crop: { x: 0, y: 0, w: NaN, h: 1 } }).crop, null);
    assert.deepEqual(item({ crop: { x: 0.5, y: 0, w: 0.6, h: 1 } }).crop, { x: 0.4, y: 0, w: 0.6, h: 1 });
    assert.equal(item({ crop: { x: 0, y: 0, w: 0.001, h: 1 } }).crop.w, 0.01);
    assert.equal(item({ scale: 5000 }).scale, 1000);
    // Fields it doesn't know are kept, never fatal.
    assert.equal(open({ future: { x: 1 } }).future.x, 1);
  });

  test('a later version → «newer»; anything else odd → «corrupt»', () => {
    const doc = serialize(sampleState(), sampleAssets());
    assert.throws(() => deserialize({ ...doc, version: DOC_VERSION + 1 }), (err) => err instanceof ProjectError && err.code === 'newer');
    const broken = [
      null,
      'text',
      [],
      { ...doc, version: -1 },
      { ...doc, version: 1.5 },
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
