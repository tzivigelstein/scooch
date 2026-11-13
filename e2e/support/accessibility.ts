// The accessibility catalogue's machinery: every UI state is built once per
// viewport and checked in light and dark (switching with emulateMedia, the same
// page): axe with no violations; three layout detectors that read the
// rendered page — text clipped without an ellipsis, a one-line control wrapped
// onto two lines, interactive controls covering each other; no horizontal
// scroll; and text contrast inside modal dialogs, where axe can't measure it.
// Screenshots of each state (up to 1440 px) are attached as artifacts.
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { expect, test, type App } from './test.ts';

/** The rules axe checks: WCAG 2.0 and 2.1, A and AA, and best practices. */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

export interface Size {
  width: number;
  height: number;
}

/** The layouts: columns (desktop), the left drawer (≤ 1099 px), the bottom sheet (≤ 799 px), and a wide screen. */
export const DESKTOP: Size = { width: 1440, height: 900 };
export const MEDIUM: Size = { width: 1024, height: 768 };
export const PHONE: Size = { width: 390, height: 844 };
export const WIDE: Size = { width: 2560, height: 1440 };

export const sizeTitle = (s: Size) => `at ${s.width} × ${s.height}`;

export type Scheme = 'light' | 'dark';
export const SCHEMES: readonly Scheme[] = ['light', 'dark'];

// ---------- Detectors (run in the page) ----------

export interface Layout {
  /** Text cut off by overflow hidden/clip without an ellipsis. */
  clipped: string[];
  /** A control or label meant to be one line, shown on two or more. */
  wrapped: string[];
  /** Visible interactive controls whose boxes intersect though nothing allows it. */
  overlapping: string[];
  /** How many px the page scrolls sideways (0 = none). */
  overflowX: number;
}

/**
 * Reads the rendered page for the three layout problems. Runs in the browser
 * (no closures): everything it needs is inside.
 */
