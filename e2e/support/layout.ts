// Readers for the panels, the «Propiedades» tabs and the floating bars, shared
// by panels-and-tabs, reveal-from-list, piece-toolbar and context-menus. The
// `read*` functions run inside the page (page.evaluate).
import type { Page } from '@playwright/test';

export type Rect = { x: number; y: number; w: number; h: number };

/** How many px the page scrolls sideways (0 or less: no horizontal scroll). */
export const horizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

/** Waits until the browser has painted `n` more frames (after a scroll, the bars are placed on the next frame). */
export const frames = (page: Page, n = 2) =>
  page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        const step = (left: number) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
        step(count);
      }),
    n
  );

/** The «Propiedades» tabs: which is selected, which is the tab stop, which panels hide, and the focus. */
export const readTabs = () => {
  const tab = (name: string) => document.getElementById(`props-tab-${name}`)!;
  const panel = (name: string) => document.getElementById(`props-${name}`)!;
  const active = document.activeElement as HTMLElement | null;
  const piecePanel = panel('piece');
  return {
    selected: ['piece', 'sheet'].filter((name) => tab(name).getAttribute('aria-selected') === 'true').join(),
    tabStops: ['piece', 'sheet'].filter((name) => tab(name).tabIndex === 0).join(),
    hidden: { piece: piecePanel.hidden, sheet: panel('sheet').hidden },
    /** The focused element's id, or its class. */
    active: active?.id || String(active?.className ?? ''),
    /** The focused piece's id, if a piece has the focus. */
    activePiece: active?.classList.contains('piece') ? Number(active.dataset.id) : null,
    /** Pieza shows only its hint (nothing else of the panel is rendered). */
    hintOnly: [...piecePanel.querySelectorAll('*')].filter((el) => el.getClientRects().length && !el.closest('[hidden]')).every((el) => el.closest('#piece-empty') || el.id === 'section-piece'),
  };
};

/**
 * Controls smaller than 40 × 40 CSS px among `selector` (shown ones only). A
 * checkbox or radio counts with its label row, a range with its row.
 */
export const readSmallTargets = (selector: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)]
    .filter((el) => el.offsetParent && el.getBoundingClientRect().height > 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      const input = el as HTMLInputElement;
      const row = input.type === 'checkbox' || input.type === 'radio' ? (el.closest('label, .switch-row') ?? el) : input.type === 'range' ? (el.closest('.scale-row') ?? el) : el;
      const t = row.getBoundingClientRect();
      return { id: el.id || String(el.className), w: Math.round(Math.max(r.width, t.width)), h: Math.round(Math.max(r.height, t.height)) };
    })
    .filter((x) => x.h < 40 || x.w < 40)
    .map((x) => `${x.id} ${x.w}×${x.h}`);

/** a and b overlap (by more than `tol` px). */
export const hit = (a: Rect, b: Rect, tol = 0.5) => a.x < b.x + b.w - tol && b.x < a.x + a.w - tol && a.y < b.y + b.h - tol && b.y < a.y + a.h - tol;

/** a is inside b (half a px of tolerance). */
export const within = (a: Rect, b: Rect) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;
