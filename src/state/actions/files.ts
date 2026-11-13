// Adding files (button, drop zone, pasting) and changing a PDF piece's page.

import { MAX_ITEMS } from '../../config.ts';
import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { openPdf, pdfPage, readFile } from '../../services/assets.ts';
import { addAsset, assetEntries, getAsset } from '../assets.ts';
import { getDocument, patchItems, setDocument } from '../document.ts';
import { commit } from '../history.ts';
import { selectedItem } from '../selectors.ts';
import { setView } from '../view.ts';
import { say } from './notify.ts';
import { placeNew } from './layout.ts';

/** Something is loading (actions wait and the pill says what). */
export function setBusy(on: boolean, text = '') {
  setDocument({ busy: on });
  setView({ busyText: text });
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
  setBusy(true, t('busy.loading'));
  for (const [i, file] of files.entries()) {
    if (getDocument().items.length + keys.length >= MAX_ITEMS) {
      skipped = files.length - i;
      break;
    }
    setView({ busyText: files.length > 1 ? t('busy.loadingCount', { i: i + 1, n: files.length }) : t('busy.loadingFile', { name: file.name }) });
    try {
      keys.push(addAsset(await readFile(file)));
    } catch (err) {
      console.warn(file.name, err);
      errors.push(t('errors.loadItem', { name: file.name || t('errors.unnamedFile'), reason: (err as Error).message }));
    }
  }
  const sheetsBefore = getDocument().sheets.length;
  if (keys.length) {
    commit(); // still busy: the cleanup leaves the assets just created alone
    placeNew(keys);
  }
  setDocument({ busy: false });
  const failed = errors.length + skipped;
  if (skipped) errors.push(t('errors.maxReached', { max: MAX_ITEMS, n: skipped }));
  if (errors.length) say(t('errors.load', { n: failed, list: errors.join(t('errors.loadSeparator')) }), { warn: true });
  if (keys.length) {
    const added = getDocument().sheets.length - sheetsBefore;
    const sheets = t('announce.newSheets', { n: added });
    announce(added ? t('announce.addedSheets', { n: keys.length, sheets }) : t('announce.added', { n: keys.length }));
  }
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
    key ??= addAsset(await pdfPage({ name: asset.name, src: asset.src, pdf: asset.pdf!, bytes: asset.bytes }, n));
    commit();
    patchItems(new Map([[item.id, { asset: key }]]));
    setBusy(false);
  } catch (err) {
    console.error(err);
    setBusy(false);
    say(t('errors.page', { page: n }), { warn: true });
  }
}
