// Helpers for the specs that follow pieces on screen frame by frame, with
// motion on: where each piece, the selection frame and the pointer are at
// every frame after the pointer is pressed or let go, which CSS transitions
// started meanwhile (told by the browser's own event, never by catching a
// frame halfway: on a slow machine the first frame can come when the 180 ms
// are over), and the way a piece went from where it was to where it rests.
import { expect, type Page } from '@playwright/test';

/** A rectangle in window px. */
export type Box = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export interface Noted {
  /**
   * Where each piece was when the noting started: when the pointer was
   * pressed, or let go. Where a piece shows: its copy while it flies over to
   * another sheet (src/components/canvas/flights.ts), else the piece.
   */
  from: Box[];
  /** Where the pointer was then. */
  pointer: Point;
  /**
   * Every frame after that: where each piece, the selection frame and the
   * pointer were, whether its button was held, and whether some piece showed
   * twice (in flight and where it lands).
   */
  frames: { pieces: Box[]; frame: Box | null; pointer: Point; held: boolean; twice: boolean }[];
  /** Where each piece was when the pointer was let go (noted from the press: null until then). */
  released: Box[] | null;
  /**
   * Which of left and top each piece started a CSS transition on since the
   * noting started. Told by the browser's own event, not read at a frame: on
   * a slow machine the first frame can come when the 180 ms are over.
   */
  transitions: string[][];
  /** The same for the selection frame. */
  frameTransitions: string[];
  /** Whether the last change still animated when the noting started (#sheets.is-animating). */
  animating: boolean;
  on: boolean;
}

/**
 * From the moment the pointer is pressed (or let go, or clicks), before the
 * app hears it, notes at every frame where pieces `ids`, the selection frame
 * and the pointer are.
 */
const notePieces = (page: Page, ids: number[], start: 'pointerdown' | 'pointerup' | 'click') =>
  page.evaluate(
    ([ids, start]) => {
      const w = window as unknown as { noted: Noted };
      const piece = (id: number) => document.querySelector<HTMLElement>(`#sheets .piece[data-id="${id}"]`);
      const flight = (id: number) => document.querySelector<HTMLElement>(`#sheets .piece-flight[data-flight="${id}"]`);
      const nodes = () => ids.map((id) => flight(id) ?? piece(id)!);
      const twice = () => ids.some((id) => flight(id) && getComputedStyle(piece(id)!).opacity !== '0');
      const box = (el: HTMLElement | null) => {
        if (!el || el.hidden) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const noted: Noted = (w.noted = {
        from: [],
        pointer: { x: 0, y: 0 },
        frames: [],
        released: null,
        transitions: ids.map(() => []),
        frameTransitions: [],
        animating: false,
        on: true,
      });
      let pointer = { x: 0, y: 0 };
      let held = false;
      addEventListener('pointermove', (e) => (pointer = { x: e.clientX, y: e.clientY }), true);
      addEventListener('pointerdown', () => (held = true), true);
      addEventListener(
        'pointerup',
        () => {
          held = false;
          // Before the app hears it: where the drag left them.
          if (noted.from.length && !noted.released) noted.released = nodes().map((n) => box(n)!);
        },
        true
      );
      addEventListener(
        'transitionrun',
        (e) => {
          const target = e.target as HTMLElement;
          if (!noted.on || !noted.from.length || (e.propertyName !== 'left' && e.propertyName !== 'top')) return;
          if (target.id === 'frame') noted.frameTransitions = [...new Set([...noted.frameTransitions, e.propertyName])].sort();
          const i = ids.indexOf(Number(target.dataset?.id ?? target.dataset?.flight));
          if (i < 0 || !target.matches('#sheets .piece, #sheets .piece-flight')) return;
          noted.transitions[i] = [...new Set([...noted.transitions[i], e.propertyName])].sort();
        },
        true
      );
      const note = () => {
        if (!noted.on) return;
        noted.frames.push({ pieces: nodes().map((n) => box(n)!), frame: box(document.getElementById('frame')), pointer, held, twice: twice() });
        requestAnimationFrame(note);
      };
      addEventListener(
        start,
        (e: Event) => {
          pointer = { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
          noted.from = nodes().map((n) => box(n)!);
          noted.pointer = pointer;
          noted.animating = document.getElementById('sheets')!.classList.contains('is-animating');
          if (start !== 'pointerdown') noted.released = noted.from;
          requestAnimationFrame(note);
        },
        { capture: true, once: true }
      );
    },
    [ids, start] as const
  );

/** From the moment the pointer is let go, notes at every frame where pieces `ids` (and the selection frame) are. */
export const noteDrop = (page: Page, ids: number[]) => notePieces(page, ids, 'pointerup');

/** From the moment the pointer is pressed, notes at every frame where pieces `ids`, the selection frame and the pointer are. */
export const notePress = (page: Page, ids: number[]) => notePieces(page, ids, 'pointerdown');

/** From the next click (a button's: «Arrange»…), notes at every frame where pieces `ids` and the selection frame are. */
export const noteClick = (page: Page, ids: number[]) => notePieces(page, ids, 'click');

export interface NotedToolbar {
  /** At every frame: the piece toolbar's opacity and box, whether a list of options was open, and whether the canvas showed what a control does. */
  frames: { opacity: number; box: Box; open: boolean; preview: boolean }[];
  /** Each CSS transition the toolbar started (`opacity`, `transform`), and whether a list of options was open then. */
  transitions: { property: string; open: boolean }[];
  on: boolean;
}

/** From now on, notes at every frame how the piece toolbar shows (and which transitions it starts). */
export const noteToolbar = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { toolbar: NotedToolbar };
    const bar = () => document.getElementById('piecebar')!;
    const open = () => !!document.querySelector('[role="combobox"][aria-expanded="true"]');
    const noted: NotedToolbar = (w.toolbar = { frames: [], transitions: [], on: true });
    addEventListener(
      'transitionrun',
      (e) => {
        if (noted.on && e.target === bar()) noted.transitions.push({ property: e.propertyName, open: open() });
      },
      true
    );
    const note = () => {
      if (!noted.on) return;
      const r = bar().getBoundingClientRect();
      noted.frames.push({ opacity: Number(getComputedStyle(bar()).opacity), box: { x: r.x, y: r.y, w: r.width, h: r.height }, open: open(), preview: !!document.querySelector('.preview') });
      requestAnimationFrame(note);
    };
    requestAnimationFrame(note);
  });

