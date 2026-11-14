// @vitest-environment jsdom
// Where new pieces go, arranging on as many sheets as needed (and shrinking to
// one), «Ajustar a la hoja», the measurement fields' width, filling a sheet
// with copies, removing everything and the warnings for pieces off the sheet
// or past the margin. The assets mimic the e2e fixtures (300 ppp images, PDF
// pages in mm), so the numbers are the ones a person sees.
import { beforeEach, describe, expect, test } from 'vitest';
import { t } from '../../src/copy/index.ts';
import { getDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, redo, undo } from '../../src/state/history.ts';
import { arrange, fillSummary, fillWithCopies, forgetSpill, placeNew } from '../../src/state/actions/layout.ts';
import { fit, setLengthField } from '../../src/state/actions/pieces.ts';
import { choosePaper, clearAll } from '../../src/state/actions/sheets.ts';
import { useConfirm } from '../../src/components/dialogs/confirm.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { dims, sheetProblems, sheetSize } from '../../src/state/selectors.ts';
import { getView } from '../../src/state/view.ts';
import { fakeImage, fakePdf, piece, resetState } from '../support/state.ts';

const nb = (s: string | undefined) => String(s ?? '').replace(/ /g, ' ');

// The e2e fixtures, as fake assets (images at 300 ppp).
const assets = () => ({
  big: fakeImage({ name: 'big.png', src: 1, px: [3000, 2000] }), // 254 × 169.3 mm
  small: fakeImage({ name: 'small.jpg', src: 2, px: [800, 600], format: 'jpg' }), // 67.7 × 50.8 mm
  square: fakeImage({ name: 'square.webp', src: 3, px: [1000, 1000] }), // 84.7 mm
  tall: fakeImage({ name: 'tall.png', src: 4, px: [600, 1800] }), // 50.8 × 152.4 mm
  exif: fakeImage({ name: 'exif6.jpg', src: 5, px: [800, 1200], format: 'jpg' }), // upright: 67.7 × 101.6 mm
  twopage: fakePdf({ name: 'twopage.pdf', src: 6, w: 148, h: 210, page: 1, pages: 2 }), // A5
  rotated: fakePdf({ name: 'rotated.pdf', src: 7, w: 105, h: 148, pageRotation: 90 }),
});

type Box = { id: number; sheet: number; x: number; y: number; w: number; h: number };
const box = (item: Piece): Box => {
  const [w, h] = dims(item);
  return { id: item.id, sheet: item.sheet, x: item.x, y: item.y, w, h };
};
const shown = () => getDocument().items.map(box);
const byId = (list: readonly Box[], id: number) => list.find((b) => b.id === id)!;
const area = (b: Box) => b.w * b.h;

/** Pairs on the same sheet closer than `gap` mm (or overlapping). */
function closerThan(list: readonly Box[], gap: number, eps = 0.02) {
  const bad: [number, number][] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i], list[j]];
      if (a.sheet !== b.sheet) continue;
      if (a.x < b.x + b.w + gap - eps && b.x < a.x + a.w + gap - eps && a.y < b.y + b.h + gap - eps && b.y < a.y + a.h + gap - eps) bad.push([a.id, b.id]);
    }
  return bad;
}

/** Pieces that cross the margin of their sheet. */
function outsideMargin(list: readonly Box[], eps = 0.02) {
  const [W, H] = sheetSize();
  const m = getDocument().margin;
  return list.filter((b) => b.x < m - eps || b.y < m - eps || b.x + b.w > W - m + eps || b.y + b.h > H - m + eps).map((b) => b.id);
}

let a: ReturnType<typeof assets>;

beforeEach(() => {
  resetState();
  forgetSpill();
  a = assets();
});

/** What the old regression loaded, in the same batches: big.png, then 2 images, then 2 more, then 2 PDFs. */
function loadSeven() {
  placeNew([a.big]);
  placeNew([a.small, a.square]);
  placeNew([a.tall, a.exif]);
  placeNew([a.twopage, a.rotated]);
  expect(getDocument().items).toHaveLength(7);
}

