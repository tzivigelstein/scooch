// Adding files (button, drop zone, pasting) and changing a PDF piece's page.

import { MAX_ITEMS } from '../../config.ts';
import { formatList, t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { FileProblem, openPdf, pdfPage, readFile, withHashes } from '../../services/assets.ts';
import { addAsset, assetEntries, getAsset } from '../assets.ts';
import { getDocument, patchItems, setDocument, type Piece } from '../document.ts';
import { commit } from '../history.ts';
import { selectedItem, sheetIndex } from '../selectors.ts';
import { flushUi } from '../flush.ts';
import { revealPieces } from '../../components/canvas/viewport.ts';
import { getView, setView } from '../view.ts';
import { addedAgain } from '../tips.ts';
import { say } from './notify.ts';
import { placeNew } from './layout.ts';

/** Two PDF pages this close (mm) have the same size: a crop carries over. */
const PAGE_SIZE_TOLERANCE = 0.05;

/** A notice of work in progress shows once the work has lasted this long (ms): quicker work shows nothing. */
export const BUSY_SHOW_DELAY = 200;
/** Once shown, it stays at least this long (ms), so it never blinks. */
export const BUSY_MIN_SHOWN = 400;

const busyPill = {
  show: undefined as ReturnType<typeof setTimeout> | undefined,
  /** Running while the notice is shown and hasn't been there BUSY_MIN_SHOWN yet. */
  held: undefined as ReturnType<typeof setTimeout> | undefined,
};

/** There is work in progress with something to say. */
const working = () => getDocument().busy && getView().busyText !== '';

/**
 * Something is loading: actions wait at once (busy), and the pill says
 * `text` once the work has lasted BUSY_SHOW_DELAY, then for BUSY_MIN_SHOWN at
 * least (busyNotice). Work without a text shows nothing meanwhile.
 */
export function setBusy(on: boolean, text = '') {
  setDocument({ busy: on });
  setBusyText(on ? text : '');
}

/** What the work in progress says now; a notice already shown says it at once. */
export function setBusyText(text: string) {
  setView({ busyText: text });
  const shown = getView().busyNotice !== '';
  if (working()) {
    if (shown) setView({ busyNotice: text });
    else busyPill.show ??= setTimeout(showBusy, BUSY_SHOW_DELAY);
    return;
  }
  clearTimeout(busyPill.show);
  busyPill.show = undefined;
  if (shown && !busyPill.held) setView({ busyNotice: '' });
}

function showBusy() {
  busyPill.show = undefined;
  if (!working()) return;
  setView({ busyNotice: getView().busyText });
  busyPill.held = setTimeout(() => {
    busyPill.held = undefined;
    if (!working()) setView({ busyNotice: '' });
  }, BUSY_MIN_SHOWN);
}

/** Opens the browser's file picker. */
export function openFiles() {
  if (getDocument().busy) return;
  document.getElementById('file')?.click();
}

export async function loadFiles(files: readonly File[]) {
  if (!files.length || getDocument().busy) return;
  const errors: string[] = [];
  const keys: string[] = [];
  let skipped = 0; // the ones over the piece limit
  // The files already in the project (by their content), and how many come again.
  const present = new Set(getDocument().items.map((item) => getAsset(item.asset).hashes?.src));
  let again = 0;
  setBusy(true, t('busy.loading'));
  for (const [i, file] of files.entries()) {
    if (getDocument().items.length + keys.length >= MAX_ITEMS) {
      skipped = files.length - i;
      break;
    }
    setBusyText(files.length > 1 ? t('busy.loadingCount', { i: i + 1, n: files.length }) : t('busy.loadingFile', { name: file.name }));
    try {
      const asset = await readFile(file);
      if (asset.hashes && present.has(asset.hashes.src)) again++;
      keys.push(addAsset(asset));
    } catch (err) {
      console.warn(file.name, err);
      // An unexpected failure (a chunk that didn't load, the browser's canvas) isn't explained in its own words.
      const reason = err instanceof FileProblem ? err.message : t('errors.file.processFailed');
      errors.push(t('errors.loadItem', { name: file.name || t('errors.unnamedFile'), reason }));
    }
  }
  const before = new Set(getDocument().items.map((item) => item.id));
  if (keys.length) {
    commit(); // still busy: the cleanup leaves the assets just created alone
    placeNew(keys);
  }
  setBusy(false);
  const failed = errors.length + skipped;
  if (skipped) errors.push(t('errors.maxReached', { max: MAX_ITEMS, n: skipped }));
  if (errors.length) say(t('errors.load', { n: failed, list: errors.join(t('errors.loadSeparator')) }), { warn: true });
  if (keys.length) showAdded(getDocument().items.filter((item) => !before.has(item.id)), { quiet: errors.length > 0 });
  addedAgain(again);
}

/**
 * What was just added comes into view: the view goes there if it is out of
 * sight (a full sheet sends it to the next one); on several sheets, to the
 * first one. The last one added is selected (placeNew). On one sheet, that
 * sheet is announced; on several, the notice says which (unless `quiet`:
 * another notice, like a file that failed, has to stay).
 */
function showAdded(fresh: readonly Piece[], { quiet = false } = {}) {
  const ids = fresh.map((item) => item.id);
  flushUi();
  revealPieces(ids, ids[0]);
  const n = ids.length;
  const sheets = [...new Set(fresh.map((item) => sheetIndex(item.sheet) + 1))].sort((a, b) => a - b);
  if (sheets.length === 1) return announce(t('announce.addedTo', { n, i: sheets[0] }));
  const text = t('notices.addedOnSheets', { n, list: formatList(sheets) });
  if (quiet) announce(text);
  else say(text);
}

/** Files from a drop or a paste. */
export const filesFrom = (data: DataTransfer | null) => (data ? [...data.files] : []);

// Changing the page creates (or reuses) another asset, so undo goes back to the previous one.
export async function changePage(n: number) {
  const item = selectedItem();
  const asset = item && getAsset(item.asset);
  if (!item || !asset || asset.kind !== 'pdf' || asset.page === n || getDocument().busy) return;
  setBusy(true, t('busy.loadingPage', { page: n }));
  try {
    // In a restored project, pdf.js opens only now (and stays for the other pages).
    if (!asset.pdf) {
      const pdf = await openPdf(asset.bytes);
      for (const [, other] of assetEntries()) if (other.kind === 'pdf' && other.src === asset.src) other.pdf = pdf;
    }
    let key = assetEntries().find(([, a]) => a.kind === 'pdf' && a.src === asset.src && a.page === n)?.[0];
    // Another page shares its source file (and its hash).
    key ??= addAsset(await withHashes({ ...(await pdfPage({ name: asset.name, src: asset.src, pdf: asset.pdf!, bytes: asset.bytes }, n)), hashes: asset.hashes && { src: asset.hashes.src, preview: '' } }));
    // The crop stays when the new page has the same size; otherwise it would frame something else.
    const page = getAsset(key);
    const sameSize = Math.abs(page.w - asset.w) < PAGE_SIZE_TOLERANCE && Math.abs(page.h - asset.h) < PAGE_SIZE_TOLERANCE;
    const dropCrop = !!item.crop && !sameSize;
    commit();
    patchItems(new Map([[item.id, dropCrop ? { asset: key, crop: null } : { asset: key }]]));
    setBusy(false);
    // The whole page shows: said, not noticed.
    if (dropCrop) announce(t('notices.pageCropDropped', { page: n }));
  } catch (err) {
    console.error(err);
    setBusy(false);
    say(t('errors.page', { page: n }), { warn: true });
  }
}
