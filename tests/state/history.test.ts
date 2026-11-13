import { beforeEach, describe, expect, test } from 'vitest';
import { MAX_UNDO } from '../../src/config.ts';
import { getDocument, patchItem, setDocument, type Piece } from '../../src/state/document.ts';
import { cancelEdit, commit, endEdit, historyDepth, historyStacks, installHistory, redo, resetHistory, undo } from '../../src/state/history.ts';
import { getView, setView } from '../../src/state/view.ts';

const piece = (id: number, x = 0): Piece => ({ id, asset: 'a1', sheet: 1, x, y: 0, scale: 100, r: 0, crop: null });

beforeEach(() => {
  setDocument({ sheets: [{ id: 1 }], items: [piece(1), piece(2)], selection: [], margin: 10, busy: false });
  setView({ flash: null, pinned: false });
  resetHistory();
});

describe('history', () => {
  test('one step per operation, and undo/redo restore the document', () => {
    commit();
    patchItem(1, { x: 10 });
    commit();
    patchItem(1, { x: 20 });
    expect(historyDepth()).toEqual({ undo: 2, redo: 0 });
    expect(getDocument().canUndo).toBe(true);
    expect(undo()).toBe(true);
    expect(getDocument().items[0].x).toBe(10);
    expect(undo()).toBe(true);
    expect(getDocument().items[0].x).toBe(0);
    expect(undo()).toBe(false);
    expect(redo()).toBe(true);
    expect(getDocument().items[0].x).toBe(10);
    expect(getDocument().canRedo).toBe(true);
  });

  test('keyed edits share one step until endEdit', () => {
    for (const x of [1, 2, 3]) {
      commit('nudge:1');
      patchItem(1, { x });
    }
    expect(historyDepth().undo).toBe(1);
    endEdit();
    commit('nudge:1');
    patchItem(1, { x: 4 });
    expect(historyDepth().undo).toBe(2);
    undo();
    expect(getDocument().items[0].x).toBe(3);
    undo();
    expect(getDocument().items[0].x).toBe(0);
  });

  test('cancelEdit goes back to before the edit and leaves nothing to redo', () => {
    commit('field');
    patchItem(1, { x: 50 });
    expect(cancelEdit('other')).toBe(false);
    expect(cancelEdit('field')).toBe(true);
    expect(getDocument().items[0].x).toBe(0);
    expect(historyDepth()).toEqual({ undo: 0, redo: 0 });
  });

  test('a new step clears redo and the notice; a snapshot keeps the selection', () => {
    setDocument({ selection: [2] });
    commit();
    setDocument({ selection: [1] });
    patchItem(1, { x: 5 });
    undo();
    expect(getDocument().selection).toEqual([2]);
    setView({ flash: { text: 'Hecho' } });
    commit();
    expect(historyDepth().redo).toBe(0);
    expect(getView().flash).toBeNull();
  });

  test('undoing to fewer than two selected unpins the selection', () => {
    commit();
    setDocument({ selection: [1, 2] });
    setView({ pinned: true });
    undo();
    expect(getView().pinned).toBe(false);
  });

  test('nothing undoes while busy', () => {
    commit();
    patchItem(1, { x: 5 });
    setDocument({ busy: true });
    expect(undo()).toBe(false);
    expect(getDocument().items[0].x).toBe(5);
  });

  test('restored state is a snapshot: later changes do not leak into it', () => {
    commit();
    const before = getDocument().items;
    patchItem(1, { x: 99 });
    expect(before[0].x).toBe(0);
    undo();
    expect(getDocument().items).toBe(before);
  });

  test('keeps at most MAX_UNDO steps: the oldest ones go first', () => {
    for (let x = 1; x <= MAX_UNDO + 5; x++) {
      commit();
      patchItem(1, { x });
    }
    expect(historyDepth()).toEqual({ undo: MAX_UNDO, redo: 0 });
    while (undo());
    // The first 5 steps were dropped: undo stops at the state after the 5th change.
    expect(getDocument().items[0].x).toBe(5);
    expect(historyDepth()).toEqual({ undo: 0, redo: MAX_UNDO });
  });
});

describe('putting back the steps saved with a project', () => {
  /** Steps as a saved history has them: x = 1 then x = 2 (undo), and x = 9 (redo). */
  function saved() {
    const at = (x: number) => ({ ...historyStacks().undo[0], items: [piece(1, x), piece(2)] });
    commit(); // a step only to borrow a snapshot's shape
    const steps = { undo: [at(1), at(2)], redo: [at(9)] };
    resetHistory();
    return steps;
  }

  test('on a project just opened: the saved undo and redo steps, as they were', () => {
    const steps = saved();
    patchItem(1, { x: 3 });
    installHistory(steps);
    expect(historyDepth()).toEqual({ undo: 2, redo: 1 });
    expect(getDocument().canUndo && getDocument().canRedo).toBe(true);
    undo();
    expect(getDocument().items[0].x).toBe(2);
  });

  test('steps taken since it opened stay on top, and the saved redo steps no longer apply', () => {
    const steps = saved();
    commit();
    patchItem(1, { x: 5 });
    installHistory(steps);
    expect(historyDepth()).toEqual({ undo: 3, redo: 0 });
    undo();
    expect(getDocument().items[0].x).toBe(0);
    undo();
    expect(getDocument().items[0].x).toBe(2);
  });

  test('never more than MAX_UNDO steps: the oldest saved ones go', () => {
    const steps = saved();
    for (let i = 0; i < MAX_UNDO; i++) {
      commit();
      patchItem(1, { x: 100 + i });
    }
    installHistory(steps);
    expect(historyDepth().undo).toBe(MAX_UNDO);
  });
});
