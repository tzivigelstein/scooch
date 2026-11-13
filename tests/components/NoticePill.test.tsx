// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { NoticePill } from '../../src/components/feedback/NoticePill.tsx';
import { addAsset } from '../../src/state/assets.ts';
import { setDocument } from '../../src/state/document.ts';
import { setView } from '../../src/state/view.ts';

const key = addAsset({
  kind: 'image',
  name: 'foto.png',
  src: 1,
  px: [600, 600],
  w: 50.8,
  h: 50.8,
  bytes: new Uint8Array(),
  preview: new Blob(),
  url: 'blob:test',
  format: 'png',
  dpi: 300,
  derived: false,
});

const pill = () => document.getElementById('pill')!;
const text = () => (pill().hidden ? '' : document.getElementById('pill-text')!.textContent);

beforeEach(() => {
  setDocument({ sheets: [{ id: 1 }], items: [{ id: 1, asset: key, sheet: 1, x: 20, y: 20, scale: 100, r: 0, crop: null }], margin: 10, busy: false });
  setView({ flash: null, editing: false, busyText: '' });
  render(
    <>
      <NoticePill />
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
});
afterEach(cleanup);

describe('notice pill', () => {
  test('problems wait while a field is being edited, results do not', () => {
    expect(text()).toBe('');
    act(() => setView({ editing: true }));
    act(() => setDocument({ margin: 50 }));
    expect(text()).toBe('');
    act(() => setView({ flash: { text: 'Se descargó tarjetas.pdf' } }));
    expect(text()).toBe('Se descargó tarjetas.pdf');
    act(() => setView({ flash: null }));
    expect(text()).toBe('');
    act(() => setView({ editing: false }));
    expect(text()).toMatch(/pasa el margen/);
  });
});
