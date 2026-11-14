// Sheets: add, remove, go from one to another, move a piece to another sheet,
// and the sheet settings (paper, orientation, margin and gap).

import { t } from '../../copy/index.ts';
import { announce } from '../../components/feedback/announcer.ts';
import { confirmAction } from '../../components/dialogs/confirm.ts';
import { revealPiece, revealPieces, revealSheet } from '../../components/canvas/viewport.ts';
import { customPaper } from '../../core/papers.js';
import { spotOnSheet } from '../../core/sheets.js';
import type { Cuts, Item, Paper, PaperId } from '../../core/types.ts';
import { clamp, tidy } from '../../core/util.ts';
import { lengthText, paperName } from '../../services/measure.ts';
import { flushUi } from '../flush.ts';
import { getDocument, newSheet, patchItems, setDocument } from '../document.ts';
import { commit, endEdit } from '../history.ts';
import { loadCustomPaper, saveCustomPaper, setGrid, getPrefs } from '../prefs.ts';
import { area, boxOf, currentSheet, findItem, itemsOn, layoutPad, selectedItem, selectedItems, sheetIndex, sheetSize } from '../selectors.ts';
import { animateNext, setView } from '../view.ts';
import { revealPanel } from './drawers.ts';
import { focusSheet, pieceNode, sheetNode } from './focus.ts';
import { showPropsTab } from './panels.ts';
import { forgetSpill } from './layout.ts';
import { arrangeAll, undoLast } from './edit.ts';
import { say, singleOnly } from './notify.ts';
import { select, setSelection } from './selection.ts';

const busy = () => getDocument().busy;

/** Adds an empty sheet at the end (one undo step). */
export function addSheet() {
  if (busy()) return;
  commit();
  forgetSpill();
  const sheet = newSheet();
  setDocument({ sheets: [...getDocument().sheets, sheet] });
  setSelection([]);
  setView({ sheet: sheet.id });
  flushUi();
  revealSheet(sheet.id);
  announce(t('announce.sheetAdded', { i: getDocument().sheets.length }));
}

/** Removes a sheet (with pieces, it asks first); there's always at least one left. */
export async function removeSheet(id: number, { viaKeyboard = false } = {}) {
  if (busy() || getDocument().sheets.length < 2) return;
  const index = sheetIndex(id);
  if (index < 0) return;
  const n = itemsOn(id).length;
  if (n) {
    const ok = await confirmAction({
      title: t('confirm.removeSheetTitle', { i: index + 1 }),
      body: t('confirm.removeSheetBody', { n }),
      confirm: t('confirm.removeSheet'),
      returnTo: document.activeElement,
    });
    if (!ok || sheetIndex(id) !== index) return;
  }
  commit();
  forgetSpill();
  const { items, sheets, selection } = getDocument();
  setDocument({ items: items.filter((item) => item.sheet !== id), sheets: sheets.filter((sheet) => sheet.id !== id) });
  setSelection(selection);
  const left = getDocument().sheets;
  const next = left[Math.min(index, left.length - 1)];
  setView({ sheet: next.id });
  if (viaKeyboard || n) {
    // The focus goes to the sheet that takes its place.
    flushUi();
    revealSheet(next.id);
    sheetNode(next.id)?.focus({ preventScroll: true });
  }
  announce(n ? t('announce.sheetRemoved', { i: index + 1, n }) : t('announce.sheetRemovedEmpty', { i: index + 1 }));
}

/**
 * A sheet's title: that sheet becomes the current one, nothing stays
 * selected and Propiedades shows Hoja (opening it on narrow screens). The
 * focus stays where it is.
 */
export function showSheetSettings(id: number) {
  if (sheetIndex(id) < 0) return;
  setView({ sheet: id });
  if (getDocument().selection.length) setSelection([]);
  showPropsTab('sheet');
  revealPanel('props');
}

/** Page Up / Page Down: the focus goes to the previous or next sheet (to its first piece). */
export function gotoSheet(dir: 1 | -1) {
  const { sheets } = getDocument();
  const target = sheetIndex(currentSheet()) + dir;
  if (target < 0 || target >= sheets.length) {
    return announce(t(dir > 0 ? 'announce.lastSheet' : 'announce.firstSheet'));
  }
  const sheet = sheets[target];
  // The first piece in reading order (top to bottom, left to right).
  const first = [...itemsOn(sheet.id)].sort((a, b) => a.y - b.y || a.x - b.x)[0];
  setView({ sheet: sheet.id });
  if (first) {
    select(first.id);
    flushUi();
    pieceNode(first.id)?.focus({ preventScroll: true });
    revealPiece(first.id);
  } else {
    setSelection([]);
    flushUi();
    revealSheet(sheet.id);
    sheetNode(sheet.id)?.focus({ preventScroll: true });
  }
}

