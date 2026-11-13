// @vitest-environment jsdom
// Units and the measurement fields' actions on the real stores:
//   - the unit is a preference of this browser, never part of the document:
//     switching it changes no piece, no undo step, no saved project, no PDF;
//   - X and Y keep the piece's center on the sheet (lengthFieldRange,
//     setLengthField); width and height keep the scale within 1–1000 %;
//   - arrows and announcements in inches;
//   - the custom paper's sides (setPaperSide) with undo and redo, and
//     «Personalizado» remembering the last custom size.
import { PDFArray, PDFDocument, PDFRawStream, type PDFPage } from 'pdf-lib';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from '../../src/core/projectstore.js';
import { stepFor } from '../../src/core/units.js';
import type { ProjectStorage } from '../../src/core/types.ts';
import { makePdf } from '../../src/services/export.ts';
import { lengthValue, paperTitle, sizeText } from '../../src/services/measure.ts';
import { addAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument, useDocument } from '../../src/state/document.ts';
import { cancelEdit, historyDepth, redo, undo } from '../../src/state/history.ts';
import { getPrefs, setGrid, setUnit } from '../../src/state/prefs.ts';
import { sheetProblems, sheetSize } from '../../src/state/selectors.ts';
import { printResolution } from '../../src/state/actions/layout.ts';
import { lengthFieldRange, lengthFieldValue, nudge, setLengthField } from '../../src/state/actions/pieces.ts';
import { choosePaper, setGridVisible, setPaperSide } from '../../src/state/actions/sheets.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

// The project service opens this storage instead of IndexedDB (see the autosave test).
const opened = vi.hoisted(() => ({ storage: null as ProjectStorage | null }));
vi.mock('../../src/services/storage/idb.ts', () => ({
  openIdbStorage: async () => opened.storage,
  openExistingIdbStorage: async () => null,
  deleteIdb: async () => {},
}));
// jsdom has no canvas: no thumbnails.
vi.mock('../../src/services/thumbnail.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/thumbnail.ts')>()),
  drawThumbnail: async () => null,
}));

/** A real 1 × 1 px PNG (pdf-lib has to embed it). */
const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

const plain = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');

/** What the polite live region says once the pending announcements went out. */
function heard() {
  vi.advanceTimersByTime(1000);
  return plain(document.getElementById('live-polite')!.textContent).trim();
}

/** The old suite's small.jpg: 800 × 600 px at 300 ppi (67,7 × 50,8 mm), selected, at (x, y). */
function smallPiece(x = 10, y = 10) {
  const key = fakeImage({ name: 'small.jpg', px: [800, 600], format: 'jpg' });
  setDocument({ items: [piece(1, key, x, y)], selection: [1] });
  return key;
}
const W_SMALL = (800 / 300) * 25.4;

const item = () => getDocument().items[0];
const sheetLabel = () => plain(`${paperTitle()} · ${sizeText(...sheetSize())}`);

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
});

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetState();
});

afterEach(() => {
  vi.runAllTimers(); // nothing announced leaks into the next test
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const id of ['live-polite', 'live-assertive']) document.getElementById(id)!.textContent = '';
});

