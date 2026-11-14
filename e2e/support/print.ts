// Printing and the summary after it: a `test` whose `app` starts with the
// advice before printing and the summary after turned on, and can start with
//   - a spy on the print iframe's print() (`printSpy`): it records each call
//     (the iframe's src and its document's type) instead of opening the
//     browser's dialog, then closes it (afterprint), or throws ('throw') like
//     a browser that can't print it;
//   - a query string (`appQuery`, e.g. ?donar=… for the donation dialog);
//   - localStorage keys set before the app starts (`initialStorage`);
//   - full Chromium, which has a PDF viewer (`pdfViewer`), instead of the
//     headless shell, which doesn't. Playwright doesn't allow
//     `test.use({ channel })` inside a describe (it forces a new worker), so
//     the test's context comes from a full Chromium launched for that test.
// The spy also keeps every PDF Blob the page turns into a URL, to read what
// was sent to print, and the URLs window.open was asked to open.
import type { Page } from '@playwright/test';
import { App, test as base } from './test.ts';

export { expect } from './test.ts';

export type PrintSpy = 'record' | 'throw';

interface PrintCall {
  src: string;
  contentType: string | null;
}

interface SpyWindow {
  __print: { calls: PrintCall[]; blobs: { url: string; blob: Blob }[]; opened: string[]; mode: PrintSpy };
}

/** Runs in the page before the app (an init script). */
function installPrintSpy(mode: PrintSpy) {
  const state: SpyWindow['__print'] = { calls: [], blobs: [], opened: [], mode };
  (window as unknown as SpyWindow).__print = state;
  const create = URL.createObjectURL;
  URL.createObjectURL = function (obj: Blob | MediaSource) {
    const url = create.call(this, obj);
    if (obj instanceof Blob && obj.type === 'application/pdf') state.blobs.push({ url, blob: obj });
    return url;
  };
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')!;
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get(this: HTMLIFrameElement) {
      const win = desc.get!.call(this) as (Window & { __spied?: boolean }) | null;
      if (win && this.classList.contains('print-frame') && !win.__spied) {
        win.__spied = true;
        const frame = this;
        win.print = () => {
          if (state.mode === 'throw') throw new Error('print() failed (forced by the test)');
          state.calls.push({ src: frame.src, contentType: frame.contentDocument?.contentType ?? null });
          // The person closes the print dialog.
          setTimeout(() => win.dispatchEvent(new Event('afterprint')), 0);
        };
      }
      return win;
    },
  });
  const open = window.open;
  window.open = function (url?: string | URL, ...rest: [string?, string?]) {
    state.opened.push(String(url));
    return open.call(this, url, ...rest);
  };
}

/** Runs in the page before the app: sets the keys that aren't set yet. */
function seedLocalStorage(entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
}

interface PrintFixtures {
  pdfViewer: boolean;
  printSpy: PrintSpy | null;
  appQuery: string;
  initialStorage: Record<string, string>;
}

export const test = base.extend<PrintFixtures>({
  pdfViewer: [false, { option: true }],
  context: async ({ pdfViewer, context, playwright, viewport, colorScheme, acceptDownloads, baseURL, contextOptions }, use) => {
    if (!pdfViewer) {
      await use(context);
      return;
    }
    const browser = await playwright.chromium.launch({ channel: 'chromium' });
    const viewerContext = await browser.newContext({ ...contextOptions, viewport, colorScheme, acceptDownloads, baseURL });
    await use(viewerContext);
    await viewerContext.close();
    await browser.close();
  },
  printSpy: [null, { option: true }],
  appQuery: ['', { option: true }],
  initialStorage: [{}, { option: true }],
  app: async ({ page, printSpy, appQuery, initialStorage }, use, info) => {
    if (printSpy) await page.addInitScript(installPrintSpy, printSpy);
    if (Object.keys(initialStorage).length) await page.addInitScript(seedLocalStorage, initialStorage);
    const app = new App(page, info);
    app.printing = true;
    await app.open(appQuery);
    await use(app);
  },
});

/** The print() calls the spy recorded. */
export const printCalls = (page: Page) => page.evaluate(() => (window as unknown as SpyWindow).__print.calls);

/** The URLs of the PDF Blobs the page made, in order. */
export const pdfUrls = (page: Page) => page.evaluate(() => (window as unknown as SpyWindow).__print.blobs.map((b) => b.url));

/** The URLs window.open was asked to open. */
export const openedUrls = (page: Page) => page.evaluate(() => (window as unknown as SpyWindow).__print.opened);

/** The bytes of the last PDF Blob the page made (what was sent to print). */
export async function lastPdf(page: Page) {
  const b64 = await page.evaluate(async () => {
    const { blob } = (window as unknown as SpyWindow).__print.blobs.at(-1)!;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

/** The hidden print iframe(s). */
export const printFrames = (page: Page) => page.locator('iframe.print-frame');
