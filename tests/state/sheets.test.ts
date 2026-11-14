// @vitest-environment jsdom
// Several sheets on the real stores: adding and removing a sheet, moving a
// piece to the previous or next sheet (Shift+Page Up / Page Down), moving
// pieces to a new sheet (what a drag out of the sheets does) and the notice of
// the sheet it left empty, adding files when the sheets are full, arranging
// after that spill, copies with a full sheet, and notices that name the sheet.
// The assets mimic the e2e cards (661 × 945 px at 300 ppp: 55.96 × 80.01 mm,
// 9 to an A4 sheet), so the numbers are the ones a person sees.
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { NoticePill } from '../../src/components/feedback/NoticePill.tsx';
import { useConfirm } from '../../src/components/dialogs/confirm.ts';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, redo, resetHistory, undo } from '../../src/state/history.ts';
import { getView } from '../../src/state/view.ts';
import { currentSheet, dims, itemsOn, sheetSize } from '../../src/state/selectors.ts';
import { arrange, fillSummary, fillWithCopies, forgetSpill, placeNew } from '../../src/state/actions/layout.ts';
import { loadFiles } from '../../src/state/actions/files.ts';
import { duplicate } from '../../src/state/actions/pieces.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { addSheet, moveToNewSheetAt, removeSheet, sendToSheet } from '../../src/state/actions/sheets.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

// Loading a file decodes it in the browser: here each file becomes a card-sized asset.
vi.mock('../../src/services/assets.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/assets.ts')>();
  const readFile = async (file: File) => {
    if (file.name === 'photo.heic') throw new actual.FileProblem('el navegador no puede abrir este formato; prueba con JPG, PNG o WebP');
    if (file.name === 'broken.png') throw new TypeError('Failed to fetch dynamically imported module');
    return readable(file);
  };
  const readable = (file: File) => ({
    kind: 'image' as const,
    name: file.name,
    src: Number(file.name.replace(/\D/g, '')) + 100,
    px: [661, 945] as [number, number],
    w: (661 / 300) * 25.4,
    h: (945 / 300) * 25.4,
    bytes: new Uint8Array(),
    preview: new Blob(),
    url: 'blob:test',
    format: 'png' as const,
    dpi: 300,
    derived: false,
  });
  return { ...actual, readFile };
});

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

function heard() {
  vi.advanceTimersByTime(1000);
  return (document.getElementById('live-polite')!.textContent ?? '').replace(/ /g, ' ').trim();
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
  resetState();
  forgetSpill();
  useConfirm.setState({ request: null });
});

afterEach(() => {
  cleanup();
  vi.runAllTimers();
  vi.useRealTimers();
});

// ---------- Helpers ----------

/** Card-sized fake assets (like e2e/fixtures/cardNN.png). */
const cards = (from: number, n: number) => Array.from({ length: n }, (_, i) => fakeImage({ name: `card${String(from + i).padStart(2, '0')}.png`, src: from + i + 1, px: [661, 945] }));
const cardFiles = (from: number, n: number) => Array.from({ length: n }, (_, i) => new File([], `card${String(from + i).padStart(2, '0')}.png`, { type: 'image/png' }));

/** 12 cards added at once: 9 fill the first sheet, 3 go on to a new one. Nothing selected, no history. */
function twelve() {
  placeNew(cards(0, 12));
  setSelection([]);
  resetHistory();
  expect(counts()).toEqual([9, 3]);
  const [s1, s2] = getDocument().sheets.map((sheet) => sheet.id);
  return { s1, s2, on1: itemsOn(s1).map((item) => item.id), on2: itemsOn(s2).map((item) => item.id) };
}

const counts = () => getDocument().sheets.map((sheet) => itemsOn(sheet.id).length);
const item = (id: number) => getDocument().items.find((other) => other.id === id)!;
const documentNow = () => {
  const { items, sheets, selection } = getDocument();
  return { items, sheets, selection };
};
/** The first piece of a sheet in reading order (what Page Down focuses). */
const firstOn = (sheet: number) => [...itemsOn(sheet)].sort((a, b) => a.y - b.y || a.x - b.x)[0];

