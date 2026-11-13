// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { useFocusRescue } from '../../src/hooks/useFocusRescue.ts';
import { setDocument, useDocument } from '../../src/state/document.ts';

function Harness() {
  useFocusRescue();
  const canUndo = useDocument((s) => s.canUndo);
  const canRedo = useDocument((s) => s.canRedo);
  const selection = useDocument((s) => s.selection);
  return (
    <>
      <button type="button" id="undo" disabled={!canUndo}>
        Deshacer
      </button>
      <button type="button" id="redo" disabled={!canRedo}>
        Rehacer
      </button>
      {!selection.includes(9) && (
        <button type="button" id="gone">
          Se va
        </button>
      )}
      <div id="sheets">
        <div className="page" data-sheet="1">
          <div className="sheet" tabIndex={-1} />
        </div>
      </div>
    </>
  );
}

beforeEach(() => {
  setDocument({ sheets: [{ id: 1 }], items: [], selection: [], canUndo: true, canRedo: true });
  render(<Harness />);
});
afterEach(cleanup);

describe('focus rescue', () => {
  test('undo disabled while focused: the focus goes to redo (and back)', () => {
    document.getElementById('undo')!.focus();
    act(() => setDocument({ canUndo: false }));
    expect(document.activeElement?.id).toBe('redo');
    act(() => setDocument({ canUndo: true, canRedo: false }));
    expect(document.activeElement?.id).toBe('undo');
  });

  test('a focused element that disappears hands the focus to the sheet', () => {
    document.getElementById('gone')!.focus();
    act(() => setDocument({ selection: [9] }));
    expect(document.activeElement).toBe(document.querySelector('.sheet'));
  });

  test('a focus that moved elsewhere on purpose is left alone', () => {
    document.getElementById('redo')!.focus();
    act(() => setDocument({ canUndo: false }));
    expect(document.activeElement?.id).toBe('redo');
  });
});
