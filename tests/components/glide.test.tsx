// The glide on the stage, frame by frame: it scrolls the way it was sent and
// slows down until it stops, stops at the end of the scroll, goes sideways
// only when the sheets are wider than the stage, doesn't run with reduced
// motion, and whatever else moves the view stops it at once: revealing a
// piece or a sheet, the zoom, going back to the start. Its physics are tested
// in tests/core/glide.test.js; with fingers, in e2e/specs/pinch-zoom.spec.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { glideDistance } from '../../src/core/glide.js';
import { fromPercent } from '../../src/core/zoom.js';
import { startGlide, stopGlide } from '../../src/components/canvas/glide.ts';
import { revealPiece, revealSheet, scrollToStart, zoomTo } from '../../src/components/canvas/viewport.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

let now = 0;
let nextId = 1;
let queued = new Map<number, FrameRequestCallback>();
let reduced = false;
let stage: HTMLElement;

/** Runs the animation frame `ms` after the last one; returns the stage's scroll then. */
function frame(ms = 16) {
  now += ms;
  const due = [...queued.values()];
  queued = new Map();
  for (const callback of due) callback(now);
  return { top: stage.scrollTop, left: stage.scrollLeft };
}

/** Runs frames until nothing asks for another one; returns the scroll after each. */
function untilStill(ms = 16) {
  const seen: { top: number; left: number }[] = [];
  while (queued.size && seen.length < 1000) seen.push(frame(ms));
  return seen;
}

beforeEach(() => {
  now = 0;
  queued = new Map();
  reduced = false;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queued.set(nextId, callback);
    return nextId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }));
  document.body.innerHTML = '<div id="canvas"><div id="stage"><div id="sheets"></div></div></div>';
  stage = document.getElementById('stage')!;
  const size = { scrollHeight: 5000, clientHeight: 800, scrollWidth: 1200, clientWidth: 390 };
  for (const [key, value] of Object.entries(size)) Object.defineProperty(stage, key, { value, configurable: true });
  stage.scrollTop = 1000;
  resetState({ items: [piece(1, fakeImageMm(50, 30), 10, 10)] });
});

afterEach(() => {
  stopGlide();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('the glide', () => {
  test('scrolls the way it was sent, less each frame, until it stops where its speed gives out', () => {
    startGlide({ x: 0, y: 1.5 });
    const seen = untilStill();
    const steps = seen.map((p, i) => p.top - (i ? seen[i - 1].top : 1000));
    expect(steps.every((step) => step >= 0)).toBe(true);
    expect(steps.slice(1).every((step, i) => step <= steps[i] + 1e-9)).toBe(true);
    expect(seen.at(-1)!.top - 1000).toBeCloseTo(glideDistance(1.5), 6);
    expect(frame().top, 'and stays there').toBe(seen.at(-1)!.top);
  });

  test('stops at the end of the scroll', () => {
    stage.scrollTop = 4000;
    startGlide({ x: 0, y: 1.5 });
    const seen = untilStill();
    expect(seen.at(-1)!.top).toBe(5000 - 800);
    expect(seen.every((p) => p.top <= 4200)).toBe(true);
  });

  test('goes sideways only when the sheets are wider than the stage', () => {
    startGlide({ x: 1, y: 0 });
    expect(untilStill().at(-1)!.left).toBe(0);
    stage.classList.add('is-wide');
    startGlide({ x: 1, y: 0 });
    expect(untilStill().at(-1)!.left).toBeCloseTo(glideDistance(1), 6);
  });

  test('doesn’t run with reduced motion, nor when it is too slow to see', () => {
    reduced = true;
    startGlide({ x: 0, y: 1.5 });
    expect(queued.size).toBe(0);
    reduced = false;
    startGlide({ x: 0, y: 0.01 });
    expect(queued.size).toBe(0);
    expect(stage.scrollTop).toBe(1000);
  });

  const stoppers: [string, () => void][] = [
    ['revealing a piece', () => revealPiece(1)],
    ['revealing a sheet', () => revealSheet(1)],
    ['the zoom', () => zoomTo(fromPercent(200))],
    ['going back to the start', scrollToStart],
  ];
  test.each(stoppers)('%s stops it at once', (_, stop) => {
    startGlide({ x: 0, y: 1.5 });
    frame();
    frame();
    expect(stage.scrollTop).toBeGreaterThan(1000);
    stop();
    const after = stage.scrollTop;
    expect(queued.size, 'no frame asked for').toBe(0);
    expect(frame().top).toBe(after);
  });

  test('a new glide replaces the one going on', () => {
    startGlide({ x: 0, y: 1.5 });
    frame();
    startGlide({ x: 0, y: -1 });
    expect(queued.size).toBe(1);
    const before = stage.scrollTop;
    expect(frame().top).toBeLessThan(before);
  });
});
