// @vitest-environment jsdom
// What printing and downloading say in the pill (printPdf, exportPdf), with
// the PDF and the browser's side faked: how the PDF reached the printer
// (the print dialog, another tab or a download) picks the notice, and every
// print notice persists (it stays until the next action: the tip is needed
// while the print dialog is open). That a persisted notice stays on screen is
// NoticePill.test.tsx's.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { setDocument } from '../../src/state/document.ts';
import { getView } from '../../src/state/view.ts';
import { exportPdf, printPdf } from '../../src/state/actions/output.ts';
import { downloadBytes, printBytes } from '../../src/services/print.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

vi.mock('../../src/services/export.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/export.ts')>()),
  makePdf: async () => PDF,
}));
vi.mock('../../src/services/print.ts', () => ({ printBytes: vi.fn(), downloadBytes: vi.fn() }));

beforeEach(() => {
  vi.mocked(printBytes).mockReset();
  vi.mocked(downloadBytes).mockReset();
  resetState({ items: [piece(1, fakeImage({ name: 'small.jpg' }), 20, 20)] });
});

/** The copy puts non-breaking spaces between numbers and units. */
const norm = (s: string | undefined) => String(s ?? '').replace(/ /g, ' ');
const flash = () => {
  const f = getView().flash;
  return f && { ...f, text: norm(f.text) };
};

describe('printing', () => {
  test('in the print dialog: the tip with the paper, as information, persisted', async () => {
    vi.mocked(printBytes).mockResolvedValue('dialog');
    await printPdf();
    expect(printBytes).toHaveBeenCalledWith(PDF, 'scooch-a4.pdf');
    expect(flash()).toEqual({ text: 'En el diálogo de impresión, elige «Tamaño real» o «100 %» y el papel A4', persist: true, info: true });
  });

  test('in another tab: it says so and how to print from there, persisted', async () => {
    vi.mocked(printBytes).mockResolvedValue('tab');
    await printPdf();
    expect(flash()).toEqual({ text: 'Se abrió el PDF en otra pestaña. Imprímelo desde ahí con «Tamaño real» o «100 %» y el papel A4.', persist: true, info: false });
  });

  test('downloaded instead: the file’s name and how to print it, persisted', async () => {
    vi.mocked(printBytes).mockResolvedValue('download');
    await printPdf();
    expect(flash()).toEqual({ text: 'Se descargó scooch-a4.pdf. Ábrelo e imprímelo con «Tamaño real» o «100 %» y el papel A4.', persist: true, info: false });
  });

  test('the paper in the tip and in the file’s name is the document’s', async () => {
    setDocument({ paper: 'A3' });
    vi.mocked(printBytes).mockResolvedValue('download');
    await printPdf();
    expect(printBytes).toHaveBeenCalledWith(PDF, 'scooch-a3.pdf');
    expect(flash()?.text).toBe('Se descargó scooch-a3.pdf. Ábrelo e imprímelo con «Tamaño real» o «100 %» y el papel A3.');
  });

  test('with no pieces nothing is printed or said', async () => {
    resetState();
    await printPdf();
    expect(printBytes).not.toHaveBeenCalled();
    expect(getView().flash).toBeNull();
  });
});

describe('downloading', () => {
  test('the same PDF downloads as scooch-a4.pdf, and the tip goes away on its own (not persisted)', async () => {
    await exportPdf();
    expect(downloadBytes).toHaveBeenCalledWith(PDF, 'scooch-a4.pdf');
    expect(flash()).toEqual({ text: 'Se descargó scooch-a4.pdf. Al imprimirlo, elige «Tamaño real» o «100 %».' });
  });
});
