// @vitest-environment jsdom
// Which control the canvas shows something for (usePreviewTriggers): the one
// under a mouse or with the keyboard focus (the pointer wins), never from a
// touch; gone when it is left, when an action is activated or with Esc, until
// the control is left; and following its argument while it shows.
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { previewAttrs, usePreviewTriggers } from '../../src/hooks/usePreviewTriggers.ts';
import { previewTrigger, showPreview } from '../../src/state/preview.ts';

let setTimes: (n: number) => void = () => {};

function Harness() {
  usePreviewTriggers();
  const [times, set] = useState(2);
  setTimes = set;
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
});