export const readLayout = (): Layout => {
  const clipped: string[] = [];
  const wrapped: string[] = [];
  const overlapping: string[] = [];

  const styleCache = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element) => {
    let cs = styleCache.get(el);
    if (!cs) styleCache.set(el, (cs = getComputedStyle(el)));
    return cs;
  };
  const ancestors = (el: Element) => {
    const list: Element[] = [];
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) list.push(a);
    return list;
  };
  // Not shown: hidden, a closed dialog, visually hidden (sr-only, clip-path), invisible.
  const hiddenish = (el: Element) =>
    !!el.closest('[hidden], dialog:not([open]), .sr-only') ||
    ancestors(el).some((a) => {
      const cs = style(a);
      return cs.clipPath !== 'none' || cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0';
    });
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && !hiddenish(el);
  };
  const name = (el: Element) => {
    const id = el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`;
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50) || el.getAttribute('aria-label') || '';
    return `${id} «${text}»`;
  };

  // 1. Clipped: a box that hides its overflow and whose content is wider, without «…».
  //    Containers that scroll or clip on purpose (the canvas, panels, lists,
  //    dialogs, images) are left out, as are form fields (their text scrolls).
  const CONTAINERS = 'svg, img, input, select, textarea, .sheet, .piece, .stage, .canvas, .panel, .piece-list, dialog, .dialog-body, .grid-layer, .thumb, body, .workspace';
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') || el.matches(CONTAINERS)) continue;
    // Text: a box with no text (an image's window) clips nothing readable.
    if (!el.textContent?.trim() || !visible(el)) continue;
    const cs = style(el);
    if (cs.textOverflow === 'ellipsis') continue;
    if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1) clipped.push(`${name(el)} ${el.scrollWidth} > ${el.clientWidth} px`);
  }

  // 2. Wrapped: buttons, labels, badges and headings meant to be one line,
  //    counted by the distinct line boxes of their text. (Not the tooltip's
  //    line: the tooltip has a max width so a long label wraps by design, and
  //    its keys sit beside the label in a flex row whatever the label does.)
  const ONE_LINE =
    '.btn, .chip-btn, .dock-btn, .pill-action, .seg > span, .text-btn, kbd, .off-badge, .piecebar-size, .paper-label, .section-toggle, .panel-title, .field-label, .foot-count, .dock-count, legend, th, .row-dims, .page-label, .add-sheet, .project-status, .group-head, .projects-note, .project-badge';
  for (const el of document.querySelectorAll(ONE_LINE)) {
    if (!visible(el)) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const middles: number[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || hiddenish(n.parentElement!)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 1) middles.push(r.top + r.height / 2);
    }
    middles.sort((a, b) => a - b);
    let lines = middles.length ? 1 : 0;
    for (let i = 1; i < middles.length; i++) if (middles[i] - middles[i - 1] > 6) lines++;
    if (lines > 1) wrapped.push(`${name(el)} on ${lines} lines`);
  }

  // 3. Overlapping: visible controls whose boxes (cut to what their scrolling
  //    ancestors show) intersect by more than a pixel each way, unless the
  //    layering allows it. Layers, bottom to top:
  //      0 the canvas's content (sheet titles, «quitar hoja», «agregar hoja»), which scrolls;
  //      1 the app's chrome (top bar, columns, the zoom control, the dock);
  //      2 the notice and the selection's toolbar, floating over the canvas;
  //      3 a panel sliding over everything (the drawer, the bottom sheet);
  //      4 menus and tooltips.
  //    A higher layer may cover a lower one, except: the notice or the toolbar
  //    over the chrome (they must stay clear of the zoom control and the dock),
  //    a menu over the control that opened it, and the chrome over canvas
  //    content that can't be scrolled out from under it. In one layer, two
  //    controls may only meet when one is pinned (sticky/fixed) over content
  //    that scrolls beneath it and can be scrolled clear.
  //    What floats over the canvas counts as one box with its text (the
  //    notice, the toolbar, the zoom control): covering the notice's text hides
  //    it as much as covering its button.
  const FLOATING = '#pill, #piecebar, .zoom-control';
  const CONTROLS =
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="switch"], [role="slider"], [role="spinbutton"], [role="combobox"]';
  // A modal dialog makes the rest inert: only its controls count.
  const modal = [...document.querySelectorAll('dialog')].filter((d) => d.matches(':modal')).at(-1) ?? null;
  type Box = { el: Element; x0: number; y0: number; x1: number; y1: number; layer: number; group: Element | null };
  const layerOf = (el: Element): [number, Element | null] => {
    const popup = el.closest('[role="menu"], [role="tooltip"]');
    if (popup) return [4, popup];
    const panel = el.closest('.panel');
    if (panel && ['fixed', 'absolute'].includes(style(panel).position)) return [3, panel];
    const floating = el.closest('#pill, #piecebar');
    if (floating) return [2, floating];
    if (el.closest('#sheets')) return [0, null];
    return [1, null];
  };
  const shown = (el: Element): Box | null => {
    const r = el.getBoundingClientRect();
    let x0 = Math.max(r.left, 0);
    let y0 = Math.max(r.top, 0);
    let x1 = Math.min(r.right, innerWidth);
    let y1 = Math.min(r.bottom, innerHeight);
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = style(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = a.getBoundingClientRect();
      x0 = Math.max(x0, c.left);
      y0 = Math.max(y0, c.top);
      x1 = Math.min(x1, c.right);
      y1 = Math.min(y1, c.bottom);
    }
    const [layer, group] = layerOf(el);
    return x1 - x0 > 1 && y1 - y0 > 1 ? { el, x0, y0, x1, y1, layer, group } : null;
  };
  /** The nearest ancestor that scrolls (and has something to scroll). */
  const scroller = (el: Element) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = style(a);
      if (/auto|scroll/.test(cs.overflowY + cs.overflowX) && (a.scrollHeight > a.clientHeight + 1 || a.scrollWidth > a.clientWidth + 1)) return a;
    }
    return null;
  };
  /**
   * Whether `covered` can be scrolled out from under `cover`: its scrolling
   * ancestor doesn't move `cover` (outside it, or pinned with sticky/fixed),
   * and has room to scroll it clear while it stays in view.
   */
  const scrollsClear = (covered: Element, cover: Element) => {
    const s = scroller(covered);
    if (!s) return false;
    let pinned = !s.contains(cover);
    for (let a: Element | null = cover; !pinned && a && a !== s; a = a.parentElement) pinned = ['sticky', 'fixed'].includes(style(a).position);
    if (!pinned) return false;
    const c = covered.getBoundingClientRect();
    const k = cover.getBoundingClientRect();
    const v = s.getBoundingClientRect();
    const top = v.top + s.clientTop;
    const bottom = top + s.clientHeight;
    const left = v.left + s.clientLeft;
    const right = left + s.clientWidth;
    const down = k.bottom - c.top; // moving the content down (scrolling up) by this clears it
    const up = c.bottom - k.top;
    const rightward = k.right - c.left;
    const leftward = c.right - k.left;
    return (
      (down <= s.scrollTop && c.bottom + down <= bottom) ||
      (up <= s.scrollHeight - s.clientHeight - s.scrollTop && c.top - up >= top) ||
      (rightward <= s.scrollLeft && c.right + rightward <= right) ||
      (leftward <= s.scrollWidth - s.clientWidth - s.scrollLeft && c.left - leftward >= left)
    );
  };
  const allowed = (low: Box, high: Box) => {
    if (low.layer === high.layer && low.group === high.group) return scrollsClear(low.el, high.el) || scrollsClear(high.el, low.el);
    if (low.layer === high.layer) return false; // two different popups, or the notice and the toolbar
    if (high.layer === 4) {
      const id = high.group?.getAttribute('role') === 'menu' ? high.group.id : '';
      return !id || !(low.el.getAttribute('aria-controls') === id || low.el.querySelector(`[aria-controls="${id}"]`));
    }
    if (high.layer === 3) return true;
    if (high.layer === 2) return low.layer === 0;
    return scrollsClear(low.el, high.el); // the chrome over the canvas's content
  };
  const units = [...document.querySelectorAll(FLOATING), ...[...document.querySelectorAll(CONTROLS)].filter((el) => !el.closest(FLOATING))];
  const boxes = units
    .filter((el) => !el.closest('[inert]') && (!modal || modal.contains(el)) && !el.matches('.piece, .sheet') && !hiddenish(el))
    .map(shown)
    .filter((b): b is Box => !!b);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = boxes[i].layer <= boxes[j].layer ? [boxes[i], boxes[j]] : [boxes[j], boxes[i]];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (w <= 1 || h <= 1 || allowed(a, b)) continue;
      overlapping.push(`${name(a.el)} × ${name(b.el)} (${Math.round(w)} × ${Math.round(h)} px)`);
    }

  return { clipped: [...new Set(clipped)], wrapped: [...new Set(wrapped)], overlapping, overflowX: Math.max(0, document.documentElement.scrollWidth - innerWidth) };
};

/**
 * Text contrast inside an open modal dialog, which axe can't measure: in the
 * top layer its color-contrast check comes back «incomplete» (bgOverlap) for
 * every text node, so a theme's colors in dialogs would go unchecked. Each
 * visible text's color (with its opacity) against the backgrounds behind it,
 * composited up to the first opaque one; WCAG AA: 4.5:1, or 3:1 for large text.
 * Disabled controls are exempt, as in WCAG. Runs in the browser.
 */
export const readDialogContrast = (): string[] => {
  const modal = [...document.querySelectorAll('dialog')].filter((d) => d.matches(':modal')).at(-1);
  if (!modal) return [];
  type Rgba = [number, number, number, number];
  const parse = (c: string): Rgba | null => {
    let m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
    if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    m = c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/);
    if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
    return null;
  };
  const over = (top: Rgba, below: Rgba): Rgba => {
    const a = top[3] + below[3] * (1 - top[3]);
    const mix = (i: number) => (top[i] * top[3] + below[i] * below[3] * (1 - top[3])) / a;
    return [mix(0), mix(1), mix(2), a];
  };
  const luminance = (c: Rgba) => {
    const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const out = new Set<string>();
  const walker = document.createTreeWalker(modal, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement!;
    if (!n.textContent?.trim() || el.closest('[hidden], .sr-only, :disabled, [aria-disabled="true"]')) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    // The backgrounds behind it, up to the first opaque one, and the opacity on the way.
    const layers: Rgba[] = [];
    let opacity = 1;
    let unknown = false;
    for (let a: Element | null = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.visibility === 'hidden' || cs.display === 'none') unknown = true;
      opacity *= Number(cs.opacity);
      if (cs.backgroundImage !== 'none') unknown = true; // a gradient or an image: not measurable here
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0) layers.push(bg);
      if ((bg && bg[3] >= 1) || a === modal) break;
    }
    const fg = parse(getComputedStyle(el).color);
    if (unknown || !fg || opacity === 0 || !layers.length || layers.at(-1)![3] < 1) continue;
    const bg = layers.reduceRight<Rgba>((below, top) => over(top, below), [0, 0, 0, 0]);
    const ink = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
    const [hi, lo] = [luminance(ink), luminance(bg)].sort((a, b) => b - a);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (Number(cs.fontWeight) >= 700 && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio < need - 0.005) {
      const rgb = (c: Rgba) => `rgb(${c.slice(0, 3).map(Math.round).join(' ')})`;
      out.add(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : [...el.classList].map((c) => `.${c}`).join('')} «${n.textContent.trim().slice(0, 40)}» ${ratio.toFixed(2)}:1 < ${need}:1 (${rgb(ink)} on ${rgb(bg)})`);
    }
  }
  return [...out];
};