/**
 * Shift + Page Up / Page Down: moves the piece to the previous or next sheet,
 * into a free spot. If it doesn't fit there, or there is no next sheet, it
 * goes to a new sheet right beside. If it doesn't fit even alone on a sheet,
 * it keeps its position.
 */
export function sendToSheet(dir: 1 | -1) {
  if (getDocument().selection.length > 1) return singleOnly();
  const item = selectedItem();
  if (!item || busy()) return;
  const index = sheetIndex(item.sheet);
  const target = index + dir;
  if (target < 0) return announce(t('announce.firstSheet'));
  const { m, aw, ah } = area();
  const box = boxOf(item);
  const rect = { id: item.id, w: box.w, h: box.h };
  const opts = { area: { w: aw, h: ah }, margin: m, gap: getDocument().gap };
  commit();
  let sheet = getDocument().sheets[target];
  let spot = sheet && aw > 0 && ah > 0 ? spotOnSheet(rect, itemsOn(sheet.id).map(boxOf), opts) : null;
  if (!spot) {
    // A new sheet beside: after the current one (next) or before it (previous).
    sheet = newSheet();
    const sheets = [...getDocument().sheets];
    sheets.splice(dir > 0 ? index + 1 : index, 0, sheet);
    setDocument({ sheets });
    spot = aw > 0 && ah > 0 ? spotOnSheet(rect, [], opts) : null;
  }
  // The spot is for the layout box (with the cut margin around the image).
  const pad = layoutPad();
  const patch: Partial<Item> = { sheet: sheet.id, ...(spot ? { x: tidy(spot.x + pad), y: tidy(spot.y + pad) } : {}) };
  patchItems(new Map([[item.id, patch]]));
  setView({ sheet: sheet.id });
  animateNext();
  focusSheet();
  revealPiece(item.id);
  announce(t('announce.movedToSheet', { i: sheetIndex(sheet.id) + 1, total: getDocument().sheets.length }));
}

/** Can the selection move to a new sheet? (all of it on one sheet) */
export const canMoveToNewSheet = () => {
  const items = selectedItems();
  return items.length > 0 && items.every((item) => item.sheet === items[0].sheet);
};

/** A sheet left without pieces by a move: kept, with a notice that offers to remove it. */
export function sheetEmptied(id: number) {
  const i = sheetIndex(id);
  if (i < 0 || itemsOn(id).length || getDocument().sheets.length < 2) return;
  say(t('notices.sheetEmptied', { i: i + 1 }), { action: { label: t('sheet.remove'), run: () => void removeSheet(id) } });
}

/**
 * Moves pieces (all on one sheet) to a new sheet created at `index` in the
 * list, each to its position there. One undo step (undo removes the sheet).
 * Their old sheet, if left empty, stays, with a notice that offers to remove
 * it. Returns the new sheet's id.
 */
export function moveToNewSheetAt(index: number, positions: ReadonlyMap<number, { x: number; y: number }>) {
  const items = [...positions.keys()].map((id) => findItem(id)).filter((item) => !!item);
  if (busy() || !items.length || items.some((item) => item.sheet !== items[0].sheet)) return null;
  const from = items[0].sheet;
  commit();
  forgetSpill();
  const sheet = newSheet();
  const sheets = [...getDocument().sheets];
  sheets.splice(clamp(index, 0, sheets.length), 0, sheet);
  setDocument({ sheets });
  patchItems(new Map(items.map((item) => [item.id, { sheet: sheet.id, ...positions.get(item.id) }])));
  setView({ sheet: sheet.id });
  announce(t('announce.movedToNewSheet', { n: items.length, i: sheetIndex(sheet.id) + 1 }));
  sheetEmptied(from);
  return sheet.id;
}

/**
 * «Mover a una hoja nueva»: the selection (all on one sheet) goes to a new
 * sheet right after its own, keeping where it was on the sheet. One undo step.
 */
export function moveToNewSheet() {
  if (busy()) return;
  const items = selectedItems();
  if (!items.length) return announce(t('announce.needSelection'));
  if (!canMoveToNewSheet()) return announce(t('menu.reasons.oneSheet'));
  const id = moveToNewSheetAt(sheetIndex(items[0].sheet) + 1, new Map(items.map((item) => [item.id, { x: item.x, y: item.y }])));
  if (id === null) return;
  animateNext();
  focusSheet();
  revealPieces(
    items.map((item) => item.id),
    getDocument().selection.at(-1)!
  );
}

/**
 * «Quitar todas»: after confirming (it says how many pieces and sheets go;
 * «Cancelar» starts focused), removes the pieces of every sheet and leaves one
 * empty sheet, in one undo step; the notice offers «Deshacer».
 */
