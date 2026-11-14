// @vitest-environment jsdom
// When an action takes the selected piece to another sheet, the view goes
// there (revealPiece scrolls only if it is out of sight); when it stays on its
// sheet, the view is left alone. (The scrolling itself: e2e/specs/view-follows-new-pieces.spec.ts.)
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { revealPiece } from '../../src/components/canvas/viewport.ts';
import { arrange, fillWithCopies } from '../../src/state/actions/layout.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

vi.mock('../../src/components/canvas/viewport.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/components/canvas/viewport.ts')>()),
  revealPiece: vi.fn(),
}));

let photo = '';
beforeEach(() => {
  photo = fakeImage({ px: [600, 400] });
  vi.mocked(revealPiece).mockClear();
});

describe('the view follows the selection to another sheet', () => {
  test('arranging takes the selected piece from sheet 2 to sheet 1: the view goes to it', () => {
    resetState({ sheets: [{ id: 1 }, { id: 2 }], items: [piece(1, photo, 120, 200), piece(2, photo, 20, 20, { sheet: 2 })], selection: [2] });
    expect(arrange()).toBe('arranged');
    expect(revealPiece).toHaveBeenCalledWith(2);
  });

  test('arranging that leaves the selected piece on its sheet doesn’t move the view', () => {
    resetState({ items: [piece(1, photo, 120, 200), piece(2, photo, 20, 20)], selection: [2] });
    expect(arrange()).toBe('arranged');
    expect(revealPiece).not.toHaveBeenCalled();
  });

  test('filling a sheet with copies keeps them on that sheet: the view stays', () => {
    resetState({ items: [piece(1, photo, 20, 20)], selection: [1] });
    expect(fillWithCopies()).toBe(true);
    expect(revealPiece).not.toHaveBeenCalled();
  });
});
