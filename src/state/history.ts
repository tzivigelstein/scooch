// Undo and redo: one step per gesture or operation. Continuous edits (typing
// in a field, the slider, arrow presses) share a step through a key.

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

function snapshot(): Snapshot {
  const { sheets, items, selection, paper, landscape, margin, gap, cuts } = getDocument();
  return { sheets, items, selection, paper, landscape, margin, gap, cuts };
}

const syncFlags = () => setDocument({ canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });

/** Saves the current state before changing it. With `key`, consecutive edits share one step. */
export function commit(key: string | null = null) {
  if (key && key === editKey) return;
  editKey = key;
  undoStack.push(snapshot());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  setView({ flash: null });
  collectGarbage();
  syncFlags();
}

/** Ends the continuous edit in progress (the next change is a new step). */
export const endEdit = () => {
  editKey = null;
};

/** The key of the continuous edit in progress, if any. */
export const currentEdit = () => editKey;

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
  const { sheets, items, paper, landscape, margin, gap, cuts } = snap;
  setDocument({ sheets, items, selection, paper, landscape, margin, gap, cuts: { ...cuts } });
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

/** The depth of each stack (for tests). */
export const historyDepth = () => ({ undo: undoStack.length, redo: redoStack.length });
