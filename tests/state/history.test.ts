import { beforeEach, describe, expect, test } from 'vitest';
import { getDocument, patchItem, setDocument, type Piece } from '../../src/state/document.ts';
import { cancelEdit, commit, endEdit, historyDepth, redo, resetHistory, undo } from '../../src/state/history.ts';
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
});
