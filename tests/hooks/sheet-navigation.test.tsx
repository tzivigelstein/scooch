// @vitest-environment jsdom
// Page Up / Page Down on the sheets go from sheet to sheet (to the first piece
// in reading order, or to the sheet itself when it is empty); with Shift the
// focused piece moves to the previous or next sheet and keeps the focus. And D
// on a piece of a full sheet: the copy, on the next sheet, takes the focus.
// Through the real useGlobalShortcuts, on sheets rendered from the store the
// way the canvas renders them (.page[data-sheet] > .sheet > .piece).
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { useGlobalShortcuts } from '../../src/hooks/useGlobalShortcuts.ts';
import { getDocument, useDocument } from '../../src/state/document.ts';
import { resetHistory } from '../../src/state/history.ts';
import { itemsOn } from '../../src/state/selectors.ts';
import { forgetSpill, placeNew } from '../../src/state/actions/layout.ts';
import { focusPiece, setSelection } from '../../src/state/actions/selection.ts';
import { fakeImage, resetState } from '../support/state.ts';

function Harness() {
  useGlobalShortcuts();
  const sheets = useDocument((s) => s.sheets);
  const items = useDocument((s) => s.items);
  return (
    <>
      {/* Like the canvas: focusing a piece selects it. */}
      <div id="stage" onFocus={(e) => (e.target as HTMLElement).classList.contains('piece') && focusPiece(Number((e.target as HTMLElement).dataset.id))}>
        <div id="sheets">
          {sheets.map((sheet) => (
            <div key={sheet.id} className="page" data-sheet={sheet.id}>
              <div className="sheet" role="group" tabIndex={-1}>
                {items
                  .filter((item) => item.sheet === sheet.id)
                  .map((item) => (
                    <div key={item.id} className="piece" data-id={item.id} tabIndex={0} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <input id="text" />
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
}

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

let s1: number;
let s2: number;

beforeEach(() => {
  vi.useFakeTimers();
  resetState();
  forgetSpill();
  // 12 card-sized pieces: 9 on the first sheet, 3 on the second.
  placeNew(Array.from({ length: 12 }, (_, i) => fakeImage({ name: `card${i}.png`, src: i + 1, px: [661, 945] })));
  setSelection([]);
  resetHistory();
  [s1, s2] = getDocument().sheets.map((sheet) => sheet.id);
  render(<Harness />);
});

afterEach(() => {
  vi.runAllTimers(); // (announcements still pending go out before the live regions go)
  cleanup();
  vi.useRealTimers();
});

const heard = () => {
  vi.advanceTimersByTime(1000);
  return (document.getElementById('live-polite')!.textContent ?? '').replace(/ /g, ' ').trim();
};
const pieceNode = (id: number) => document.querySelector<HTMLElement>(`#sheets .piece[data-id="${id}"]`)!;
const firstOn = (sheet: number) => [...itemsOn(sheet)].sort((a, b) => a.y - b.y || a.x - b.x)[0].id;
const counts = () => getDocument().sheets.map((sheet) => itemsOn(sheet.id).length);
/** What has the focus: a piece (its id and sheet) or a sheet. */
const focused = () => {
  const el = document.activeElement as HTMLElement;
  return { piece: el.classList.contains('piece') ? Number(el.dataset.id) : null, sheet: Number(el.closest<HTMLElement>('.page')?.dataset.sheet ?? NaN), isSheet: el.classList.contains('sheet') };
};
const press = (key: string, mods: { shiftKey?: boolean; altKey?: boolean; repeat?: boolean } = {}) => fireEvent.keyDown(document.activeElement!, { key, ...mods });

describe('Page Up / Page Down', () => {
  test('Page Down goes to the first piece of the next sheet, selected; on the last it says so; Page Up comes back', () => {
    const start = itemsOn(s1)[2].id;
    pieceNode(start).focus();
    press('PageDown');
    expect(focused()).toEqual({ piece: firstOn(s2), sheet: s2, isSheet: false });
    expect(getDocument().selection).toEqual([firstOn(s2)]);
    press('PageDown');
    expect(heard()).toBe('Es la última hoja.');
    expect(focused().piece).toBe(firstOn(s2));
    press('PageUp');
    expect(focused()).toEqual({ piece: firstOn(s1), sheet: s1, isSheet: false });
    press('PageUp');
    expect(heard()).toBe('Es la primera hoja.');
    // Nothing moved.
    expect(counts()).toEqual([9, 3]);
  });

  test('to an empty sheet the focus goes to the sheet itself', () => {
    // The second sheet's pieces go on to a new third one.
    for (const id of itemsOn(s2).map((item) => item.id)) {
      pieceNode(id).focus();
      press('PageDown', { shiftKey: true });
    }
    expect(counts()).toEqual([9, 0, 3]);
    pieceNode(itemsOn(s1)[0].id).focus();
    press('PageDown');
    expect(focused()).toEqual({ piece: null, sheet: s2, isSheet: true });
    expect(getDocument().selection).toEqual([]);
  });

  test('outside the sheets (in a field) they do nothing', () => {
    document.getElementById('text')!.focus();
    press('PageDown');
    press('PageDown', { shiftKey: true });
    expect(document.activeElement!.id).toBe('text');
    expect(counts()).toEqual([9, 3]);
  });
});

describe('Shift+Page Up / Shift+Page Down', () => {
  test('the focused piece moves to the next sheet and keeps the focus there; from the last, onto a new sheet; back with Shift+Page Up', () => {
    const moving = firstOn(s1);
    pieceNode(moving).focus();
    press('PageDown', { shiftKey: true });
    expect(counts()).toEqual([8, 4]);
    expect(focused()).toEqual({ piece: moving, sheet: s2, isSheet: false });
    expect(heard()).toBe('Se movió a la hoja 2 de 2.');
    press('PageDown', { shiftKey: true });
    const s3 = getDocument().sheets[2].id;
    expect(focused()).toEqual({ piece: moving, sheet: s3, isSheet: false });
    press('PageUp', { shiftKey: true });
    press('PageUp', { shiftKey: true });
    expect(focused()).toEqual({ piece: moving, sheet: s1, isSheet: false });
    expect(counts()).toEqual([9, 3, 0]);
  });

  test('a held key (repeat) or Alt moves nothing', () => {
    pieceNode(firstOn(s1)).focus();
    press('PageDown', { shiftKey: true, repeat: true });
    press('PageDown', { shiftKey: true, altKey: true });
    expect(counts()).toEqual([9, 3]);
  });
});

describe('D with a full sheet', () => {
  test('the copy goes to the next sheet and takes the focus', () => {
    const original = firstOn(s1);
    pieceNode(original).focus();
    press('d');
    expect(counts()).toEqual([9, 4]);
    const copy = getDocument().items.at(-1)!.id;
    expect(focused()).toEqual({ piece: copy, sheet: s2, isSheet: false });
  });
});
