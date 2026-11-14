// Fingers on a touch screen, through the DevTools protocol
// (Input.dispatchTouchEvent): the browser handles them as a touch screen's,
// so touch-action, its own scrolling and its page zoom take part, and the page
// gets pointer and touch events in the order a phone sends them.
import type { CDPSession, Page } from '@playwright/test';
import { frames } from './canvas.ts';

export interface Spot {
  x: number;
  y: number;
}

export class Fingers {
  private readonly down = new Map<number, Spot>();

  private constructor(
    private readonly page: Page,
    private readonly cdp: CDPSession
  ) {}

  static async on(page: Page) {
    return new Fingers(page, await page.context().newCDPSession(page));
  }

  // Every event lists the fingers still down; the browser compares them with the last one's.
  private send(type: 'touchStart' | 'touchMove' | 'touchEnd') {
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...this.down].map(([id, p]) => ({ id, x: p.x, y: p.y })) });
  }

  /** Puts fingers down (id → where), next to any already down. */
  async press(fingers: Record<number, Spot>) {
    for (const [id, p] of Object.entries(fingers)) this.down.set(Number(id), p);
    await this.send('touchStart');
  }

  /** Moves fingers already down (id → where) and waits a frame, as a phone sends a move a frame. */
  async move(fingers: Record<number, Spot>) {
    for (const [id, p] of Object.entries(fingers)) this.down.set(Number(id), p);
    await this.send('touchMove');
    await frames(this.page, 1);
  }

  /** Lifts fingers (all of them by default) and waits until the page has drawn what followed. */
  async lift(...ids: number[]) {
    for (const id of ids.length ? ids : [...this.down.keys()]) this.down.delete(id);
    await this.send('touchEnd');
    await frames(this.page);
  }

  /**
   * Fingers 1 and 2 side by side across `at`, `from` px apart, going to `to`
   * px apart in `steps` moves while their midpoint moves by `shift`; then lifted.
   */
  async pinch(at: Spot, from: number, to: number, { steps = 8, shift = { x: 0, y: 0 } } = {}) {
    const pair = (i: number) => {
      const d = from + ((to - from) * i) / steps;
      const x = at.x + (shift.x * i) / steps;
      const y = at.y + (shift.y * i) / steps;
      return { 1: { x: x - d / 2, y }, 2: { x: x + d / 2, y } };
    };
    await this.press(pair(0));
    for (let i = 1; i <= steps; i++) await this.move(pair(i));
    await this.lift();
  }
}