describe('placing what is added', () => {
  test('a big image on an empty sheet takes the printable width (190 mm), at ~74.8 %, inside the margin', () => {
    placeNew([a.big]);
    const [big] = getDocument().items;
    expect(box(big).w).toBeCloseTo(190, 2);
    expect(big.scale).toBeCloseTo(74.8, 1);
    expect(outsideMargin(shown())).toEqual([]);
    expect(getDocument().selection).toEqual([big.id]);
    expect(getView().flash).toBeNull();
  });

  test('what comes next fills the gaps without moving what was there, a gap apart, limited to 48 % of the printable area', () => {
    placeNew([a.big]);
    const big = shown()[0];
    placeNew([a.small, a.square]);
    const now = shown();
    expect(now).toHaveLength(3);
    expect(byId(now, big.id)).toEqual(big);
    expect(closerThan(now, 5)).toEqual([]);
    expect(outsideMargin(now)).toEqual([]);
    for (const b of now.filter((b) => b.id !== big.id)) {
      expect(b.w).toBeLessThanOrEqual(0.48 * 190 + 0.01);
      expect(b.h).toBeLessThanOrEqual(0.48 * 277 + 0.01);
    }
  });

  test('a big image added when there are pieces already is limited to 48 % of the printable area', () => {
    placeNew([a.small]);
    const big2 = fakeImage({ name: 'big.png', src: 8, px: [3000, 2000] });
    placeNew([big2]);
    const added = shown().find((b) => getDocument().items.find((item) => item.id === b.id)!.asset === big2)!;
    // Limited by the width: 48 % of 190 mm.
    expect(added.w).toBeCloseTo(0.48 * 190, 6);
    expect(added.h).toBeLessThanOrEqual(0.48 * 277);
  });

  test('what doesn’t fit goes on to a new sheet: nothing moves, nothing overlaps, no notice', () => {
    placeNew([a.big]);
    placeNew([a.small, a.square]);
    const before = shown();
    placeNew([a.tall, a.exif]);
    const now = shown();
    expect(now).toHaveLength(5);
    for (const b of before) expect(byId(now, b.id)).toEqual(b);
    // There was one sheet: what doesn't fit in its gaps continues on a new one.
    expect(getDocument().sheets).toHaveLength(2);
    const added = now.filter((b) => !before.some((o) => o.id === b.id));
    expect(added.some((b) => b.sheet === getDocument().sheets[1].id)).toBe(true);
    expect(closerThan(now, 5)).toEqual([]);
    expect(outsideMargin(now)).toEqual([]);
    expect(getView().flash).toBeNull();
    expect(sheetProblems()).toMatchObject({ cut: { count: 0 }, pastMargin: { count: 0 }, overlap: { count: 0 } });
  });
});

