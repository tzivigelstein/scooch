// Editing a QR code piece: its content, colors, shapes, caption and logo.
// Loads with the QR code fields of the Item tab (it builds pictures:
// services/qr.ts). Each change builds another asset, like another PDF page
// (assets never change once added), so undo goes back to the code before;
// changes with a `key` (typing in a field, dragging in a color picker) share
// one step until the field is left. A code is built asynchronously: while one
// is being built, the next change builds from what it asked for, and only the
// last one lands on the sheet.

import { t } from '../../copy/index.ts';
import { FileProblem, type QrAsset } from '../../services/assets.ts';
import { buildQr, readLogo, type QrFields } from '../../services/qr.ts';
import { addAsset, findAsset } from '../assets.ts';
import { getDocument, patchItem } from '../document.ts';
import { commit, releaseUnusedAssets } from '../history.ts';
import { findItem } from '../selectors.ts';
import { settle } from './layout.ts';
import { say } from './notify.ts';

const fieldsOf = ({ text, color, background, dots, eyes, caption, logo }: QrAsset): QrFields => ({ text, color, background, dots, eyes, caption, logo });

/** The change being built for a piece: what it asks for, the asset it started from and which change it is. */
const building = new Map<number, { fields: QrFields; from: string; turn: number }>();
let turns = 0;

const qrOf = (id: number) => {
  const item = findItem(id);
  const asset = item && findAsset(item.asset);
  return item && asset?.kind === 'qr' ? { item, asset } : null;
};

/**
 * Changes some fields of QR code piece `id`. A caption added or removed
 * makes the piece taller or shorter under its code, which stays put; if it
 * then lands on another piece it moves to the closest free spot, as any
 * piece that changes size (settle). One undo step, or the step of `key`.
 */
export async function editQr(id: number, patch: Partial<QrFields>, { key = null as string | null } = {}) {
  const found = qrOf(id);
  if (!found || getDocument().busy) return;
  const pending = building.get(id);
  const from = pending?.from ?? found.item.asset;
  const fields = { ...(pending?.fields ?? fieldsOf(found.asset)), ...patch };
  const turn = ++turns;
  building.set(id, { fields, from, turn });
  const built = await buildQr(fields, found.asset.w, found.asset.h);
  // A later change builds on this one: only the last lands. And none does on a piece that changed meanwhile (undone, removed).
  const now = qrOf(id);
  if (building.get(id)?.turn !== turn || !now || now.item.asset !== from || getDocument().busy) {
    if (building.get(id)?.turn === turn) building.delete(id);
    URL.revokeObjectURL(built.url);
    return;
  }
  building.delete(id);
  // The step first: an asset no piece uses yet would be released.
  commit(key);
  patchItem(id, { asset: addAsset(built) });
  if (built.h !== now.asset.h) settle([findItem(id)!]);
  releaseUnusedAssets();
}

/** The person chose an image as QR code piece `id`'s logo; one that can't be used is said in the notice. */
export async function chooseLogo(id: number, file: File) {
  try {
    await editQr(id, { logo: await readLogo(file) });
  } catch (err) {
    if (!(err instanceof FileProblem)) console.warn(file.name, err);
    const reason = err instanceof FileProblem ? err.message : t('errors.file.processFailed');
    say(t('errors.loadItem', { name: file.name || t('errors.unnamedFile'), reason }), { warn: true });
  }
}