/** Pairs on the same sheet closer than the gap (or overlapping), and pieces past the margin. */
function problems(items: readonly Piece[] = getDocument().items, eps = 0.02) {
  const { gap, margin } = getDocument();
  const [W, H] = sheetSize();
  const boxes = items.map((it) => {
    const [w, h] = dims(it);
    return { id: it.id, sheet: it.sheet, x: it.x, y: it.y, w, h };
  });
  const close: [number, number][] = [];
  boxes.forEach((a, i) =>
    boxes.slice(i + 1).forEach((b) => {
      if (a.sheet === b.sheet && a.x < b.x + b.w + gap - eps && b.x < a.x + a.w + gap - eps && a.y < b.y + b.h + gap - eps && b.y < a.y + a.h + gap - eps) close.push([a.id, b.id]);
    })
  );
  const outside = boxes.filter((b) => b.x < margin - eps || b.y < margin - eps || b.x + b.w > W - margin + eps || b.y + b.h > H - margin + eps).map((b) => b.id);
  return { close, outside };
}
const valid = { close: [], outside: [] };

// ---------- Adding and removing sheets ----------

describe('addSheet («Agregar hoja»)', () => {
  test('an empty sheet at the end becomes the current one, nothing selected, announced, in one undo step', () => {
    placeNew(cards(0, 5));
    resetHistory();
    expect(counts()).toEqual([5]);
    const before = documentNow();
    addSheet();
    const { sheets, selection } = getDocument();
    expect(counts()).toEqual([5, 0]);
    expect(selection).toEqual([]);
    expect(getView().sheet).toBe(sheets[1].id);
    expect(currentSheet()).toBe(sheets[1].id);
    expect(heard()).toBe('Se agregó la hoja 2.');
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(documentNow()).toEqual(before);
  });
});

describe('removeSheet', () => {
  test('an empty sheet goes without asking, announced, and the one that takes its place becomes the current sheet', async () => {
    const { s1, s2 } = twelve();
    addSheet();
    const s3 = getDocument().sheets[2].id;
    // Its pieces go to the new third sheet: the second is left empty, in the middle.
    for (const id of itemsOn(s2).map((it) => it.id)) {
      setSelection([id]);
      sendToSheet(1);
    }
    expect(counts()).toEqual([9, 0, 3]);
    resetHistory();
    const before = documentNow();
    heard();
    await removeSheet(s2);
    expect(useConfirm.getState().request).toBeNull();
    expect(getDocument().sheets.map((sheet) => sheet.id)).toEqual([s1, s3]);
    expect(getView().sheet).toBe(s3);
    expect(heard()).toBe('Se quitó la hoja 2.');
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(documentNow()).toEqual(before);
  });

  test('one with pieces goes at once with them, in one undo step, and the notice offers «Deshacer», which brings it back', () => {
    const { s2, on2 } = twelve();
    const before = documentNow();
    removeSheet(getDocument().sheets[0].id);
    expect(useConfirm.getState().request).toBeNull();
    expect(getDocument().sheets.map((sheet) => sheet.id)).toEqual([s2]);
    expect(getDocument().items.map((it) => it.id)).toEqual(on2);
    expect(getView().flash).toMatchObject({ text: 'Se quitó la hoja 1 con 9 piezas', action: { label: 'Deshacer' } });
    expect(historyDepth().undo).toBe(1);
    getView().flash!.action!.run();
    expect(documentNow()).toEqual(before);
  });

  test('the only sheet stays', async () => {
    placeNew(cards(0, 2));
    const before = documentNow();
    await removeSheet(getDocument().sheets[0].id);
    expect(useConfirm.getState().request).toBeNull();
    expect(documentNow()).toEqual(before);
  });
});

// ---------- Shift+Page Down / Page Up ----------

