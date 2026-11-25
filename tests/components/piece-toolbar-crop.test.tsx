// @vitest-environment jsdom
// The floating toolbar offers «Recortar» with one piece selected, unless it
// is a QR code (never cropped) — and never with several.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { PieceToolbar } from '../../src/components/canvas/PieceToolbar.tsx';
import { setDocument } from '../../src/state/document.ts';
import { fakeImage, fakeQr, piece, resetState } from '../support/state.ts';

const actions = () => [...document.querySelectorAll<HTMLElement>('#piecebar [data-action]')].map((button) => button.dataset.action);

beforeEach(() => {
  resetState();
  render(<PieceToolbar />);
});
afterEach(cleanup);

test('one image: «Recortar» is there; one QR code or several pieces: it isn’t', () => {
  const photo = fakeImage();
  const qr = fakeQr();
  act(() => setDocument({ items: [piece(1, photo, 10, 10), piece(2, qr, 100, 10)], selection: [1] }));
  expect(actions()).toEqual(['rotate-left', 'rotate-right', 'crop', 'duplicate', 'remove']);
  act(() => setDocument({ selection: [2] }));
  expect(actions()).toEqual(['rotate-left', 'rotate-right', 'duplicate', 'remove']);
  act(() => setDocument({ selection: [1, 2] }));
  expect(actions()).toEqual(['rotate-left', 'rotate-right', 'duplicate', 'remove']);
});
