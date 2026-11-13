// @vitest-environment jsdom
// Printing and downloading while the donation dialog shows (output.ts): the
// PDF starts before the dialog opens, so it is ready (or nearly) when it
// closes; however it closes the export goes on; and while it is open nothing
// else exports. The dialog itself is faked: it opens when asked and closes
// when the test says how.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { askDonation } from '../../src/components/dialogs/donate.ts';
import { makePdf } from '../../src/services/export.ts';
import { downloadBytes, printBytes } from '../../src/services/print.ts';
import { exportPdf, printPdf } from '../../src/state/actions/output.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

const dialog = vi.hoisted(() => ({ close: null as ((via: string) => void) | null }));
vi.mock('../../src/components/dialogs/donate.ts', () => ({
  shouldAskDonation: () => true,
  isDonationOpen: () => dialog.close !== null,
  askDonation: vi.fn(
    () =>
      new Promise((resolve) => {
        dialog.close = (via) => {
          dialog.close = null;
          resolve(via);
        };
      })
  ),
}));
vi.mock('../../src/services/export.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/export.ts')>()),
  makePdf: vi.fn(async () => PDF),
}));
vi.mock('../../src/services/print.ts', () => ({ printBytes: vi.fn(async () => 'dialog'), downloadBytes: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  dialog.close = null;
  resetState({ items: [piece(1, fakeImage({ name: 'small.jpg' }), 20, 20)] });
});

/** Lets the export reach the dialog (and the dialog's closing reach the export). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('exporting with the donation dialog', () => {
  test('printing: the PDF starts before the dialog opens and prints as soon as it closes', async () => {
    const printing = printPdf();
    await settle();
    expect(askDonation).toHaveBeenCalledTimes(1);
    expect(makePdf).toHaveBeenCalledTimes(1);
    expect(vi.mocked(makePdf).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(askDonation).mock.invocationCallOrder[0]);
    expect(printBytes).not.toHaveBeenCalled();
    dialog.close!('skip');
    await printing;
    expect(printBytes).toHaveBeenCalledWith(PDF, 'scooch-a4.pdf');
    expect(makePdf).toHaveBeenCalledTimes(1);
  });

  test('downloading: however the dialog closes (CTA, skip, X, Esc, backdrop) the download goes on', async () => {
    for (const via of ['cta', 'skip', 'close', 'esc', 'backdrop']) {
      vi.mocked(downloadBytes).mockClear();
      const downloading = exportPdf();
      await settle();
      expect(downloadBytes, via).not.toHaveBeenCalled();
      dialog.close!(via);
      await downloading;
      expect(downloadBytes, via).toHaveBeenCalledWith(PDF, 'scooch-a4.pdf');
    }
  });

  test('while the dialog is open, Print and Descargar PDF do nothing more', async () => {
    const downloading = exportPdf();
    await settle();
    await printPdf();
    await exportPdf();
    expect(makePdf).toHaveBeenCalledTimes(1);
    expect(askDonation).toHaveBeenCalledTimes(1);
    dialog.close!('skip');
    await downloading;
    expect(downloadBytes).toHaveBeenCalledTimes(1);
    expect(printBytes).not.toHaveBeenCalled();
  });
});