describe('sendToSheet (Shift+Page Up / Page Down)', () => {
  test('to the next sheet: into a free spot there, announced with the sheet and the total', () => {
    const { s1, s2 } = twelve();
    const moving = firstOn(s1).id;
    setSelection([moving]);
    sendToSheet(1);
    expect(item(moving).sheet).toBe(s2);
    expect(counts()).toEqual([8, 4]);
    expect(problems()).toEqual(valid);
    expect(getView().sheet).toBe(s2);
    expect(heard()).toBe('Se movió a la hoja 2 de 2.');
  });

  test('from the last sheet: onto a new sheet right after it', () => {
    const { s1, s2 } = twelve();
    const moving = firstOn(s1).id;
    setSelection([moving]);
    sendToSheet(1);
    heard();
    sendToSheet(1);
    const { sheets } = getDocument();
    expect(sheets.slice(0, 2).map((sheet) => sheet.id)).toEqual([s1, s2]);
    expect(item(moving).sheet).toBe(sheets[2].id);
    expect(counts()).toEqual([8, 3, 1]);
    expect(problems()).toEqual(valid);
    expect(heard()).toBe('Se movió a la hoja 3 de 3.');
  });

  test('back twice: into the gap it left on the first sheet; past the first it says so and nothing changes', () => {
    const { s1 } = twelve();
    const moving = firstOn(s1);
    setSelection([moving.id]);
    sendToSheet(1);
    sendToSheet(1);
    sendToSheet(-1);
    sendToSheet(-1);
    expect(item(moving.id)).toMatchObject({ sheet: s1, x: moving.x, y: moving.y });
    expect(counts()).toEqual([9, 3, 0]);
    expect(problems()).toEqual(valid);
    const before = documentNow();
    const depth = historyDepth().undo;
    heard();
    sendToSheet(-1);
    expect(heard()).toBe('Es la primera hoja.');
    expect(documentNow()).toEqual(before);
    expect(historyDepth().undo).toBe(depth);
  });

  test('each move is one undo step, and redo replays them one by one', () => {
    const { s1 } = twelve();
    const moving = firstOn(s1).id;
    setSelection([moving]);
    const steps = [documentNow().items];
    for (const dir of [1, 1, -1, -1] as const) {
      sendToSheet(dir);
      steps.push(getDocument().items);
    }
    expect(historyDepth().undo).toBe(4);
    for (let i = 3; i >= 0; i--) {
      undo();
      expect(getDocument().items).toEqual(steps[i]);
    }
    expect(counts()).toEqual([9, 3]);
    for (let i = 1; i <= 4; i++) {
      redo();
      expect(getDocument().items).toEqual(steps[i]);
    }
  });

  test('when the next (or previous) sheet is full, a new sheet goes right beside the current one', () => {
    placeNew(cards(0, 20));
    expect(counts()).toEqual([9, 9, 2]);
    const [s1, s2, s3] = getDocument().sheets.map((sheet) => sheet.id);
    const fromFirst = firstOn(s1).id;
    setSelection([fromFirst]);
    sendToSheet(1);
    let ids = getDocument().sheets.map((sheet) => sheet.id);
    expect(ids).toHaveLength(4);
    expect([ids[0], ids[2], ids[3]]).toEqual([s1, s2, s3]);
    expect(item(fromFirst).sheet).toBe(ids[1]);
    expect(heard()).toBe('Se movió a la hoja 2 de 4.');

    const fromThird = firstOn(s3).id;
    setSelection([fromThird]);
    sendToSheet(-1);
    ids = getDocument().sheets.map((sheet) => sheet.id);
    expect(ids).toHaveLength(5);
    // Before the third sheet (s2 is full): between s2 and s3.
    expect(ids.indexOf(item(fromThird).sheet)).toBe(ids.indexOf(s3) - 1);
    expect(ids.indexOf(item(fromThird).sheet)).toBe(ids.indexOf(s2) + 1);
    expect(problems()).toEqual(valid);
  });

  test('with several pieces selected it only says it works with one', () => {
    const { on1 } = twelve();
    setSelection(on1.slice(0, 2));
    const before = documentNow();
    sendToSheet(1);
    expect(documentNow()).toEqual(before);
    expect(heard()).toBe('Disponible con una sola pieza seleccionada.');
  });
});

// ---------- A new sheet for what is dragged out of the sheets ----------

