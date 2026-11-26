// Undo and redo: one step per gesture or operation. Continuous edits (typing
// in a field, the slider, arrow presses) share a step through a key. The
// project service saves the steps with the project (core/undostore.js) and
// puts them back when it opens again (installHistory).

import { MAX_UNDO } from '../config.ts';
import { retainAssets } from './assets.ts';
import { getDocument, setDocument, type DocumentData } from './document.ts';
import { setView } from './view.ts';

interface Snapshot extends DocumentData {
  readonly selection: readonly number[];
}

const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = [];
let editKey: string | null = null;
// While true, the next commit joins the step already taken (see joined).
let joining = false;

function snapshot(): Snapshot {
  const { sheets, items, selection, paper, landscape, margin, gap, cuts, allowOverlap } = getDocument();
  return { sheets, items, selection, paper, landscape, margin, gap, cuts, allowOverlap };
}

const syncFlags = () => setDocument({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });

/** Saves the current state before changing it. With `key`, consecutive edits share one step. */
export function commit(key: string | null = null) {
  if (joining) {
    joining = false;
    return;
  }
  if (key && key === editKey) return;
  editKey = key;
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  setView({ flash: null });
  collectGarbage();
  syncFlags();
}

/**
 * Runs `change` as part of the step just committed: its own first commit adds
 * nothing (e.g. allowing overlaps and the action that needed it: one step).
 */
export function joined(change: () => void) {
  joining = true;
  try {
    change();
  } finally {
    joining = false;
  }
}

/** Ends the continuous edit in progress (the next change is a new step). */
export const endEdit = () => {
  editKey = null;
};

/**
 * Cancels the continuous edit with that key: back to how it was before it
 * started, without leaving it to redo (e.g. if a field's value is not valid
 * when confirmed). Returns false if there was nothing to cancel.
 */
export function cancelEdit(key: string | null) {
  if (!key || key !== editKey || !undoStack.length) return false;
  editKey = null;
  restore(undoStack.pop()!);
  syncFlags();
  return true;
}

function restore(snap: Snapshot) {
  const ids = new Set(snap.items.map((item) => item.id));
  const selection = snap.selection.filter((id) => ids.has(id));
  const { sheets, items, paper, landscape, margin, gap, cuts, allowOverlap } = snap;
  setDocument({ sheets, items, selection, paper, landscape, margin, gap, cuts: { ...cuts }, allowOverlap });
  setView({ flash: null, ...(selection.length < 2 ? { pinned: false } : {}) });
}

/** Returns true if it undid something. */
export function undo() {
  if (getDocument().busy || !undoStack.length) return false;
  endEdit();
  redoStack.push(snapshot());
  restore(undoStack.pop()!);
  syncFlags();
  return true;
}

/** Returns true if it redid something. */
export function redo() {
  if (getDocument().busy || !redoStack.length) return false;
  endEdit();
  undoStack.push(snapshot());
  restore(redoStack.pop()!);
  syncFlags();
  return true;
}

/** A new document (a project opened or created): a fresh history. */
export function resetHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  editKey = null;
  syncFlags();
}

// Releases the assets that neither the document nor the history use.
function collectGarbage() {
  if (getDocument().busy) return; // there may be assets just created with no piece yet
  const used = new Set<string>();
  for (const snap of [getDocument(), ...undoStack, ...redoStack]) {
    for (const item of snap.items) used.add(item.asset);
  }
  retainAssets(used);
}

/**
 * Releases at once the assets nothing uses: an edit that keeps adding
 * assets within one step (typing in a QR code's fields) leaves each previous
 * one unused, and the next step would release them only later.
 */
export const releaseUnusedAssets = () => collectGarbage();

/** The depth of each stack (for tests). */
export const historyDepth = () => ({ undo: undoStack.length, redo: redoStack.length });

/** The steps, oldest first (for saving them with the project). */
export const historyStacks = (): { undo: readonly Snapshot[]; redo: readonly Snapshot[] } => ({ undo: undoStack, redo: redoStack });

/**
 * Puts back the steps saved with the project (its assets are loaded already).
 * Steps taken since it opened stay on top of the saved ones; with any of
 * them, the saved redo steps no longer apply.
 */
export function installHistory(saved: { undo: readonly Snapshot[]; redo: readonly Snapshot[] }) {
  const taken = undoStack.length > 0;
  undoStack.unshift(...saved.undo);
  if (undoStack.length > MAX_UNDO) undoStack.splice(0, undoStack.length - MAX_UNDO);
  if (!taken && !redoStack.length) redoStack.push(...saved.redo.slice(-MAX_UNDO));
  syncFlags();
}