describe('arranging', () => {
  test('seven pieces on A4 go to two sheets with their sizes, and shrinking to one sheet is offered', () => {
    loadSeven();
    const before = shown();
    expect(arrange()).toBe('arranged');
    const now = shown();
    const flash = getView().flash!;
    expect(nb(flash.text)).toBe('Se acomodaron 7 piezas en 2 hojas');
    expect(nb(flash.action?.label)).toMatch(/^Reducir al [\d,]+ % para usar 1 hoja$/);
    expect(getDocument().sheets).toHaveLength(2);
    for (const b of now) expect(area(b)).toBeCloseTo(area(byId(before, b.id)), 6);
    expect(closerThan(now, 5)).toEqual([]);
    expect(outsideMargin(now)).toEqual([]);
  });

  test('shrinking puts them on one sheet, a gap apart; arranging again gives the same result without an undo step', () => {
    loadSeven();
    arrange();
    const arranged = shown();
    const arrangedScales = new Map(getDocument().items.map((item) => [item.id, item.scale]));
    getView().flash!.action!.run(); // «Reducir al … % para usar 1 hoja»
    const shrunk = shown();
    expect(getDocument().sheets).toHaveLength(1);
    expect(closerThan(shrunk, 5)).toEqual([]);
    expect(outsideMargin(shrunk)).toEqual([]);
    expect(nb(getView().flash?.text)).toMatch(/^Se acomodaron 7 piezas, reducidas al [\d,]+ %$/);
    // Every piece shrank by the same factor.
    const scale = (id: number) => getDocument().items.find((item) => item.id === id)!.scale;
    const k = scale(shrunk[0].id) / arrangedScales.get(shrunk[0].id)!;
    expect(k).toBeLessThan(1);
    for (const b of shrunk) {
      expect(scale(b.id) / arrangedScales.get(b.id)!).toBeCloseTo(k, 9);
      expect(area(b)).toBeCloseTo(area(byId(arranged, b.id)) * k * k, 4);
    }

    const depth = historyDepth().undo;
    expect(arrange()).toBe('same');
    expect(shown()).toEqual(shrunk);
    expect(nb(getView().flash?.text)).toBe('Se acomodaron 7 piezas');
    expect(historyDepth().undo).toBe(depth);
    // One undo takes back the shrinking (arranging again added nothing).
    undo();
    for (const b of shown()) expect(area(b)).toBeCloseTo(area(byId(arranged, b.id)), 6);
  });

  test('on A6 the one that doesn’t fit even alone stays as it was, alone on its sheet, and «Ajustar a la hoja» is offered', () => {
    // Where the old walk was: the seven arranged and shrunk to one A4 sheet.
    loadSeven();
    arrange();
    getView().flash!.action!.run();
    const bigId = getDocument().items.find((item) => item.asset === a.big)!.id;
    const before = shown();
    choosePaper('A6');
    expect(arrange()).toBe('arranged');
    const flash = getView().flash!;
    expect(nb(flash.text)).toMatch(/^Se acomodaron 6 piezas en \d+ hojas\. big\.png no entra en la hoja ni sola, así que quedó donde estaba\.$/);
    expect(flash.warn).toBe(true);
    expect(flash.action?.label).toBe('Ajustar a la hoja');
    const now = shown();
    // Nothing shrank in silence.
    for (const b of now) expect(area(b)).toBeCloseTo(area(byId(before, b.id)), 6);
    const rest = now.filter((b) => b.id !== bigId);
    expect(closerThan(rest, 5)).toEqual([]);
    expect(outsideMargin(rest)).toEqual([]);
    expect(now.filter((b) => b.sheet === byId(now, bigId).sheet)).toHaveLength(1);

    flash.action!.run(); // «Ajustar a la hoja»
    const fitted = byId(shown(), bigId);
    expect(fitted.w).toBeCloseTo(85, 2);
    expect(outsideMargin([fitted])).toEqual([]);
    expect(nb(getView().flash?.text)).toBe('Se ajustó 1 pieza a la hoja');

    undo();
    for (const b of shown()) expect(b.w).toBeCloseTo(byId(now, b.id).w, 6);
    undo();
    undo();
    expect(getDocument().paper).toBe('A4');
    expect(sheetSize()[0]).toBe(210);
    redo();
    redo();
    redo();
    expect(getDocument().paper).toBe('A6');
    expect(closerThan(shown(), 5)).toEqual([]);
    expect(outsideMargin(shown())).toEqual([]);
  });
});

describe('one piece', () => {
  // small.jpg alone: 67.7 × 50.8 mm at 100 %.
  beforeEach(() => {
    resetState({ items: [piece(1, a.small, 30, 40)], selection: [1] });
  });

  test('a width of 50 mm keeps the proportion, in one undo step', () => {
    const [w0, h0] = dims(getDocument().items[0]);
    setLengthField('width', 50, { final: true });
    const [w, h] = dims(getDocument().items[0]);
    expect(w).toBeCloseTo(50, 6);
    expect(w / h).toBeCloseTo(w0 / h0, 6);
    expect(historyDepth().undo).toBe(1);
  });

  test('off the sheet, or past the margin, the warning says so', () => {
    setLengthField('x', -5, { final: true });
    expect(sheetProblems()).toMatchObject({ cut: { count: 1 }, pastMargin: { count: 0 } });
    expect(t('notices.cut', { n: sheetProblems().cut.count })).toBe('1 pieza se sale de la hoja y se corta al imprimir');
    setLengthField('x', 5, { final: true });
    expect(sheetProblems()).toMatchObject({ cut: { count: 0 }, pastMargin: { count: 1 } });
    expect(t('notices.pastMargin', { n: sheetProblems().pastMargin.count })).toBe('1 pieza pasa el margen y puede que la impresora no imprima ese borde');
  });

  test('«Ajustar a la hoja»: the largest size inside the margin, centered, in one undo step', () => {
    const before = getDocument().items[0];
    fit();
    const b = box(getDocument().items[0]);
    expect(b.w).toBeCloseTo(190, 6);
    expect(b.x + b.w / 2).toBeCloseTo(105, 6);
    expect(b.y + b.h / 2).toBeCloseTo(148.5, 6);
    expect(outsideMargin([b])).toEqual([]);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items[0]).toEqual(before);
    redo();
    expect(box(getDocument().items[0])).toEqual(b);
  });
});

