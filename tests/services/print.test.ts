// @vitest-environment jsdom
// Where printFile sends the PDF, decided from what the browser says: the
// hidden iframe's print() when it has a PDF viewer and isn't Safari or iOS
// (which print the page instead of the iframe's PDF); otherwise another tab;
// if popups are blocked, a download. The three real paths in a real browser
// are in e2e/specs/print-and-download.spec.ts; Safari and iOS only here.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
// Chrome on iOS is WebKit too: it prints the page like Safari, though its user agent isn't Safari's.
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1';
const IPAD_CHROME_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Safari/604.1';
const PDF = new Blob(['%PDF-'], { type: 'application/pdf' });

let urls = 0;
let downloads: { href: string; download: string }[] = [];
let open: ReturnType<typeof vi.fn>;

/** A browser: its user agent, whether it has a PDF viewer, touch points and whether popups open. */
function browser({ ua = CHROME, viewer = true, touch = 0, popups = true } = {}) {
  // Own properties over Navigator.prototype's (jsdom has no maxTouchPoints or pdfViewerEnabled).
  for (const [key, value] of Object.entries({ userAgent: ua, maxTouchPoints: touch, pdfViewerEnabled: viewer })) {
    Object.defineProperty(navigator, key, { configurable: true, get: () => value });
  }
  open = vi.fn(() => (popups ? ({ opener: window } as unknown as Window) : null));
  vi.stubGlobal('open', open);
}

/** printFile from a fresh module (no iframe yet). */
async function printFile() {
  vi.resetModules();
  return (await import('../../src/services/print.ts')).printFile;
}

/** The print iframe once printFile made it, with print() replaced; `load` is the PDF finishing loading. */
async function frameLoaded(print: () => void) {
  await vi.waitFor(() => expect(document.querySelector('iframe.print-frame')).not.toBeNull());
  const frame = document.querySelector<HTMLIFrameElement>('iframe.print-frame')!;
  frame.contentWindow!.print = print;
  frame.contentWindow!.focus = () => {}; // not in jsdom
  frame.dispatchEvent(new Event('load'));
  return frame;
}

beforeEach(() => {
  urls = 0;
  downloads = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test/${++urls}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ href: this.href, download: this.download });
  });
});
afterEach(() => {
  for (const key of ['userAgent', 'maxTouchPoints', 'pdfViewerEnabled']) delete (navigator as unknown as Record<string, unknown>)[key];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('printFile', () => {
  test('Chrome with a PDF viewer: the PDF loads in the hidden iframe and its print() is called', async () => {
    browser();
    const print = vi.fn();
    const sent = (await printFile())(PDF, 'scooch-a4.pdf');
    const frame = await frameLoaded(print);
    expect((await sent).how).toBe('dialog');
    expect(print).toHaveBeenCalledTimes(1);
    expect(frame.src).toBe('blob:test/1');
    expect(open).not.toHaveBeenCalled();
  });

  test('if print() fails: another tab with the PDF', async () => {
    browser();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sent = (await printFile())(PDF, 'scooch-a4.pdf');
    await frameLoaded(() => {
      throw new Error('cannot print');
    });
    expect((await sent).how).toBe('tab');
    expect(open).toHaveBeenCalledWith('blob:test/2', '_blank');
  });

  test.each([
    { name: 'no PDF viewer', ua: CHROME, viewer: false, touch: 0 },
    { name: 'Safari (prints the page, not the iframe)', ua: SAFARI, viewer: true, touch: 0 },
    { name: 'Chrome on an iPhone', ua: IPHONE_CHROME, viewer: true, touch: 5 },
    { name: 'Chrome on an iPad that says it is a Mac', ua: IPAD_CHROME_AS_MAC, viewer: true, touch: 5 },
  ])('$name: another tab, no iframe', async ({ ua, viewer, touch }) => {
    browser({ ua, viewer, touch });
    expect((await (await printFile())(PDF, 'scooch-a4.pdf')).how).toBe('tab');
    expect(open).toHaveBeenCalledWith('blob:test/1', '_blank');
    expect(document.querySelector('iframe')).toBeNull();
  });

  test('with popups blocked too: it downloads with the file’s name', async () => {
    browser({ viewer: false, popups: false });
    expect((await (await printFile())(PDF, 'scooch-a4.pdf')).how).toBe('download');
    expect(downloads).toEqual([{ href: 'blob:test/1', download: 'scooch-a4.pdf' }]);
  });

  test('a second print reuses the iframe', async () => {
    browser();
    const print = vi.fn();
    const send = await printFile();
    const first = send(PDF, 'scooch-a4.pdf');
    await frameLoaded(print);
    await first;
    const second = send(PDF, 'scooch-a4.pdf');
    await frameLoaded(print);
    expect((await second).how).toBe('dialog');
    expect(print).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('iframe.print-frame')).toHaveLength(1);
  });

  test('the person is back when the print dialog closes (afterprint), or a moment after printing without that sign', async () => {
    browser();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const send = await printFile();
      const sent = send(PDF, 'scooch-a4.pdf');
      const frame = await frameLoaded(() => {});
      let back = false;
      void (await sent).back.then(() => (back = true));
      await vi.advanceTimersByTimeAsync(100);
      expect(back).toBe(false);
      frame.contentWindow!.dispatchEvent(new Event('afterprint'));
      await vi.advanceTimersByTimeAsync(0);
      expect(back).toBe(true);
      // Without afterprint (some PDF viewers don't send it): a moment later.
      const again = send(PDF, 'scooch-a4.pdf');
      await frameLoaded(() => {});
      let backAgain = false;
      void (await again).back.then(() => (backAgain = true));
      await vi.advanceTimersByTimeAsync(1600);
      expect(backAgain).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test('downloaded instead: back right away', async () => {
    browser({ viewer: false, popups: false });
    let back = false;
    void (await (await printFile())(PDF, 'scooch-a4.pdf')).back.then(() => (back = true));
    await Promise.resolve();
    expect(back).toBe(true);
  });
});
