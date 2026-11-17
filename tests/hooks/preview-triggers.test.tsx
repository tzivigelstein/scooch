// @vitest-environment jsdom
// Which control the canvas shows something for (usePreviewTriggers): the one
// under a mouse or with the keyboard focus (the pointer wins), never from a
// touch unless the arrows are used then; gone when it is left, when an action
// is activated or with Esc, until the control is left or a list opens again;
// and following its argument while it shows.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { previewAttrs, usePreviewTriggers } from '../../src/hooks/usePreviewTriggers.ts';
import { previewTrigger, showPreview } from '../../src/state/preview.ts';

let setTimes: (n: number) => void = () => {};
let setLooking: (size: string | undefined) => void = () => {};

function Harness() {
  usePreviewTriggers();
  const [times, set] = useState(2);
  const [looking, look] = useState<string | undefined>(undefined);
  setTimes = set;
  setLooking = look;
  return (
    <>
      <label id="margin-field" {...previewAttrs('margin')}>
        <span>Margen</span>
        <input id="margin" />
      </label>
      <button type="button" id="align-left" {...previewAttrs('align', 'left')}>
        Alinear
      </button>
      <div id="dup" role="group" {...previewAttrs('duplicate', times)}>
        <button type="button" id="dup-button">
          Duplicar
        </button>
        <input id="dup-count" />
      </div>
      <div id="photo" {...previewAttrs('photoSize', looking)}>
        <button type="button" id="photo-button" role="combobox" aria-expanded={looking !== undefined}>
          Tamaño de foto
        </button>
      </div>
      <p id="elsewhere">Nada</p>
    </>
  );
}

const el = (id: string) => document.getElementById(id)!;
const hover = (id: string, pointerType = 'mouse') => fireEvent.pointerOver(el(id), { pointerType });
const now = () => previewTrigger();

beforeEach(() => {
  render(<Harness />);
});

afterEach(() => {
  cleanup();
  showPreview(null);
});

describe('which control shows something on the canvas', () => {
  test('the one under the mouse (anything inside it counts); none once the pointer is elsewhere or leaves the window', () => {
    hover('align-left');
    expect(now()).toEqual({ kind: 'align', arg: 'left' });
    fireEvent.pointerOver(el('margin-field').querySelector('span')!, { pointerType: 'mouse' });
    expect(now()).toEqual({ kind: 'margin', arg: undefined });
    hover('elsewhere');
    expect(now()).toBeNull();
    hover('align-left');
    fireEvent.pointerOut(el('align-left'), { pointerType: 'mouse', relatedTarget: null });
    expect(now()).toBeNull();
  });

  test('a touch has no hover: nothing', () => {
    hover('align-left', 'touch');
    expect(now()).toBeNull();
  });

  test('the one with the keyboard focus, until the focus leaves', () => {
    act(() => el('margin').focus());
    expect(now()).toEqual({ kind: 'margin', arg: undefined });
    act(() => el('align-left').focus());
    expect(now()).toEqual({ kind: 'align', arg: 'left' });
    act(() => el('align-left').blur());
    expect(now()).toBeNull();
  });

  test('a focus right after a touch came from the finger: nothing', () => {
    fireEvent.pointerDown(el('margin'), { pointerType: 'touch' });
    act(() => el('margin').focus());
    expect(now()).toBeNull();
  });

  test('the pointer wins over the focus; when it goes, the focused control shows again', () => {
    act(() => el('margin').focus());
    hover('align-left');
    expect(now()).toEqual({ kind: 'align', arg: 'left' });
    hover('elsewhere');
    expect(now()).toEqual({ kind: 'margin', arg: undefined });
  });

  test('activating an action takes its preview away until the control is left and entered again', () => {
    hover('align-left');
    fireEvent.click(el('align-left'));
    expect(now()).toBeNull();
    hover('align-left');
    expect(now()).toBeNull();
    hover('elsewhere');
    hover('align-left');
    expect(now()).toEqual({ kind: 'align', arg: 'left' });
  });

  test('activating with the keyboard: gone while the focus stays on it', () => {
    act(() => el('align-left').focus());
    fireEvent.click(el('align-left'), { detail: 0 });
    expect(now()).toBeNull();
    act(() => el('margin').focus());
    act(() => el('align-left').focus());
    expect(now()).toEqual({ kind: 'align', arg: 'left' });
  });

  test('clicking into a field of an action’s group (not a button) keeps its preview; a highlight stays when clicked', () => {
    hover('dup-count');
    fireEvent.click(el('dup-count'));
    expect(now()).toEqual({ kind: 'duplicate', arg: '2' });
    hover('margin');
    fireEvent.click(el('margin'));
    expect(now()).toEqual({ kind: 'margin', arg: undefined });
  });

  test('Esc takes it away (hovered and focused alike) until they are left', () => {
    act(() => el('margin').focus());
    hover('align-left');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(now()).toBeNull();
    hover('elsewhere');
    expect(now()).toBeNull();
    act(() => el('margin').blur());
    act(() => el('margin').focus());
    expect(now()).toEqual({ kind: 'margin', arg: undefined });
  });

  test('a control whose argument changes while it shows («Duplicar ×N» as N is typed) shows the new one', async () => {
    hover('dup-button');
    expect(now()).toEqual({ kind: 'duplicate', arg: '2' });
    await act(async () => setTimes(5));
    expect(now()).toEqual({ kind: 'duplicate', arg: '5' });
  });

  test('a list taken away with Esc shows again when it is opened again (it gets an argument again), without leaving it', async () => {
    // Reached with Tab (jsdom's :focus-visible follows the last kind of input).
    fireEvent.keyDown(document, { key: 'Tab' });
    act(() => el('photo-button').focus());
    await act(async () => setLooking('10x15'));
    expect(now()).toEqual({ kind: 'photoSize', arg: '10x15' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(now()).toBeNull();
    await act(async () => setLooking(undefined));
    expect(now()).toBeNull();
    await act(async () => setLooking('9x13'));
    expect(now()).toEqual({ kind: 'photoSize', arg: '9x13' });
  });

  test('a control focused by a touch and then gone through with the arrows has the keyboard focus; other keys don’t give it', async () => {
    fireEvent.pointerDown(el('photo-button'), { pointerType: 'touch' });
    act(() => el('photo-button').focus());
    await act(async () => setLooking('10x15'));
    expect(now()).toBeNull();
    fireEvent.keyDown(el('photo-button'), { key: 'a' });
    expect(now()).toBeNull();
    fireEvent.keyDown(el('photo-button'), { key: 'ArrowDown' });
    expect(now()).toEqual({ kind: 'photoSize', arg: '10x15' });
  });
});