describe('filling a sheet with copies and removing everything', () => {
  test('the copies are as many as the summary says, the other sheets stay, and undo brings back what was there', () => {
    loadSeven();
    const items = getDocument().items;
    const small = items.find((item) => item.asset === a.small)!;
    setSelection([small.id]);
    const summary = fillSummary(small);
    expect(summary.ok).toBe(true);
    expect(nb(summary.text)).toMatch(/^\d+ copias en la hoja \d$/);
    expect(summary.warning).toMatch(/^Reemplaza las piezas de la hoja \d/);
    const n = parseInt(summary.text, 10);
    const sheets = getDocument().sheets;
    const elsewhere = items.filter((item) => item.sheet !== small.sheet);
    expect(fillWithCopies()).toBe(true);
    const after = getDocument().items;
    expect(after.filter((item) => item.sheet === small.sheet)).toHaveLength(n);
    expect(after.filter((item) => item.sheet !== small.sheet)).toEqual(elsewhere);
    expect(getDocument().sheets).toEqual(sheets);
    expect(closerThan(shown(), 5)).toEqual([]);
    undo();
    expect(getDocument().items).toEqual(items);
  });

  test('with one sheet the summary names the paper', () => {
    resetState({ items: [piece(1, a.small, 30, 40)], selection: [1] });
    expect(nb(fillSummary(getDocument().items[0]).text)).toMatch(/^\d+ copias en A4$/);
  });

  test('«Quitar todas» asks first, saying what goes, focused on «Cancelar»; canceled, nothing changes', async () => {
    loadSeven();
    const before = getDocument();
    const clearing = clearAll();
    const request = useConfirm.getState().request!;
    expect(nb(request.title)).toBe(`¿Quitar las 7 piezas de las ${before.sheets.length} hojas?`);
    expect(request).toMatchObject({ body: 'Queda 1 hoja vacía. Puedes deshacerlo.', confirm: 'Quitar todas', focus: 'cancel' });
    useConfirm.setState({ request: null });
    request.resolve(false);
    await clearing;
    expect(getDocument().items).toBe(before.items);
    expect(historyDepth().undo).toBe(0);
  });

  test('«Quitar todas» confirmed leaves one empty sheet in one undo step, and the notice offers «Deshacer», which brings everything back', async () => {
    loadSeven();
    const { items, sheets } = getDocument();
    const clearing = clearAll();
    const request = useConfirm.getState().request!;
    useConfirm.setState({ request: null });
    request.resolve(true);
    await clearing;
    expect(getDocument().items).toEqual([]);
    expect(getDocument().sheets).toEqual([sheets[0]]);
    expect(historyDepth().undo).toBe(1);
    const flash = getView().flash!;
    expect(flash).toMatchObject({ text: 'Se quitaron las 7 piezas' });
    expect(flash.action?.label).toBe('Deshacer');
    flash.action!.run();
    expect(getDocument().items).toEqual(items);
    expect(getDocument().sheets).toEqual(sheets);
  });

  test('«Quitar todas» with one sheet and one piece: «¿Quitar la pieza?»', async () => {
    resetState({ items: [piece(1, a.small, 30, 40)] });
    const clearing = clearAll();
    const request = useConfirm.getState().request!;
    expect(request).toMatchObject({ title: '¿Quitar la pieza?', body: 'Puedes deshacerlo.' });
    useConfirm.setState({ request: null });
    request.resolve(true);
    await clearing;
    expect(getView().flash?.text).toBe('Se quitó 1 pieza');
  });
});
