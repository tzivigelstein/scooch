// Download and print the PDF (the donation dialog may show meanwhile).

import { t } from '../../copy/index.ts';
import { askDonation, isDonationOpen, shouldAskDonation } from '../../components/dialogs/donate.ts';
import { makePdf, pdfFileName } from '../../services/export.ts';
import { paperName } from '../../services/measure.ts';
import { downloadBytes, printBytes } from '../../services/print.ts';
import { getDocument } from '../document.ts';
import { setBusy } from './files.ts';
import { say } from './notify.ts';

/**
 * Starts the PDF right away and, if it applies, shows the donation dialog
 * while it is built. Returns the bytes (or null if it couldn't be built) once
 * the dialog closed by any means: the export always goes on.
 */
async function preparePdf(busyText: string) {
  const job = makePdf();
  job.catch(() => {}); // handled below, after the dialog
  if (shouldAskDonation()) await askDonation();
  setBusy(true, busyText);
  try {
    return await job;
  } catch (err) {
    console.error(err);
    setBusy(false);
    say(t('errors.pdf'), { warn: true });
    return null;
  }
}

const canExport = () => getDocument().items.length > 0 && !getDocument().busy && !isDonationOpen();

export async function exportPdf() {
  if (!canExport()) return;
  const fileName = pdfFileName();
  const bytes = await preparePdf(t('busy.pdf'));
  if (!bytes) return;
  downloadBytes(bytes, fileName);
  setBusy(false);
  say(t('notices.downloaded', { file: fileName }));
}

/** Prints the same PDF that downloads, without going through the download. */
export async function printPdf() {
  if (!canExport()) return;
  const fileName = pdfFileName();
  const bytes = await preparePdf(t('busy.print'));
  if (!bytes) return;
  setBusy(false);
  const how = await printBytes(bytes, fileName);
  const key = ({ dialog: 'notices.printDialog', tab: 'notices.printTab' } as const)[how as 'dialog' | 'tab'] ?? 'notices.printDownload';
  say(t(key, { paper: paperName(), file: fileName }), { persist: true });
}