describe('the unit lives in the preferences, not in the document', () => {
  /** The document's data (what is saved), as text. */
  const docText = () => {
    const { sheets, items, selection, paper, landscape, margin, gap, cuts, rotate } = getDocument();
    return JSON.stringify({ sheets, items, selection, paper, landscape, margin, gap, cuts, rotate });
  };
  /** Each page of the PDF: its size and its content streams (dates in the metadata differ, the pages must not). */
  const pdfPages = async () => {
    const doc = await PDFDocument.load(await makePdf(), { updateMetadata: false });
    const content = (page: PDFPage) => {
      const contents = page.node.Contents();
      const refs = !contents ? [] : contents instanceof PDFArray ? contents.asArray() : [contents];
      return refs.map((ref) => Buffer.from((doc.context.lookup(ref) as PDFRawStream).contents).toString('hex')).join('|');
    };
    return { title: doc.getTitle(), pages: doc.getPages().map((page) => ({ ...page.getSize(), content: content(page) })) };
  };

  test('mm → cm → in → mm: the document, the undo history and the PDF stay exactly the same, and the document store is never touched', async () => {
    const key = addAsset({ kind: 'image', name: 'dot.png', src: 1, px: [1, 1], w: 67.7, h: 50.8, bytes: PNG, preview: new Blob(), url: 'blob:test', format: 'png', dpi: 300, derived: false });
    setDocument({ items: [piece(1, key, 10, 10)], selection: [1] });
    setDocument({ margin: 12.5 });
    const before = { doc: docText(), depth: historyDepth(), pdf: await pdfPages() };
    const changes = vi.fn();
    const stop = useDocument.subscribe(changes);
    for (const unit of ['cm', 'in', 'mm'] as const) setUnit(unit);
    stop();
    expect(changes).not.toHaveBeenCalled();
    expect(docText()).toBe(before.doc);
    expect(historyDepth()).toEqual(before.depth);
    expect(await pdfPages()).toEqual(before.pdf);
  });

  test('switching the unit saves nothing: the stored project keeps its document and its date', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const storage = memoryStorage();
    opened.storage = storage;
    // The service keeps the open project in module state: fresh modules, and only those.
    vi.resetModules();
    const projects = await import('../../src/services/projects.ts');
    const prefs = await import('../../src/state/prefs.ts');
    const { setDocument: set } = await import('../../src/state/document.ts');
    const { useProject } = await import('../../src/state/project.ts');
    const support = await import('../support/state.ts');
    support.resetState();
    await projects.initProjects({ notify: () => {} });
    set({ items: [support.piece(1, support.fakeImageMm(40, 30), 20, 20)], selection: [1] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(useProject.getState().status).toBe('saved');
    const id = projects.projectSession().record!.id;
    const before = await storage.get(id);

    for (const unit of ['cm', 'in', 'mm'] as const) {
      prefs.setUnit(unit);
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(useProject.getState().status).toBe('saved');
    const after = await storage.get(id);
    expect(after!.modified).toBe(before!.modified);
    expect(JSON.stringify(after!.doc)).toBe(JSON.stringify(before!.doc));
  });

  test('the unit is remembered in this browser and read back on start; an unknown one means mm', async () => {
    // A start: the preferences module loads again and reads localStorage.
    const unitOnStart = async () => {
      vi.resetModules();
      return (await import('../../src/state/prefs.ts')).getPrefs().unit;
    };
    setUnit('in');
    expect(localStorage.getItem('scooch:unit-preference')).toBe('in');
    expect(await unitOnStart()).toBe('in');
    localStorage.setItem('scooch:unit-preference', 'pt');
    expect(await unitOnStart()).toBe('mm');
    // @ts-expect-error an unknown unit is ignored
    setUnit('pt');
    expect(getPrefs().unit).toBe('in');
  });

  test('the scale and the print resolution don’t depend on the unit', () => {
    smallPiece();
    const before = { scale: item().scale, resolution: printResolution(item()) };
    for (const unit of ['cm', 'in'] as const) {
      setUnit(unit);
      expect({ scale: item().scale, resolution: printResolution(item()) }, unit).toEqual(before);
    }
    expect(before.resolution).toEqual({ ppp: 300, level: 'good' });
  });
});

describe('X and Y fields: a piece may stick out of the sheet, but its center stays on it', () => {
  test('X 500 → the field’s maximum puts the center on the right edge; the minimum, on the left one', () => {
    smallPiece();
    const range = lengthFieldRange('x')!;
    expect(range.max).toBeCloseTo(210 - W_SMALL / 2, 9);
    expect(range.min).toBeCloseTo(-W_SMALL / 2, 9);
    expect(plain(lengthValue(range.max))).toBe('176,1');
    const y = lengthFieldRange('y')!;
    expect(y.max).toBeCloseTo(297 - 50.8 / 2, 9);
  });

  test('confirming the maximum leaves it there, in one undo step, and the piece is reported off the sheet', () => {
    smallPiece();
    expect(sheetProblems().cut.count).toBe(0);
    const { max } = lengthFieldRange('x')!;
    setLengthField('x', max, { final: false });
    setLengthField('x', max, { final: true });
    expect(item().x).toBeCloseTo(max, 9);
    expect(item().x + W_SMALL / 2).toBeCloseTo(210, 9);
    expect(historyDepth().undo).toBe(1);
    expect(sheetProblems().cut).toEqual({ count: 1, sheets: [0] });
  });

  test('a value beyond the range is held at it by the action too (the center never leaves the sheet)', () => {
    smallPiece();
    setLengthField('x', 500, { final: true });
    expect(item().x + W_SMALL / 2).toBeCloseTo(210, 9);
    setLengthField('y', -500, { final: true });
    expect(item().y + 50.8 / 2).toBeCloseTo(0, 9);
  });

  test('cm: width 0 stays at the minimum (scale 1 %), shown as 0,07 cm, in one undo step', () => {
    smallPiece();
    setUnit('cm');
    const range = lengthFieldRange('width')!;
    expect(range.min).toBeCloseTo(W_SMALL / 100, 9);
    expect(range.max).toBeCloseTo(W_SMALL * 10, 9);
    // 0 itself isn't a width: nothing changes.
    setLengthField('width', 0, { final: true });
    expect(item().scale).toBe(100);
    expect(historyDepth().undo).toBe(0);
    // What the field keeps when 0 is confirmed: its minimum.
    setLengthField('width', range.min, { final: true });
    expect(item().scale).toBeCloseTo(1, 9);
    expect(plain(lengthValue(lengthFieldValue('width')!))).toBe('0,07');
    expect(historyDepth().undo).toBe(1);
  });
});

describe('inches', () => {
  test('16 arrow steps of 1/16 in move exactly 1 in, and the position is announced in inches', () => {
    smallPiece(25.4, 25.4);
    setUnit('in');
    const step = stepFor('in', 'normal').mm;
    for (let i = 0; i < 16; i++) nudge(step, 0);
    expect(item().x).toBeCloseTo(50.8, 9);
    expect(plain(lengthValue(item().x))).toBe('2');
    expect(heard()).toBe('A 2 in del borde izquierdo y 1 in del superior.');
  });

  test('Shift moves 1/2 in, Alt 1/64 in', () => {
    smallPiece(50.8, 25.4);
    setUnit('in');
    nudge(-stepFor('in', 'coarse').mm, 0);
    expect(item().x).toBeCloseTo(38.1, 9);
    expect(plain(lengthValue(item().x))).toBe('1,5');
    nudge(-stepFor('in', 'fine').mm, 0);
    expect(plain(lengthValue(item().x))).toBe('1,484');
    expect(heard()).toBe('A 1,484 in del borde izquierdo y 1 in del superior.');
  });

  test('showing the grid announces its size in inches: «Grilla visible, cada 0,197 in» for 5 mm', () => {
    setGrid({ size: 5 });
    setUnit('in');
    setGridVisible(true);
    expect(heard()).toBe('Grilla visible, cada 0,197 in.');
  });
});

describe('custom paper sides (setPaperSide)', () => {
  /** A4 landscape made custom, then 297 × 20 mm: where the old suite stood before typing 123,4 × 170. */
  function custom297x20() {
    setDocument({ landscape: true });
    choosePaper('custom');
    setPaperSide('h', 20, { final: true });
    expect(sheetLabel()).toBe('Personalizado · 297 × 20 mm');
  }

  test('each confirmed side is one undo step: undo brings back the height, then the width; redo both', () => {
    custom297x20();
    const depth = historyDepth().undo;
    setPaperSide('w', 123.4, { final: true });
    setPaperSide('h', 170, { final: true });
    expect(sheetLabel()).toBe('Personalizado · 123,4 × 170 mm');
    expect(getDocument().landscape).toBe(false);
    expect(historyDepth().undo).toBe(depth + 2);
    undo();
    expect(sheetLabel()).toBe('Personalizado · 123,4 × 20 mm');
    expect(getDocument().landscape).toBe(true);
    undo();
    expect(sheetLabel()).toBe('Personalizado · 297 × 20 mm');
    redo();
    redo();
    expect(sheetLabel()).toBe('Personalizado · 123,4 × 170 mm');
  });

  test('typing previews every value and the whole edit is one undo step', () => {
    custom297x20();
    const depth = historyDepth().undo;
    for (const mm of [1, 12, 123, 123.4]) if (mm >= 20) setPaperSide('w', mm);
    expect(sheetSize()).toEqual([123.4, 20]);
    setPaperSide('w', 123.4, { final: true });
    expect(historyDepth().undo).toBe(depth + 1);
  });

  test('a side out of range (or not a number) changes nothing', () => {
    custom297x20();
    const depth = historyDepth().undo;
    setPaperSide('w', 5, { final: true });
    setPaperSide('h', 2500, { final: true });
    setPaperSide('h', Number.NaN, { final: true });
    expect(sheetSize()).toEqual([297, 20]);
    expect(historyDepth().undo).toBe(depth);
  });

  test('the sides decide the orientation: 200 × 250 is portrait, 300 × 250 landscape', () => {
    choosePaper('custom');
    setPaperSide('w', 200, { final: true });
    setPaperSide('h', 250, { final: true });
    expect([sheetLabel(), getDocument().landscape]).toEqual(['Personalizado · 200 × 250 mm', false]);
    setPaperSide('w', 300, { final: true });
    expect([sheetLabel(), getDocument().landscape]).toEqual(['Personalizado · 300 × 250 mm', true]);
  });

  test('«Personalizado» remembers the last custom paper (a preference of this browser), also after choosing a preset', () => {
    choosePaper('custom');
    expect(sheetSize()).toEqual([210, 297]); // without a saved one: the current size
    setPaperSide('w', 111, { final: true });
    expect(JSON.parse(localStorage.getItem('scooch:custom-paper')!)).toEqual({ w: 111, h: 297 });
    choosePaper('A5');
    expect(sheetLabel()).toBe('A5 · 148 × 210 mm');
    choosePaper('custom');
    expect(sheetSize()).toEqual([111, 297]);
    expect(sheetLabel()).toBe('Personalizado · 111 × 297 mm');
  });

  test('the last custom paper is remembered only when a side is confirmed: not what is typed meanwhile, nor an edit undone with Esc', () => {
    choosePaper('custom');
    setPaperSide('w', 111, { final: true });
    const saved = () => JSON.parse(localStorage.getItem('scooch:custom-paper')!);
    for (const mm of [29, 297]) setPaperSide('h', mm);
    expect(sheetSize()).toEqual([111, 297]);
    expect(saved(), 'typing previews on the sheet only').toEqual({ w: 111, h: 297 });
    setPaperSide('h', 29);
    // Esc in the field: the edit is canceled (see NumberField's revert).
    expect(cancelEdit('paper:custom')).toBe(true);
    expect(sheetSize()).toEqual([111, 297]);
    expect(saved()).toEqual({ w: 111, h: 297 });
    setPaperSide('h', 250);
    setPaperSide('h', 250, { final: true });
    expect(saved()).toEqual({ w: 111, h: 250 });
  });
});
