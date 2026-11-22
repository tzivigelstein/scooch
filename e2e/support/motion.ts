// Helpers for the specs that follow pieces on screen frame by frame, with
// motion on: where each piece and the selection frame are at every frame
// after the pointer is let go, which CSS transitions started meanwhile (told
// by the browser's own event, never by catching a frame halfway: on a slow
// machine the first frame can come when the 180 ms are over), and the way a
// piece went from where it was to where it rests.
import { expect, type Page } from '@playwright/test';

/** A rectangle in window px. */
export type Box = { x: number; y: number; w: number; h: number };

export interface Noted {
  /** Where each piece was when the pointer was let go. */
  from: Box[];
  /** Every frame after that: where each piece and the selection frame were. */
  frames: { pieces: Box[]; frame: Box | null }[];
  /**
   * Which of left and top each piece started a CSS transition on after the
   * pointer was let go. Told by the browser's own event, not read at a
   * frame: on a slow machine the first frame can come when the 180 ms are over.
   */
  transitions: string[][];
  on: boolean;
}

/** From the moment the pointer is let go, notes at every frame where pieces `ids` (and the selection frame) are. */
export const noteDrop = (page: Page, ids: number[]) =>
  page.evaluate((ids) => {
    const w = window as unknown as { noted: Noted };
    const nodes = () => ids.map((id) => document.querySelector<HTMLElement>(`#sheets .piece[data-id="${id}"]`)!);
    const box = (el: HTMLElement | null) => {
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const noted: Noted = (w.noted = { from: [], frames: [], transitions: ids.map(() => []), on: true });
    addEventListener(
      'transitionrun',
      (e) => {
        const i = ids.indexOf(Number((e.target as HTMLElement).dataset?.id));
        const moves = e.propertyName === 'left' || e.propertyName === 'top';
        if (!noted.on || !noted.from.length || i < 0 || !moves || !(e.target as HTMLElement).matches('#sheets .piece')) return;
        noted.transitions[i] = [...new Set([...noted.transitions[i], e.propertyName])].sort();
      },
      true
    );
    const note = () => {
      if (!noted.on) return;
      noted.frames.push({ pieces: nodes().map((n) => box(n)!), frame: box(document.getElementById('frame')) });
      requestAnimationFrame(note);
    };
    // Before the app hears it: where the drag left them.
    const release = () => {
      noted.from = nodes().map((n) => box(n)!);
      requestAnimationFrame(note);
    };
    addEventListener('pointerup', release, { capture: true, once: true });
  }, ids);

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