describe('moveToNewSheetAt (dropping outside the sheets) and the sheet it leaves empty', () => {
  test('at the end: a third sheet with the piece where it was let go, announced without a notice, in one undo step', () => {
    const { s1, s2, on2 } = twelve();
    const before = documentNow();
    const id = moveToNewSheetAt(2, new Map([[on2[0], { x: 30, y: 40 }]]));
    const after = documentNow();
    expect(after.sheets.map((sheet) => sheet.id)).toEqual([s1, s2, id]);
    expect(item(on2[0])).toMatchObject({ sheet: id, x: 30, y: 40 });
    expect(heard()).toBe('Se creó la hoja 3 y se movió 1 pieza.');
    expect(getView().flash).toBeNull();
    expect(getView().sheet).toBe(id);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(documentNow()).toEqual(before);
    redo();
    expect(documentNow()).toEqual(after);
  });

  test('between two sheets, or before the first: the new sheet goes at that place in the list', () => {
    const { s1, s2, on1, on2 } = twelve();
    const between = moveToNewSheetAt(1, new Map([[on2[1], { x: 20, y: 20 }]]));
    expect(getDocument().sheets.map((sheet) => sheet.id)).toEqual([s1, between, s2]);
    expect(itemsOn(between!).map((it) => it.id)).toEqual([on2[1]]);
    expect(heard()).toBe('Se creó la hoja 2 y se movió 1 pieza.');
    undo();
    const first = moveToNewSheetAt(0, new Map([[on1[0], { x: 20, y: 20 }]]));
    expect(getDocument().sheets.map((sheet) => sheet.id)).toEqual([first, s1, s2]);
    expect(itemsOn(first!).map((it) => it.id)).toEqual([on1[0]]);
    expect(heard()).toBe('Se creó la hoja 1 y se movió 1 pieza.');
  });

  test('a whole sheet moved: it stays, empty, with a notice whose «Quitar hoja» removes it without asking; two undo steps go back', async () => {
    const { s1, on2 } = twelve();
    const before = documentNow();
    // The three keep their arrangement: each moves by the same amount.
    const positions = new Map(on2.map((id) => [id, { x: item(id).x + 7, y: item(id).y + 11 }]));
    const id = moveToNewSheetAt(2, positions)!;
    expect(counts()).toEqual([9, 0, 3]);
    for (const [moved, at] of positions) expect(item(moved)).toMatchObject({ sheet: id, ...at });
    expect(heard()).toBe('Se creó la hoja 3 y se movieron 3 piezas.');
    const flash = getView().flash!;
    expect(flash.text).toBe('La hoja 2 quedó vacía');
    // Something to know, not an action that went well.
    expect(flash.info).toBe(true);
    expect(flash.action?.label).toBe('Quitar hoja');

    await flash.action!.run();
    expect(useConfirm.getState().request).toBeNull();
    expect(getDocument().sheets.map((sheet) => sheet.id)).toEqual([s1, id]);
    expect(counts()).toEqual([9, 3]);
    expect(historyDepth().undo).toBe(2);
    undo();
    undo();
    expect(documentNow()).toEqual(before);
  });

  test('pieces of two sheets do not move: no sheet, no step', () => {
    const { on1, on2 } = twelve();
    const before = documentNow();
    expect(
      moveToNewSheetAt(
        2,
        new Map([
          [on1[0], { x: 20, y: 20 }],
          [on2[0], { x: 90, y: 20 }],
        ])
      )
    ).toBeNull();
    expect(documentNow()).toEqual(before);
    expect(historyDepth().undo).toBe(0);
  });
});

// ---------- Adding files to full sheets, and arranging after that ----------

describe('adding files when the sheets are full', () => {
  /** 5 cards, then 7 more (two loads), as files. */
  async function fiveThenSeven() {
    await loadFiles(cardFiles(0, 5));
    expect(counts()).toEqual([5]);
    heard();
    const first5 = getDocument().items;
    await loadFiles(cardFiles(5, 7));
    return first5;
  }

  test('7 more with 5: they fill the current sheet (9) and go on to a new one (3), nothing moves, and a notice says on which sheets they are', async () => {
    const first5 = await fiveThenSeven();
    expect(counts()).toEqual([9, 3]);
    expect(getDocument().items.slice(0, 5)).toEqual(first5);
    expect(problems()).toEqual(valid);
    expect(getView().flash).toMatchObject({ text: 'Se agregaron 7 archivos en las hojas 1 y 2' });
  });

  test('a file the browser can’t open says why; one that fails unexpectedly says it couldn’t be processed, not the technical error', async () => {
    await loadFiles([new File([], 'photo.heic'), new File([], 'broken.png'), ...cardFiles(0, 1)]);
    expect(counts()).toEqual([1]);
    expect(getView().flash).toMatchObject({
      text: 'No se pudieron agregar 2 archivos: photo.heic: el navegador no puede abrir este formato; prueba con JPG, PNG o WebP · broken.png: no se pudo procesar el archivo; inténtalo de nuevo',
      warn: true,
    });
  });

  test('added files: the last one selected; on one sheet, even another one, they are announced with it (the view goes there); on several, a notice names them', async () => {
    await loadFiles(cardFiles(0, 5));
    expect(getDocument().selection).toEqual([getDocument().items.at(-1)!.id]);
    expect(getView().flash).toBeNull();
    expect(heard()).toBe('Se agregaron 5 archivos a la hoja 1.');
    await loadFiles(cardFiles(5, 4));
    expect(counts()).toEqual([9]);
    await loadFiles(cardFiles(9, 1));
    expect(counts()).toEqual([9, 1]);
    const added = getDocument().items.at(-1)!;
    expect(getDocument().selection).toEqual([added.id]);
    expect(getView().flash).toBeNull();
    expect(heard()).toBe('Se agregaron 4 archivos a la hoja 1. Se agregó 1 archivo a la hoja 2.');
  });

  test('then arranging (one undo step, redone exactly) offers to shrink to one sheet; shrinking puts all 12 on it; one undo brings the two sheets back', async () => {
    await fiveThenSeven();
    const spilled = documentNow();
    expect(arrange()).toBe('arranged');
    const flash = getView().flash!;
    expect(flash.text.replace(/ /g, ' ')).toBe('Se acomodaron 12 piezas en 2 hojas');
    expect(flash.action!.label.replace(/ /g, ' ')).toMatch(/^Reducir al [\d,]+ % para usar 1 hoja$/);
    const arranged = documentNow();
    undo();
    expect(documentNow()).toEqual(spilled);
    redo();
    expect(documentNow()).toEqual(arranged);
    flash.action!.run();
    expect(counts()).toEqual([12]);
    expect(problems()).toEqual(valid);
    undo();
    expect(counts()).toEqual([9, 3]);
    expect(documentNow()).toEqual(arranged);
  });
});