// ---------- Known product problems ----------

/**
 * Detector findings that are real product problems, each documented by a
 * `test.fail` test (named in `documentedBy`): the catalogue doesn't fail on
 * them again, and when the product is fixed that test starts passing and
 * Playwright reports it, so the entry gets removed.
 */
export interface KnownProblem {
  kind: 'clipped' | 'wrapped' | 'overlapping';
  /** Matches the finding's text. */
  finding: RegExp;
  widths: readonly number[];
  documentedBy: string;
}

export const KNOWN_PROBLEMS: readonly KnownProblem[] = [
  {
    kind: 'wrapped',
    finding: /^span\.row-dims «[^»]* · pág\. \d+» on \d+ lines$/,
    widths: [DESKTOP.width],
    documentedBy: 'e2e/specs/accessibility.spec.ts › known layout problems › a PDF page’s row in the piece list shows its size and page on one line',
  },
];

const isKnown = (kind: KnownProblem['kind'], width: number, finding: string) =>
  KNOWN_PROBLEMS.some((k) => k.kind === kind && k.widths.includes(width) && k.finding.test(finding));

// ---------- The scanner ----------

/** Waits until the page is still: fonts loaded, two frames drawn, no tooltip left over from the pointer. */
async function settle(page: Page, keepPointer: boolean) {
  if (!keepPointer) {
    // The pointer rests where nothing has a tooltip or reacts to hover, so a
    // tooltip that only shows with the pointer doesn't come or go mid-scan.
    const spot = await page.evaluate(() => {
      const quiet = (x: number, y: number) => {
        const el = document.elementFromPoint(x, y);
        return !!el && !el.closest('[data-tip], button, a, input, select, label, summary, [role], .piece, .sheet, .page-head');
      };
      const w = innerWidth;
      const h = innerHeight;
      const candidates: [number, number][] = [
        [w - 2, h - 2],
        [2, h - 2],
        [w / 2, h - 2],
        [w - 2, h / 2],
        [2, h / 2],
        [w / 2, 2],
      ];
      return candidates.find(([x, y]) => quiet(x, y)) ?? null;
    });
    if (spot) await page.mouse.move(spot[0], spot[1]);
  }
  // A tooltip still showing must belong to the focused element (keyboard
  // focus shows it on purpose); one from the pointer goes away.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const tip = document.getElementById('tooltip');
          if (!tip || tip.hidden) return true;
          const owner = document.activeElement?.closest<HTMLElement>('[data-tip]');
          return !!owner && tip.textContent!.startsWith(owner.dataset.tip ?? '\u0000');
        }),
      { message: 'no tooltip left over from the pointer' }
    )
    .toBe(true);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))));
}

