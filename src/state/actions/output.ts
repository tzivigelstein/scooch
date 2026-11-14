// Download and print the PDF. The PDF starts right away; meanwhile the advice
// on printing at real size shows (unless turned off), and its button is the
// gesture that prints or downloads. Once the person is back (the print dialog
// closed, the download done), the summary of what the PDF saves shows (unless
// turned off), with the request for a donation folded in.

import { t } from '../../copy/index.ts';
import { askTip, isTipOpen, shouldShowTip, type OutputKind } from '../../components/dialogs/printTip.ts';
import { takeDonationAsk } from '../../components/dialogs/donate.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { closeSummary, showSummary, type PrintSummary } from '../../components/feedback/printSummary.ts';
import { equivalent, milestoneReached, paperFacts, sheetSavings, sheetUsage, suggestArrange, LOW_USAGE } from '../../core/savings.js';
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

/** What the PDF that just went out (`key`, see pdfContentKey) saves, and counts it on this device once. */
export function summarize(kind: OutputKind, key: string): PrintSummary {
  const { sheets, items } = getDocument();
  const printed = sheets.map((sheet) => itemsOn(sheet.id)).filter((list) => list.length);
  const { W, H, m, aw, ah } = area();
  const share = sheetUsage(printed.map((list) => list.map(boxOf)), { x: m, y: m, w: aw, h: ah }) ?? 0;
  const { used, baseline, saved } = sheetSavings(items.length, printed.length);
  const { after, before, turn, added } = recordSavings(saved, key);
  // The packing check costs a little: only when a fuller arrangement could be worth suggesting.
  const suggest = share < LOW_USAGE && suggestArrange(share, used, sheetsNeeded());
  return {
    kind,
    share,
    used,
    baseline,
    saved,
    equivalent: saved ? equivalent(turn, paperFacts(saved, W, H)) : null,
    total: after,
    milestone: milestoneReached(before, after),
    suggest,
    ask: false,
    key,
    added,
  };
}

/**
 * Once the person is back: the summary (unless turned off), said to screen
 * readers too. `note`: where the PDF went, if it didn't go to the print
 * dialog; the summary says it (instead of the notice), or the notice does.
 */
function summaryAfter(kind: OutputKind, key: string, note?: string) {
  const summary = summarize(kind, key);
  if (!getPrefs().printing.summary) {
    if (note) say(note, kind === 'print' ? { persist: true, info: true } : {});
    return;
  }
  if (note) setView({ flash: null });
  showSummary({ ...summary, note, ask: takeDonationAsk() });
  const percent = t('summary.percent', { n: Math.round(summary.share * 100) });
  const parts = [...(note ? [note] : []), t('summary.usage', { n: summary.used, pct: percent })];
  if (summary.saved) parts.push(t('summary.sheets', { n: summary.used, baseline: summary.baseline }));
  announce(parts.join('. '));
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
    summaryAfter(kind, key, t('notices.downloaded', { file: fileName }));
    return;
  }
  const { how, back } = await printBytes(bytes, fileName);
  // In the print dialog the advice was already given; elsewhere, where the PDF went (said now, and in the summary).
  const note = how === 'tab' ? t('notices.printTab') : how === 'download' ? t('notices.printDownload', { file: fileName }) : undefined;
  if (note) say(note, { persist: true, info: true });
  await back;
  summaryAfter(kind, key, note);
}

export const exportPdf = () => output('download');

/** Prints the same PDF that downloads, without going through the download. */
export const printPdf = () => output('print');