// ---------- Copies when a sheet is full ----------

describe('copies with a full sheet', () => {
  test('D on a piece of the full first sheet: the copy goes to the second, selected, nothing moves, announced with the sheet', () => {
    const { s1, s2 } = twelve();
    const original = firstOn(s1);
    setSelection([original.id]);
    const before = getDocument().items;
    duplicate(1, { focus: true });
    const { items, selection } = getDocument();
    expect(counts()).toEqual([9, 4]);
    expect(items.slice(0, before.length)).toEqual(before);
    const copy = items.at(-1)!;
    expect(copy).toMatchObject({ asset: original.asset, sheet: s2, scale: original.scale });
    expect(selection).toEqual([copy.id]);
    expect(getView().sheet).toBe(s2);
    expect(problems()).toEqual(valid);
    expect(heard()).toBe('Se duplicó la pieza en la hoja 2. Hay 13 piezas.');
  });

  test('«Rellenar con copias» on the second sheet says which sheet it replaces, fills it and says so', () => {
    const { s2, on2 } = twelve();
    setSelection([on2[0]]);
    const { asset } = item(on2[0]);
    const summary = fillSummary(item(on2[0]));
    expect(summary).toEqual({ text: '9 copias en la hoja 2', warning: 'Reemplaza las piezas de la hoja 2 por copias de esta. Las demás hojas no cambian. Puedes deshacerlo.', ok: true });
    expect(fillWithCopies()).toBe(true);
    const filled = itemsOn(s2);
    expect(filled).toHaveLength(9);
    expect(new Set(filled.map((it) => it.asset))).toEqual(new Set([asset]));
    // The other pieces of the sheet were replaced: the notice offers them back.
    expect(getView().flash).toMatchObject({ text: 'Se rellenó la hoja 2 con 9 copias', action: { label: 'Deshacer' } });
    getView().flash!.action!.run();
    expect(itemsOn(s2).map((it) => it.id)).toEqual(on2);
  });
});

// ---------- Notices that name the sheet ----------

describe('notices with several sheets', () => {
  test('a piece off the second sheet: «Hoja 2: 1 pieza se sale de la hoja y se corta al imprimir»; two sheets with such pieces: «Hojas 1 y 2: …»', () => {
    const key = cards(0, 1)[0];
    resetState({
      sheets: [{ id: 1 }, { id: 2 }],
      items: [piece(1, key, 20, 20), piece(2, key, -20, 20, { sheet: 2 })],
    });
    render(createElement(NoticePill));
    const text = () => (document.getElementById('pill-text')?.textContent ?? '').replace(/ /g, ' ');
    expect(document.getElementById('pill')!.dataset.tone).toBe('warning');
    expect(text()).toBe('Hoja 2: 1 pieza se sale de la hoja y se corta al imprimir');
    act(() => setDocument({ items: [piece(1, key, 180, 20), piece(2, key, -20, 20, { sheet: 2 })] }));
    expect(text()).toBe('Hojas 1 y 2: 2 piezas se salen de la hoja y se cortan al imprimir');
  });
});