const axeSummary = (violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) =>
  violations.flatMap((v) => v.nodes.map((n) => `${v.impact}:${v.id} ${n.target.join(' ')} — ${(n.failureSummary ?? '').split('\n').slice(0, 2).join(' ')}`));

export interface CheckOptions {
  /** The mouse is held (mid-drag) or rests on purpose: don't move it. */
  keepPointer?: boolean;
}

/**
 * Checks the states of one flow at one viewport. Each `state()` checks what
 * shows in light and dark (the same page, the color scheme switched with
 * emulateMedia) and leaves the page in light. Findings are soft assertions:
 * the flow goes on and the report lists every state that failed.
 */
export class Catalogue {
  scans = 0;
  constructor(
    readonly app: App,
    private readonly info: TestInfo,
    readonly size: Size
  ) {}

  get page() {
    return this.app.page;
  }
  get width() {
    return this.size.width;
  }
  /** The bottom-sheet layout (phones). */
  get narrow() {
    return this.size.width < 800;
  }
  /** The pieces list shows as a drawer or a sheet, not as a column. */
  get listHidden() {
    return this.size.width < 1100;
  }

  async state(name: string, options: CheckOptions = {}) {
    await test.step(`«${name}»`, async () => {
      await settle(this.page, !!options.keepPointer);
      for (const scheme of SCHEMES) {
        await this.page.emulateMedia({ colorScheme: scheme });
        const where = `«${name}» at ${this.width} px, ${scheme}`;
        const result = await new AxeBuilder({ page: this.page }).withTags(AXE_TAGS).analyze();
        this.scans++;
        expect.soft(axeSummary(result.violations), `axe violations in ${where}`).toEqual([]);
        const layout = await this.page.evaluate(readLayout);
        expect.soft(layout.clipped.filter((f) => !isKnown('clipped', this.width, f)), `text clipped without an ellipsis in ${where}`).toEqual([]);
        expect.soft(layout.wrapped.filter((f) => !isKnown('wrapped', this.width, f)), `one-line controls wrapped in ${where}`).toEqual([]);
        expect.soft(layout.overlapping.filter((f) => !isKnown('overlapping', this.width, f)), `controls covering each other in ${where}`).toEqual([]);
        expect.soft(layout.overflowX, `horizontal scroll in ${where}`).toBe(0);
        expect.soft(await this.page.evaluate(readDialogContrast), `text contrast in the modal dialog (where axe can't measure it) in ${where}`).toEqual([]);
        // An artifact, not an assertion (kept under the test's results/…/attachments and in the report).
        if (this.width <= DESKTOP.width) await this.info.attach(`${name} · ${this.width} px · ${scheme}`, { body: await this.page.screenshot(), contentType: 'image/png' });
      }
      await this.page.emulateMedia({ colorScheme: 'light' });
    });
  }
}
