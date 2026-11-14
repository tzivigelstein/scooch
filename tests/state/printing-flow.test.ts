// @vitest-environment jsdom
// Printing and downloading (output.ts), with the PDF, the browser and the
// advice dialog faked: the PDF starts before the advice shows and goes out in
// the click of its button; closing it otherwise sends nothing; turned off, it
// goes straight out; nothing else exports meanwhile. What each way of
// printing says (no tip any more: the advice gave it), and the summary once
// the person is back, with what it counts on this device.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { usePrintSummary } from '../../src/components/feedback/printSummary.ts';
import { askTip } from '../../src/components/dialogs/printTip.ts';
import { makePdf } from '../../src/services/export.ts';
import { downloadBytes, printBytes } from '../../src/services/print.ts';
import { setDocument } from '../../src/state/document.ts';
import { setPrinting } from '../../src/state/prefs.ts';
import { getView } from '../../src/state/view.ts';
import { exportPdf, printPdf } from '../../src/state/actions/output.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

const tip = vi.hoisted(() => ({ answer: null as ((go: boolean) => void) | null }));
vi.mock('../../src/components/dialogs/printTip.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/components/dialogs/printTip.ts')>()),
  isTipOpen: () => tip.answer !== null,
  askTip: vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        tip.answer = (go) => {
          tip.answer = null;
          resolve(go);
        };
      })
  ),
}));
vi.mock('../../src/services/export.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/export.ts')>()),
  makePdf: vi.fn(async () => PDF),
}));
vi.mock('../../src/services/print.ts', () => ({ printBytes: vi.fn(), downloadBytes: vi.fn() }));

