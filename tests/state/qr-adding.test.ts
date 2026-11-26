// @vitest-environment jsdom
// Adding a QR code (src/state/actions/qr.ts addQr, reached by «Agregar código
// QR» in the top bar, the «Piezas» panel and the palette): one piece in a
// free spot of the current sheet, selected, in one undo step, announced;
// empty until its content is typed (its fields take the focus once). At the
// cap of pieces, a notice instead.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MAX_ITEMS } from '../../src/config.ts';
import type { QrAsset } from '../../src/services/assets.ts';
import { getAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { historyDepth, undo } from '../../src/state/history.ts';
import { getView } from '../../src/state/view.ts';
import { command } from '../../src/state/commands.ts';
import { addQr, takeContentFocus } from '../../src/state/actions/qr.ts';
import { fakeImageMm, heard, listen, piece, resetState } from '../support/state.ts';

beforeEach(() => {
  // A wide screen with a mouse: the properties panel shows (jsdom has no media queries).
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:qr/${++n}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  listen();
  resetState();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('adding a QR code', () => {
  test('one empty QR code of 40 mm in a free spot of the current sheet, selected, in one undo step, announced', async () => {
    const photo = fakeImageMm(60, 40);
    setDocument({ items: [piece(1, photo, 10, 10)], selection: [] });
    await addQr();
    const [, added] = getDocument().items;
    const qr = getAsset(added.asset) as QrAsset;
    expect(qr).toMatchObject({ kind: 'qr', text: '', color: '#000000', background: '#ffffff', dots: 'square', eyes: 'square', caption: '', logo: null, w: 40, h: 40, issue: 'empty' });
    expect(added).toMatchObject({ sheet: 1, scale: 100, r: 0, crop: null });
    expect(added.x >= 10 + 60 || added.y >= 10 + 40, 'beside the photo, not over it').toBe(true);
    expect(getDocument().selection).toEqual([added.id]);
    expect(historyDepth().undo).toBe(1);
    expect(heard()).toBe('Se agregó un código QR a la hoja 1.');
    // Its content field takes the focus once its fields show, once.
    expect(takeContentFocus(added.id)).toBe(true);
    expect(takeContentFocus(added.id)).toBe(false);
    undo();
    expect(getDocument().items).toHaveLength(1);
  });

  test('the palette has it among the general commands', () => {
    expect(command('addQr')).toMatchObject({ section: 'general', label: 'Agregar código QR', disabled: null });
  });

  test('with as many pieces as can be, a notice says so and nothing is added', async () => {
    const photo = fakeImageMm(5, 5);
    setDocument({ items: Array.from({ length: MAX_ITEMS }, (_, i) => piece(i + 1, photo, 10, 10)) });
    await addQr();
    expect(getDocument().items).toHaveLength(MAX_ITEMS);
    expect(getView().flash).toMatchObject({ text: `Ya hay ${MAX_ITEMS} piezas, el máximo. Quita alguna para agregar otra.`, warn: true });
  });
});
