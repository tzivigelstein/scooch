// Helpers for walking the app with the keyboard only: where the focus is (its
// region, its element) and pressing Tab until a condition holds.
import type { Page } from '@playwright/test';

/** The region the focus is in, by the app's landmarks and panels. */
export const region = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return 'body';
    if (el.id === 'skip') return 'skip';
    if (el.closest('.topbar')) return 'top bar';
    if (el.closest('#pieces-panel')) return 'pieces panel';
    if (el.closest('#piecebar')) return 'piece toolbar';
    if (el.closest('.zoom-control')) return 'zoom';
    if (el.closest('#sheets')) return el.classList.contains('piece') ? 'piece' : 'sheet';
    if (el.closest('#props-panel')) return 'properties panel';
    return el.tagName;
  });

/** What has the focus: its id, classes, accessible name, data-act / data-action, its sheet and its text selection. */
export const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    const input = el instanceof HTMLInputElement ? el : null;
    return {
      id: el?.id ?? '',
      cls: String(el?.className ?? ''),
      label: el?.getAttribute('aria-label') ?? null,
      act: el?.dataset.act ?? null,
      action: el?.dataset.action ?? null,
      piece: el?.classList.contains('piece') ? Number(el.dataset.id) : null,
      sheet: el?.closest<HTMLElement>('.page')?.dataset.sheet ?? null,
      selected: input && typeof input.selectionStart === 'number' ? input.value.slice(input.selectionStart, input.selectionEnd ?? undefined) : null,
      value: input?.value ?? null,
    };
  });

export type Focused = Awaited<ReturnType<typeof focused>>;

/**
 * Copies, cuts or pastes with Ctrl+C, X or V. Playwright's WebKit (on Linux)
 * doesn't turn those keys into the browser's editing commands, so no
 * clipboard event fires (Safari fires one for ⌘C, ⌘X and ⌘V): where none did,
 * the event the command fires is dispatched at what has the focus, with an
 * empty clipboard.
 */
export async function clipboardKey(page: Page, command: 'copy' | 'cut' | 'paste') {
  const key = { copy: 'c', cut: 'x', paste: 'v' }[command];
  await page.evaluate((type) => {
    const w = window as unknown as { __clipboardFired?: boolean; __clipboardListener?: () => void };
    w.__clipboardFired = false;
    w.__clipboardListener = () => (w.__clipboardFired = true);
    document.addEventListener(type, w.__clipboardListener, true);
  }, command);
  await page.keyboard.press(`Control+${key}`);
  await page.evaluate((type) => {
    const w = window as unknown as { __clipboardFired?: boolean; __clipboardListener?: () => void };
    document.removeEventListener(type, w.__clipboardListener!, true);
    if (w.__clipboardFired) return;
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(new ClipboardEvent(type, { bubbles: true, cancelable: true, composed: true, clipboardData: new DataTransfer() }));
  }, command);
}

/**
 * Presses Tab (Shift+Tab with `back`) until `until` holds for what has the
 * focus, at most `max` times; returns whether it got there.
 */
export async function tabTo(page: Page, until: (f: Focused) => boolean, { max = 40, back = false } = {}) {
  for (let i = 0; i < max; i++) {
    if (until(await focused(page))) return true;
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
  }
  return until(await focused(page));
}