/** The copy puts non-breaking spaces between numbers and units. */
const norm = (s: string | undefined) => String(s ?? '').replace(/ /g, ' ');
const flash = () => {
  const f = getView().flash;
  return f && { ...f, text: norm(f.text) };
};
/** Lets the export reach the advice (and its answer reach the export). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  tip.answer = null;
  localStorage.clear();
  usePrintSummary.setState({ summary: null });
  vi.mocked(printBytes).mockResolvedValue({ how: 'dialog', back: Promise.resolve() });
  // Seven 60 × 60 mm pieces: 6 fit on the first A4 sheet (3 × 3 would need 190 mm), the 7th on a second.
  const key = fakeImageMm(60, 60, { name: 'foto.png' });
  const items = Array.from({ length: 7 }, (_, i) => piece(i + 1, key, 10 + (i % 3) * 62, 10 + Math.floor(i / 3) * 62, { sheet: i < 6 ? 1 : 2 }));
  resetState({ sheets: [{ id: 1 }, { id: 2 }], items: items.map((item, i) => (i === 6 ? { ...item, x: 10, y: 10 } : item)) });
});

describe('the advice before printing', () => {
  test('the PDF starts before the advice shows, and prints in the click of «Imprimir»', async () => {
    const printing = printPdf();
    await settle();
    expect(askTip).toHaveBeenCalledWith('print');
    expect(vi.mocked(makePdf).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(askTip).mock.invocationCallOrder[0]);
    expect(printBytes).not.toHaveBeenCalled();
    tip.answer!(true);
    await printing;
    expect(printBytes).toHaveBeenCalledWith(PDF, 'scooch-a4.pdf');
  });

  test('closed any other way (Cancelar, Esc), nothing prints or downloads, and nothing is said', async () => {
    for (const run of [printPdf, exportPdf]) {
      const going = run();
      await settle();
      tip.answer!(false);
      await going;
    }
    expect(printBytes).not.toHaveBeenCalled();
    expect(downloadBytes).not.toHaveBeenCalled();
    expect(getView().flash).toBeNull();
    expect(usePrintSummary.getState().summary).toBeNull();
  });

  test('downloading shows it too, and downloads in the click of «Descargar»', async () => {
    const downloading = exportPdf();
    await settle();
    expect(askTip).toHaveBeenCalledWith('download');
    tip.answer!(true);
    await downloading;
    expect(downloadBytes).toHaveBeenCalledWith(PDF, 'scooch-a4.pdf');
    // The summary says where it went (no notice besides it).
    expect(usePrintSummary.getState().summary?.note).toBe('Se descargó scooch-a4.pdf');
    expect(getView().flash).toBeNull();
  });

  test('without the summary, the notice says where it went', async () => {
    setPrinting({ tip: false, summary: false });
    await exportPdf();
    expect(flash()).toEqual({ text: 'Se descargó scooch-a4.pdf' });
  });

  test('turned off: it goes straight out', async () => {
    setPrinting({ tip: false });
    await printPdf();
    expect(askTip).not.toHaveBeenCalled();
    expect(printBytes).toHaveBeenCalled();
  });

  test('while it shows, Imprimir and Descargar PDF do nothing more', async () => {
    const printing = printPdf();
    await settle();
    await printPdf();
    await exportPdf();
    expect(makePdf).toHaveBeenCalledTimes(1);
    expect(askTip).toHaveBeenCalledTimes(1);
    tip.answer!(true);
    await printing;
    expect(printBytes).toHaveBeenCalledTimes(1);
  });

  test('with no pieces nothing happens', async () => {
    resetState();
    await printPdf();
    expect(askTip).not.toHaveBeenCalled();
    expect(getView().flash).toBeNull();
  });
});

describe('what printing says', () => {
  beforeEach(() => setPrinting({ tip: false, summary: false }));

  test('in the print dialog: nothing (the advice was given before, and the dialog shows)', async () => {
    await printPdf();
    expect(getView().flash).toBeNull();
  });

  test('in another tab: where it went, persisted', async () => {
    vi.mocked(printBytes).mockResolvedValue({ how: 'tab', back: Promise.resolve() });
    await printPdf();
    expect(flash()).toEqual({ text: 'Se abrió el PDF en otra pestaña. Imprímelo desde ahí.', persist: true, info: true });
  });

  test('with the summary, where it went shows in the summary once the person is back (the notice goes)', async () => {
    setPrinting({ summary: true });
    vi.mocked(printBytes).mockResolvedValue({ how: 'tab', back: Promise.resolve() });
    await printPdf();
    expect(getView().flash).toBeNull();
    expect(usePrintSummary.getState().summary?.note).toBe('Se abrió el PDF en otra pestaña. Imprímelo desde ahí.');
  });

  test('downloaded instead: the file’s name, persisted', async () => {
    setDocument({ paper: 'A3' });
    vi.mocked(printBytes).mockResolvedValue({ how: 'download', back: Promise.resolve() });
    await printPdf();
    expect(printBytes).toHaveBeenCalledWith(PDF, 'scooch-a3.pdf');
    expect(flash()).toEqual({ text: 'Se descargó scooch-a3.pdf. Ábrelo para imprimirlo.', persist: true, info: true });
  });
});

describe('the summary after', () => {
  beforeEach(() => setPrinting({ tip: false }));

  test('once the person is back from the print dialog: usage, 2 sheets instead of 7, an equivalent and the total, counted on this device', async () => {
    let back!: () => void;
    vi.mocked(printBytes).mockResolvedValue({ how: 'dialog', back: new Promise<void>((resolve) => (back = resolve)) });
    const printing = printPdf();
    await settle();
    expect(usePrintSummary.getState().summary, 'not while the print dialog is open').toBeNull();
    back();
    await printing;
    const summary = usePrintSummary.getState().summary!;
    expect(summary).toMatchObject({ kind: 'print', used: 2, baseline: 7, saved: 5, total: 5, milestone: null, ask: false });
    // 7 pieces of 60 × 60 mm over two printable areas of 190 × 277 mm.
    expect(summary.share).toBeCloseTo((7 * 3600) / (2 * 190 * 277), 3);
    expect(summary.equivalent).toMatchObject({ kind: 'grams' });
    expect(summary.equivalent!.value).toBeCloseTo(5 * 0.21 * 0.297 * 80, 6);
    expect(JSON.parse(localStorage.getItem('scooch:savings')!)).toEqual({ v: 1, sheets: 5, turn: 1 });
  });

  test('the next one adds to the total, with the next equivalent; reaching 10 is a milestone', async () => {
    await printPdf();
    await exportPdf();
    const summary = usePrintSummary.getState().summary!;
    expect(summary).toMatchObject({ kind: 'download', total: 10, milestone: 10 });
    expect(summary.equivalent?.kind).toBe('ream');
  });

  test('turned off: no summary (the total still counts)', async () => {
    setPrinting({ summary: false });
    await printPdf();
    expect(usePrintSummary.getState().summary).toBeNull();
    expect(JSON.parse(localStorage.getItem('scooch:savings')!).sheets).toBe(5);
  });

  test('a fuller arrangement is suggested only when little is used and packing surely takes a sheet fewer', async () => {
    // Two small pieces, each alone on its sheet: one sheet would do.
    const key = fakeImageMm(40, 40);
    resetState({ sheets: [{ id: 1 }, { id: 2 }], items: [piece(1, key, 20, 20, { sheet: 1 }), piece(2, key, 20, 20, { sheet: 2 })] });
    setPrinting({ tip: false });
    await printPdf();
    expect(usePrintSummary.getState().summary).toMatchObject({ used: 2, saved: 0, equivalent: null, suggest: true });
  });

  test('a well used sheet suggests nothing', async () => {
    const key = fakeImageMm(180, 260);
    resetState({ items: [piece(1, key, 15, 15)] });
    setPrinting({ tip: false });
    await printPdf();
    expect(usePrintSummary.getState().summary).toMatchObject({ used: 1, suggest: false });
  });

  test('it closes when the document changes (it was about the PDF that went out)', async () => {
    await printPdf();
    expect(usePrintSummary.getState().summary).not.toBeNull();
    setDocument({ items: [] });
    expect(usePrintSummary.getState().summary).toBeNull();
  });
});
