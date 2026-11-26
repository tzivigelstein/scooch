// @vitest-environment jsdom
// Editing a QR code piece (src/state/actions/qr.ts) on the real stores: each
// change is another asset in one undo step, typing shares a step, changes
// made while one is being built all land and only the last code is drawn, a
// change that lands after the piece changed (undone) is dropped, a caption
// makes the piece taller under its code (moving it to a free spot if it then
// overlaps another), and a logo that can't be used is said in the notice.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { FileProblem, type QrAsset } from '../../src/services/assets.ts';
import { buildQr } from '../../src/services/qr.ts';
import { addAsset, getAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { endEdit, historyDepth, undo } from '../../src/state/history.ts';
import { getView } from '../../src/state/view.ts';
import { chooseLogo, editQr } from '../../src/state/actions/qr.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const readLogo = vi.hoisted(() => ({ fn: null as null | ((file: File) => Promise<unknown>) }));
vi.mock('../../src/services/qr.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/services/qr.ts')>();
  return { ...real, readLogo: (file: File) => (readLogo.fn ?? real.readLogo)(file) };
});

const qrOf = (id = 1) => getAsset(getDocument().items.find((item) => item.id === id)!.asset) as QrAsset;

beforeEach(async () => {
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:qr/${++n}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({ measureText: () => ({ width: 10 }) }, { get: (target, key) => (target as Record<PropertyKey, unknown>)[key] ?? (() => {}) }) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
  resetState();
  const key = addAsset(await buildQr({ text: 'https://scooch.app', color: '#000000', background: '#ffffff', dots: 'square', eyes: 'square', caption: '', logo: null }, 40));
  setDocument({ items: [piece(1, key, 20, 20)], selection: [1] });
});

afterEach(() => {
  readLogo.fn = null;
  vi.restoreAllMocks();
});

describe('editing a QR code', () => {
  test('a change is another code, in one undo step; undo brings the one before back', async () => {
    const before = getDocument().items[0].asset;
    await editQr(1, { dots: 'circle' });
    expect(getDocument().items[0].asset).not.toBe(before);
    expect(qrOf()).toMatchObject({ dots: 'circle', text: 'https://scooch.app' });
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items[0].asset).toBe(before);
    expect(qrOf().dots).toBe('square');
  });

  test('typing in a field is one step until the field is left', async () => {
    for (const text of ['h', 'ho', 'hol', 'hola']) await editQr(1, { text }, { key: 'qr-text:1' });
    expect(qrOf().text).toBe('hola');
    expect(historyDepth().undo).toBe(1);
    endEdit();
    await editQr(1, { text: 'hola!' }, { key: 'qr-text:1' });
    expect(historyDepth().undo).toBe(2);
    undo();
    undo();
    expect(qrOf().text).toBe('https://scooch.app');
  });

  test('changes made while a code is being built all land: only the last code is drawn', async () => {
    const first = editQr(1, { color: '#1f3a93' }, { key: 'qr-color:1' });
    const second = editQr(1, { text: 'otro' }, { key: 'qr-text:1' });
    await Promise.all([first, second]);
    expect(qrOf()).toMatchObject({ color: '#1f3a93', text: 'otro' });
    expect(historyDepth().undo).toBe(1);
  });

  test('a change that lands after the piece changed (undone meanwhile) is dropped', async () => {
    await editQr(1, { text: 'uno' });
    const later = editQr(1, { text: 'dos' });
    undo();
    await later;
    expect(qrOf().text).toBe('https://scooch.app');
  });

  test('a caption makes the piece taller under its code; landing on another piece it moves to a free spot in the same step', async () => {
    await editQr(1, { caption: 'Menú' });
    expect(qrOf().h).toBeCloseTo(46.4, 9);
    expect(getDocument().items[0]).toMatchObject({ x: 20, y: 20 });
    await editQr(1, { caption: '' });
    expect(qrOf().h).toBe(40);
    const photo = fakeImageMm(30, 20);
    setDocument({ items: [piece(1, getDocument().items[0].asset, 20, 20), piece(2, photo, 20, 61)], selection: [1] });
    const depth = historyDepth().undo;
    await editQr(1, { caption: 'Menú' });
    const [qr, other] = getDocument().items;
    expect(other).toMatchObject({ x: 20, y: 61 });
    const apart = qr.y + 46.4 <= other.y + 1e-9 || qr.x >= other.x + 30 - 1e-9 || qr.x + 40 <= other.x + 1e-9 || qr.y >= other.y + 20 - 1e-9;
    expect(apart, 'no overlap').toBe(true);
    expect(historyDepth().undo).toBe(depth + 1);
  });

  test('a logo that can’t be used is said in the notice and the code stays as it was', async () => {
    readLogo.fn = async () => {
      throw new FileProblem('el navegador no puede abrir este formato; prueba con JPG, PNG o WebP');
    };
    const before = getDocument().items[0].asset;
    await chooseLogo(1, new File(['x'], 'logo.heic'));
    expect(getDocument().items[0].asset).toBe(before);
    expect(getView().flash).toMatchObject({ text: 'logo.heic: el navegador no puede abrir este formato; prueba con JPG, PNG o WebP', warn: true });
  });
});
