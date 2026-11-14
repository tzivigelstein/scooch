// @vitest-environment jsdom
// The selection frames and the piece toolbar are painted again when what they
// depend on changes, a notice included (the toolbar moves off it), but not in
// the middle of a gesture: its live values are what shows until it ends.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SelectionOverlay } from '../../src/components/canvas/SelectionOverlay.tsx';
import { paintCommittedSelection, paintSelection } from '../../src/components/canvas/selection.ts';
import { gestureStore } from '../../src/state/gesture.ts';
import { setView } from '../../src/state/view.ts';
import { resetState } from '../support/state.ts';

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

  test('during a gesture a notice doesn’t repaint it at its committed place; the gesture’s end does', () => {
    act(() => gestureStore.setState({ drafts: [] }));
    vi.mocked(paintCommittedSelection).mockClear();
    act(() => setView({ flash: { text: 'Se agregaron 7 archivos en las hojas 1 y 2' } }));
    expect(paintCommittedSelection).not.toHaveBeenCalled();
    act(() => gestureStore.setState({ drafts: null }));
    expect(paintCommittedSelection).toHaveBeenCalledTimes(1);
  });
});
