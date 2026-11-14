// Download and print the PDF. The PDF starts right away; meanwhile the advice
// on printing at real size shows (unless turned off), and its button is the
// gesture that prints or downloads. Once the person is back (the print dialog
// closed, the download started), the summary of what the PDF saves shows
// (unless turned off), with the request for a donation folded in, and the
// focus goes back to whoever started it when it closes.

import { t } from '../../copy/index.ts';
import { askTip, isTipOpen, shouldShowTip, type OutputKind } from '../../components/dialogs/printTip.ts';
import { takeDonationAsk } from '../../components/dialogs/donate.ts';
import { closeSummary, showSummary, usePrintSummary, type PrintSummary } from '../../components/feedback/printSummary.ts';
import { equivalent, sheetSavings, sheetUsage, suggestArrange, tangibleFacts, LOW_USAGE } from '../../core/savings.js';
import { makePdf, pdfContentKey, pdfFileName } from '../../services/export.ts';
import { downloadBytes, printBytes } from '../../services/print.ts';
import { getDocument } from '../document.ts';
import { getPrefs } from '../prefs.ts';
import { setView } from '../view.ts';
import { recordSavings } from '../savings.ts';
import { area, boxOf, itemsOn } from '../selectors.ts';
import { setBusy } from './files.ts';
import { sheetsNeeded } from './layout.ts';
import { say } from './notify.ts';

/** One print or download at a time: from the key or the click until the person is back. */
let outputting = false;

const canExport = () => getDocument().items.length > 0 && !getDocument().busy && !isTipOpen() && !outputting;

/** The PDF's bytes once made (or null, saying it couldn't be), with the pill saying it meanwhile. */
async function finished(job: Promise<Uint8Array>, busyText: string) {
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

/**
 * What the PDF that just went out (`key`, see pdfContentKey) saves, and counts
 * it on this device once: `countAs` a download (a file: into the total now)
 * or a print (nothing confirms it: later, see core/savings.js countPdf).
 */
export function summarize(kind: OutputKind, key: string, countAs: OutputKind = kind): PrintSummary {
  const { sheets, items } = getDocument();
  const printed = sheets.map((sheet) => itemsOn(sheet.id)).filter((list) => list.length);
  const { W, H, m, aw, ah } = area();
  const share = sheetUsage(printed.map((list) => list.map(boxOf)), { x: m, y: m, w: aw, h: ah }) ?? 0;
  const { used, baseline, saved } = sheetSavings(items.length, printed.length);
  const { total, turn, added, milestone } = recordSavings(saved, key, countAs);
  // The packing check costs a little: only when a fuller arrangement could be worth suggesting.
  const suggest = share < LOW_USAGE && suggestArrange(share, used, sheetsNeeded());
  return {
    kind,
    share,
    used,
    baseline,
    saved,
    equivalent: equivalent(turn, tangibleFacts(saved, W, H)),
    total,
    // On this paper: the total doesn't keep the size of each sheet it counted.
    totalEquivalent: equivalent(turn, tangibleFacts(total, W, H)),
    milestone,
    suggest,
    ask: false,
    key,
    added,
  };
}

/**
 * Once the person is back: the summary (unless turned off). `note`: where the
 * PDF went, if it didn't go to the print dialog; the summary says it (instead
 * of the notice), or the notice does. `opener`: where the focus returns.
 * `countAs`: see summarize.
 */
function summaryAfter(kind: OutputKind, key: string, opener: Element | null, note?: string, countAs: OutputKind = kind) {
  const summary = summarize(kind, key, countAs);
  if (!getPrefs().printing.summary) {
    if (note) say(note, kind === 'print' ? { persist: true, info: true } : {});
    return;
  }
  if (note) setView({ flash: null });
  showSummary({ ...summary, note, ask: takeDonationAsk() }, opener);
}

async function output(kind: OutputKind) {
  if (!canExport()) return;
  outputting = true;
  try {
    await sendOut(kind);
  } finally {
    outputting = false;
  }
}

async function sendOut(kind: OutputKind) {
  // Started from inside an open summary, the focus goes back where that one would have.
  const opener = usePrintSummary.getState().summary ? usePrintSummary.getState().returnTo : document.activeElement;
  closeSummary();
  const fileName = pdfFileName();
  const key = pdfContentKey();
  const job = makePdf();
  job.catch(() => {}); // handled once it is needed
  if (shouldShowTip() && !(await askTip(kind))) return;
  const bytes = await finished(job, t(kind === 'print' ? 'busy.print' : 'busy.pdf'));
  if (!bytes) return;
  setBusy(false);
  if (kind === 'download') {
    downloadBytes(bytes, fileName);
    summaryAfter(kind, key, opener, t('notices.downloaded', { file: fileName }));
    return;
  }
  const { how, back } = await printBytes(bytes, fileName);
  // In the print dialog the advice was already given; elsewhere, where the PDF went (said now, and in the summary).
  const note = how === 'tab' ? t('notices.printTab') : how === 'download' ? t('notices.printDownload', { file: fileName }) : undefined;
  if (note) say(note, { persist: true, info: true });
  await back;
  // Downloaded instead of printed, the file exists just as with «Descargar PDF».
  summaryAfter(kind, key, opener, note, how === 'download' ? 'download' : 'print');
}

export const exportPdf = () => output('download');

/** Prints the same PDF that downloads, without going through the download. */
export const printPdf = () => output('print');
