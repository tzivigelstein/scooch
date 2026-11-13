// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { useGlobalShortcuts } from '../../src/hooks/useGlobalShortcuts.ts';
import { addAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument, useDocument } from '../../src/state/document.ts';
import { resetHistory } from '../../src/state/history.ts';
import { setSingleKeys, setUnit } from '../../src/state/prefs.ts';
import { setView } from '../../src/state/view.ts';

const key = addAsset({
  kind: 'image',
  name: 'foto.png',
  src: 1,
  px: [600, 300],
  w: 50.8,
  h: 25.4,
  bytes: new Uint8Array(),
  preview: new Blob(),
  url: 'blob:test',
  format: 'png',
  dpi: 300,
  derived: false,
});

function Harness() {
  useGlobalShortcuts();
  const items = useDocument((s) => s.items);
  return (
    <div id="stage">
      <div id="sheets">
        <div className="page" data-sheet="1">
          <div className="sheet" tabIndex={-1}>
            {items.map((item) => (
              <div key={item.id} className="piece" data-id={item.id} tabIndex={0} />
            ))}
          </div>
        </div>
      </div>
      <input id="text" />
      <div id="live-polite" />
      <div id="live-assertive" />
    </div>
  );
}

const piece = () => document.querySelector<HTMLElement>('.piece')!;
const item = () => getDocument().items[0];

beforeEach(() => {
  setUnit('mm');
  setSingleKeys(true);
  setDocument({ sheets: [{ id: 1 }], items: [{ id: 1, asset: key, sheet: 1, x: 50, y: 50, scale: 100, r: 0, crop: null }], selection: [], margin: 10, busy: false });
  setView({ pinned: false, sheet: 1 });
  resetHistory();
  render(<Harness />);
  piece().focus();
});
afterEach(cleanup);

describe('keyboard shortcuts', () => {
  test('arrows on a piece select it and move it by the unit steps', () => {
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    expect(getDocument().selection).toEqual([1]);
    expect(item().x).toBe(51);
    fireEvent.keyDown(piece(), { key: 'ArrowDown', shiftKey: true });
    expect(item().y).toBe(60);
    fireEvent.keyDown(piece(), { key: 'ArrowLeft', altKey: true });
    expect(item().x).toBe(50.9);
  });

  test('single keys act on the focused piece and can be turned off', () => {
    fireEvent.keyDown(piece(), { key: 'r' });
    expect(item().r).toBe(90);
    setSingleKeys(false);
    fireEvent.keyDown(piece(), { key: 'r' });
    expect(item().r).toBe(90);
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    expect(item().x).not.toBe(50);
  });

  test('nothing single-key happens while typing; Ctrl+Z is the field’s there', () => {
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    const text = document.getElementById('text')!;
    text.focus();
    fireEvent.keyDown(text, { key: 'r' });
    fireEvent.keyDown(text, { key: 'z', ctrlKey: true });
    expect(item()).toMatchObject({ r: 0, x: 51 });
  });

  test('Ctrl+Z undoes, Ctrl+Shift+Z redoes', () => {
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    fireEvent.keyUp(piece(), { key: 'ArrowRight' });
    fireEvent.keyDown(piece(), { key: 'z', ctrlKey: true });
    expect(item().x).toBe(50);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(item().x).toBe(51);
  });

  test('Alt+Shift aligns by physical key, against the printable area with one piece', () => {
    fireEvent.keyDown(piece(), { key: 'Dead', code: 'ArrowLeft', altKey: true, shiftKey: true });
    expect(item().x).toBe(10);
    fireEvent.keyDown(piece(), { key: 'Ó', code: 'KeyV', altKey: true, shiftKey: true });
    // Centered is 135.8 mm; «Imán» (on, 1 mm grid) leaves the block on the grid.
    expect(item().y).toBe(136);
  });

  test('Escape on a piece clears the selection and focuses its sheet', () => {
    fireEvent.keyDown(piece(), { key: 'ArrowRight' });
    fireEvent.keyDown(piece(), { key: 'Escape' });
    expect(getDocument().selection).toEqual([]);
    expect(document.activeElement).toBe(document.querySelector('.sheet'));
  });
});