/** Stops noting the toolbar and returns what was noted. */
export const toolbarNoted = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { toolbar: NotedToolbar };
    w.toolbar.on = false;
    return w.toolbar;
  });

/** Waits until the pieces have kept still for 10 frames and returns what was noted. */
export async function dropNoted(page: Page) {
  const still = () =>
    page.evaluate(() => {
      const f = (window as unknown as { noted: Noted }).noted.frames.map((frame) => JSON.stringify(frame));
      let n = 0;
      while (n < f.length - 1 && f[f.length - 2 - n] === f.at(-1)) n++;
      return n;
    });
  await expect.poll(still, { message: 'the pieces come to rest' }).toBeGreaterThanOrEqual(10);
  return page.evaluate(() => {
    const w = window as unknown as { noted: Noted };
    w.noted.on = false;
    return w.noted;
  });
}

/** Until the last change's animation is over (it would make the drag glide behind the pointer too). */
export const animationsOver = (page: Page) => expect(page.locator('#sheets')).not.toHaveClass(/\bis-animating\b/);

/** px: a piece on its way may be this far off the straight line, or back. */
export const TOL = 1;

/**
 * The way piece `i` went: the farthest it strayed from the straight line
 * between where it was let go and where it rests, and how far it ever went
 * back from where it rests after having been closer.
 */
export function wayOf(noted: Noted, i: number) {
  const from = noted.from[i];
  const at = noted.frames.map((f) => f.pieces[i]);
  const to = at.at(-1)!;
  const dist = (a: Box, b: Box) => Math.hypot(a.x - b.x, a.y - b.y);
  const off = (p: Box) => {
    const [vx, vy] = [to.x - from.x, to.y - from.y];
    const len2 = vx * vx + vy * vy;
    const k = len2 ? Math.min(1, Math.max(0, ((p.x - from.x) * vx + (p.y - from.y) * vy) / len2)) : 0;
    return Math.hypot(p.x - from.x - k * vx, p.y - from.y - k * vy);
  };
  let closest = dist(from, to);
  let back = 0;
  for (const p of at) {
    back = Math.max(back, dist(p, to) - closest);
    closest = Math.min(closest, dist(p, to));
  }
  const round = (p: Box) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
  return {
    strayed: Math.max(...at.map(off)),
    back,
    travel: dist(from, to),
    seen: `${JSON.stringify(round(from))} let go → ${JSON.stringify(at.map(round))}`,
  };
}

/**
 * It went straight from where it was let go to where it rests, gliding. That
 * it glides is told by the transition the browser started on its position,
 * not by catching it halfway: a slow machine's first frame can come when the
 * 180 ms are over.
 */
export function expectGlide(noted: Noted, i: number) {
  const way = wayOf(noted, i);
  expect(way.travel, `it had a way to go: ${way.seen}`).toBeGreaterThan(10 * TOL);
  expect(noted.transitions[i], 'its position glides').not.toEqual([]);
  expect(way.back, `never away from where it ends: ${way.seen}`).toBeLessThanOrEqual(TOL);
  expect(way.strayed, `straight from where it was let go: ${way.seen}`).toBeLessThanOrEqual(TOL);
}

/** The selection frame was on the piece at every frame. */
export function expectFrameOnPiece(noted: Noted) {
  const apart = noted.frames.map((f) => (f.frame ? Math.max(Math.abs(f.frame.x - f.pieces[0].x), Math.abs(f.frame.y - f.pieces[0].y)) : Infinity));
  expect(Math.max(...apart), `the frame with the piece (px apart at each frame: ${apart.map((d) => Math.round(d)).join(', ')})`).toBeLessThanOrEqual(TOL);
}
