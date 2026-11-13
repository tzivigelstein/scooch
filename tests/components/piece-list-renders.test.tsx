// @vitest-environment jsdom
// The piece list re-renders only the rows that change: with 150 pieces,
// selecting a piece, typing a measure or moving one piece must not render
// every row again (each row is memoized; what it gets must stay equal).
// Each row's render draws its thumbnail once (thumbView), which is counted.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PieceList } from '../../src/components/pieces-panel/PieceList.tsx';
import { patchItem } from '../../src/state/document.ts';
import { setLengthField } from '../../src/state/actions/pieces.ts';
import { select } from '../../src/state/actions/selection.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

const rendered = vi.hoisted(() => ({ rows: 0 }));
vi.mock('../../src/components/canvas/pieceView.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/components/canvas/pieceView.ts')>();
  return {
    ...original,
    thumbView: (...args: Parameters<typeof original.thumbView>) => {
      rendered.rows++;
      return original.thumbView(...args);
    },
  };
});

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  // 150 pieces in a grid on one sheet, none overlapping, nothing selected.
  const key = fakeImage({ px: [120, 120] });
  resetState({ items: Array.from({ length: 150 }, (_, i) => piece(i + 1, key, 10 + (i % 10) * 18, 10 + Math.floor(i / 10) * 18)) });
  rendered.rows = 0;
  render(<PieceList />);
  expect(rendered.rows).toBe(150);
  rendered.rows = 0;
});

afterEach(cleanup);

describe('rows rendered by a change', () => {
  test('selecting a piece renders only that row (and the row that was selected before)', () => {
    act(() => select(40));
    expect(rendered.rows).toBeLessThanOrEqual(2);
    rendered.rows = 0;
    act(() => select(41));
    expect(rendered.rows).toBe(2);
  });

  test('typing a measure of the selected piece renders only its row, once per keystroke', () => {
    act(() => select(40));
    rendered.rows = 0;
    // Into the free strip on the right: nothing else's problems change.
    for (const x of [184, 186, 188]) act(() => setLengthField('x', x));
    expect(rendered.rows).toBe(3);
  });

  test('moving one piece onto another renders the rows whose problems changed, not all', () => {
    act(() => patchItem(1, { x: 28, y: 10 })); // over piece 2
    expect(rendered.rows).toBeLessThanOrEqual(2);
  });
});
