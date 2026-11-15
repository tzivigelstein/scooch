// @vitest-environment jsdom
// The selection frames and the piece toolbar are painted again when what they
// depend on changes, a notice included (the toolbar moves off it), whether an
// action's result or a problem, but not in the middle of a gesture: its live
// values are what shows until it ends.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SelectionOverlay } from '../../src/components/canvas/SelectionOverlay.tsx';
import { paintCommittedSelection, paintSelection } from '../../src/components/canvas/selection.ts';
import { setDocument } from '../../src/state/document.ts';
import { gestureStore } from '../../src/state/gesture.ts';
import { setView } from '../../src/state/view.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

vi.mock('../../src/components/canvas/selection.ts', () => ({ paintCommittedSelection: vi.fn(), paintSelection: vi.fn() }));

beforeEach(() => {
  resetState();
  render(<SelectionOverlay layout={0} />);
  vi.mocked(paintCommittedSelection).mockClear();
  vi.mocked(paintSelection).mockClear();
});
afterEach(() => {
  act(() => gestureStore.setState({ drafts: null }));
  cleanup();
});

describe('painting the selection', () => {
  test('a notice that shows up repaints it, so the toolbar moves off the notice', () => {
    act(() => setView({ flash: { text: 'Se quitaron 2 piezas' } }));
    expect(paintCommittedSelection).toHaveBeenCalledTimes(1);
  });

  test('a problem notice held back while a measure is typed repaints it when the measure is confirmed', () => {
    const card = fakeImageMm(80, 56);
    // Typing X: the piece already sticks out of the sheet, but the notice waits.
    act(() => {
      setView({ editing: true });
      setDocument({ items: [piece(1, card, 180, 10)], selection: [1] });
    });
    vi.mocked(paintCommittedSelection).mockClear();
    // Confirmed: the notice shows up, and nothing else changes.
    act(() => setView({ editing: false }));
    expect(paintCommittedSelection).toHaveBeenCalledTimes(1);
  });

  test('during a gesture a notice doesn’t repaint it at its committed place; the gesture’s end does', () => {
    act(() => gestureStore.setState({ drafts: [] }));
    vi.mocked(paintCommittedSelection).mockClear();
    act(() => setView({ flash: { text: 'Se agregaron 7 archivos en las hojas 1 y 2' } }));
    expect(paintCommittedSelection).not.toHaveBeenCalled();
    act(() => gestureStore.setState({ drafts: null }));
    expect(paintCommittedSelection).toHaveBeenCalledTimes(1);
  });
});
