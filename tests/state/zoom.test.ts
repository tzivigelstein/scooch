// @vitest-environment jsdom
// The zoom is view state: zooming (levels, the wheel's factor, the fits'
// modes) never enters the undo history, and undoing a change of the document
// leaves the zoom where it is. Also what the zoom says to screen readers.
// (zoomTo measures #stage and #sheets, hence jsdom.)
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fitSheet, stepZoom, zoomBy, zoomTo } from '../../src/components/canvas/viewport.ts';
import { fromPercent, toPercent } from '../../src/core/zoom.js';
import { redoLast, undoLast } from '../../src/state/actions/edit.ts';
import { getDocument, patchItem } from '../../src/state/document.ts';
import { commit, historyDepth } from '../../src/state/history.ts';
import { getView, setView } from '../../src/state/view.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const pct = () => toPercent(getView().zoom);

/** Every way the view zooms: buttons and keys (stepZoom), the wheel (zoomBy), the menu (zoomTo), a fit's mode. */
function zoomAround() {
  stepZoom(1);
  stepZoom(1);
  zoomBy(1.6);
  zoomTo(fromPercent(200));
  zoomTo(fromPercent(33), { mode: 'fit' });
  stepZoom(-1);
}

beforeEach(() => {
  vi.useFakeTimers();
  // (No padding on the stage: jsdom has no layout, and the fits read it.)
  document.body.innerHTML = '<div id="canvas"><div id="stage" style="padding: 0"><div id="sheets"></div></div></div><div id="live-polite"></div><div id="live-assertive"></div>';
  const a = fakeImageMm(50, 40);
  resetState({ items: [piece(1, a, 20, 20)] });
  setView({ zoom: fromPercent(100), zoomMode: 'manual' });
});
afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('zoom and the undo history', () => {
  test('zooming never adds an undo step', () => {
    zoomAround();
    expect(pct()).not.toBeCloseTo(100, 3);
    expect(historyDepth()).toEqual({ undo: 0, redo: 0 });
    expect(getDocument().canUndo).toBe(false);
  });

  test('after zooming, undo undoes the last change of the document and leaves the zoom as it is', () => {
    commit();
    patchItem(1, { x: 35 });
    expect(historyDepth()).toEqual({ undo: 1, redo: 0 });
    zoomAround();
    const zoomed = getView().zoom;
    expect(historyDepth()).toEqual({ undo: 1, redo: 0 });
    undoLast();
    expect(getDocument().items[0].x).toBe(20);
    expect(getView().zoom).toBe(zoomed);
    redoLast();
    expect(getDocument().items[0].x).toBe(35);
    expect(getView().zoom).toBe(zoomed);
  });
});

describe('what the zoom says', () => {
  const live = () => (document.getElementById('live-polite')!.textContent ?? '').replace(/\s/g, ' ').trim();

  test('a level step says its level once the presses stop', () => {
    stepZoom(1);
    stepZoom(1);
    vi.advanceTimersByTime(400);
    expect(live()).toMatch(/^Zoom 150 %/);
  });

  // + (or Ctrl + =) says its level 300 ms later; a fit chosen meanwhile must
  // not be followed by that stale level.
  test('a fit right after + is the last thing said', () => {
    stepZoom(1);
    fitSheet('fit', 1);
    vi.advanceTimersByTime(400);
    expect(live()).toMatch(/^Se ve la hoja entera/);
  });
});