export async function clearAll() {
  const { items, sheets } = getDocument();
  if (!items.length || busy()) return;
  const n = items.length;
  const many = sheets.length > 1;
  const ok = await confirmAction({
    title: many ? t('confirm.clearTitleSheets', { n, sheets: sheets.length }) : t('confirm.clearTitle', { n }),
    body: t(many ? 'confirm.clearBodySheets' : 'confirm.clearBody'),
    confirm: t('pieces.clear'),
    focus: 'cancel',
    returnTo: document.activeElement,
  });
  if (!ok || !getDocument().items.length || busy()) return;
  const first = getDocument().sheets[0];
  const removed = getDocument().items.length;
  commit();
  forgetSpill();
  setDocument({ items: [], sheets: [first] });
  setSelection([]);
  setView({ sheet: first.id });
  say(t('notices.cleared', { n: removed }), { action: { label: t('bar.undo'), run: undoLast } });
  // The button that removed them is off now: the focus goes to the empty sheet.
  focusSheet();
}

// ---------- Sheet settings ----------

function sheetChanged() {
  animateNext();
  announce(t('announce.sheet', { paper: paperName() }));
}

export function setOrientation(landscape: boolean) {
  if (getDocument().landscape === landscape || busy()) return;
  commit();
  setDocument({ landscape });
  sheetChanged();
}

/** A preset or «custom» from the paper list. */
export function choosePaper(value: PaperId | 'custom') {
  if (busy()) return;
  if (value === 'custom') {
    // The last custom size (a local preference) or, without one, the current size.
    const [W, H] = sheetSize();
    const saved = loadCustomPaper();
    const next = (saved && customPaper(saved.w, saved.h)) ?? customPaper(W, H);
    if (!next) return;
    commit();
    setDocument({ paper: next.paper, landscape: next.landscape });
  } else {
    commit();
    setDocument({ paper: value });
  }
  sheetChanged();
}

/** Width or height of the custom paper (the value is valid: see papers.validateSide). */
export function setPaperSide(side: 'w' | 'h', mm: number, { final = false } = {}) {
  const [W, H] = sheetSize();
  const w = side === 'w' ? mm : W;
  const h = side === 'h' ? mm : H;
  const next = customPaper(w, h);
  if (!next) return;
  const { paper, landscape } = getDocument();
  const changed = typeof paper === 'string' || next.paper.w !== paper.w || next.paper.h !== paper.h || next.landscape !== landscape;
  if (changed) {
    commit('paper:custom');
    setDocument({ paper: next.paper as Paper, landscape: next.landscape });
  }
  if (final) {
    endEdit();
    // Remembered only when confirmed: what is typed meanwhile is a preview, and Esc takes it back.
    const [width, height] = sheetSize();
    saveCustomPaper(width, height);
    if (changed) sheetChanged();
  }
}

/** Margin and gap: 0 to 50 mm, in one undo step while editing. */
export function setSheetLength(name: 'margin' | 'gap', mm: number, { final = false } = {}) {
  const value = clamp(mm, 0, 50);
  if (getDocument()[name] !== value) {
    commit(`sheet:${name}`);
    setDocument({ [name]: value });
  }
  if (final) endEdit();
}

/**
 * Changes the cut lines (mode, marks, stroke). `key`: consecutive changes of
 * a field or the color picker share one undo step until `final`.
 */
export function setCuts(patch: Partial<Cuts>, { key = null as string | null, final = false } = {}) {
  if (busy()) return;
  const cuts = getDocument().cuts;
  const changed = (Object.keys(patch) as (keyof Cuts)[]).some((name) => patch[name] !== cuts[name]);
  if (changed) {
    commit(key);
    setDocument({ cuts: { ...cuts, ...patch } });
  }
  if (final || !key) endEdit();
}

/** The gap the corner marks need not to touch neighboring pieces (mm, rounded up to 0.1). */
export const gapForCuts = () => {
  const { offset, length } = getDocument().cuts;
  return Math.ceil((offset + length) * 10 - 1e-9) / 10;
};

/** «Usar N mm»: the gap the marks need, with an offer to arrange so it applies. */
export function useGapForCuts() {
  const gap = gapForCuts();
  setSheetLength('gap', gap, { final: true });
  say(t('cuts.gapFixed', { value: lengthText(gap) }), { action: { label: t('bar.arrange'), run: arrangeAll } });
}

export function setRotateWhenUseful(on: boolean) {
  setDocument({ rotate: on });
}

/** «Permitir superposición»: a setting of the open project, in one undo step. */
export function setAllowOverlap(on: boolean) {
  if (getDocument().allowOverlap === on || busy()) return;
  commit();
  setDocument({ allowOverlap: on });
}

export function setGridVisible(show: boolean) {
  setGrid({ show });
  announce(show ? t('announce.gridShown', { size: lengthText(getPrefs().grid.size) }) : t('announce.gridHidden'));
}

