// @vitest-environment jsdom
// Which zoom keys the app takes and which stay the browser's: KeyboardEvents
// through the real hooks (useGlobalShortcuts for the keys, useCanvasGestures
// for «the pointer is over the canvas»). Ctrl/⌘ + wheel around the pointer is
// geometry: e2e/specs/zoom-and-pan.spec.ts.
import { cleanup, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fromPercent, toPercent } from '../../src/core/zoom.js';
import { useCanvasGestures } from '../../src/hooks/useCanvasGestures.ts';
import { useGlobalShortcuts } from '../../src/hooks/useGlobalShortcuts.ts';
import { getView, setView } from '../../src/state/view.ts';
import { resetState } from '../support/state.ts';

function Harness() {
  const stage = useRef<HTMLDivElement>(null);
  useGlobalShortcuts();
  useCanvasGestures(stage);
  return (
    <>
      <div id="canvas">
        <div id="stage" ref={stage}>
          <div id="sheets" />
        </div>
      </div>
      <aside className="panel">
        <input id="pos-x" />
      </aside>
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
}

const canvas = () => document.getElementById('canvas')!;
const pct = () => toPercent(getView().zoom);

/** Dispatches Ctrl + `key` on `target`; returns whether the app took it (preventDefault). */
function ctrl(key: string, target: Element = document.body) {
  const e = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

const pointerOnCanvas = () => fireEvent(canvas(), new Event('pointerenter'));
const pointerOffCanvas = () => fireEvent(canvas(), new Event('pointerleave'));

beforeEach(() => {
  vi.useFakeTimers();
  resetState();
  setView({ zoom: fromPercent(100), zoomMode: 'manual' });
  render(<Harness />);
});
afterEach(() => {
  pointerOffCanvas();
  cleanup();
  vi.useRealTimers();
});

describe('zoom keys', () => {
  test('with the pointer over the canvas, Ctrl + = and Ctrl + − zoom the sheets one level, not the page', () => {
    pointerOnCanvas();
    expect(ctrl('=')).toBe(true);
    expect(pct()).toBeCloseTo(125, 6);
    expect(ctrl('+')).toBe(true);
    expect(pct()).toBeCloseTo(150, 6);
    expect(ctrl('-')).toBe(true);
    expect(ctrl('-')).toBe(true);
    expect(pct()).toBeCloseTo(100, 6);
  });

  test('with the focus on the canvas (and the pointer elsewhere), Ctrl + = zooms too', () => {
    pointerOffCanvas();
    expect(ctrl('=', document.getElementById('sheets')!)).toBe(true);
    expect(pct()).toBeCloseTo(125, 6);
  });

  test('Ctrl 0 is never taken, not even over the canvas', () => {
    pointerOnCanvas();
    expect(ctrl('0')).toBe(false);
    expect(ctrl('0', document.getElementById('sheets')!)).toBe(false);
    expect(pct()).toBeCloseTo(100, 6);
  });

  test('with the pointer and the focus off the canvas, Ctrl + / − stay the browser’s', () => {
    pointerOffCanvas();
    for (const key of ['+', '=', '-', '_']) expect(ctrl(key), key).toBe(false);
    expect(pct()).toBeCloseTo(100, 6);
  });

  test('typing in a field, Ctrl + = doesn’t zoom the canvas even with the pointer over it', () => {
    pointerOnCanvas();
    const field = document.getElementById('pos-x')!;
    field.focus();
    expect(ctrl('=', field)).toBe(false);
    expect(ctrl('-', field)).toBe(false);
    expect(pct()).toBeCloseTo(100, 6);
  });
});
