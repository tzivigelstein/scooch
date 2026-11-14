// Download and print. Printing uses the same PDF as the download, loaded in a
// hidden iframe; if the browser doesn't allow it, the PDF opens in another tab
// (or, if that's blocked too, it downloads). Each says when the person is back
// (the print dialog closed, or the tab is seen again): the summary shows then.

import { t } from '../copy/index.ts';

const pdfUrl = (bytes: Uint8Array) => URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));

function downloadUrl(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadBytes(bytes: Uint8Array, fileName: string) {
  downloadUrl(pdfUrl(bytes), fileName);
}

// ---------- Print ----------

let frame: HTMLIFrameElement | null = null; // one iframe, reused between prints
let frameUrl: string | null = null;
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

/** Without a sign that the person is back (afterprint, the window's focus), this long after printing is taken as back. */
const BACK_FALLBACK = 1500;

/**
 * Resolves when the person is back on the page: `signals` (events that say
 * so, on their targets), or the fallback a moment after it was asked.
 */
function backOn(signals: readonly [EventTarget, string][]) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      for (const [target, type] of signals) target.removeEventListener(type, done);
      resolve();
    };
    for (const [target, type] of signals) target.addEventListener(type, done, { once: true });
    const timer = setTimeout(done, BACK_FALLBACK);
  });
}

/**
 * Can an embedded PDF be printed? First by capability (no built-in PDF
 * viewer, e.g. on phones, no); Safari and iOS print the page instead of the
 * iframe's PDF, and that can't be detected any other way.
 */
function canPrintInFrame() {
  if (navigator.pdfViewerEnabled === false) return false;
  const ua = navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua);
  return !iOS && !safari;
}

function releaseFrame() {
  clearTimeout(cleanupTimer);
  if (frameUrl) URL.revokeObjectURL(frameUrl);
  frameUrl = null;
}

/** Prints the PDF in the iframe; resolves once print() was called, with when its dialog closed. */
function printInFrame(url: string) {
  // (In an object: a promise resolved with a promise would wait for it.)
  return new Promise<{ closed: Promise<void> }>((resolve, reject) => {
    releaseFrame();
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'print-frame';
      frame.title = t('print.frameTitle');
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      document.body.append(frame);
    }
    const target = frame;
    frameUrl = url;
    const timeout = setTimeout(() => {
      target.onload = null;
      reject(new Error('the PDF did not finish loading'));
    }, 20_000);
    const back = document.activeElement as HTMLElement | null;
    // The focus goes back where it was (printing moves it to the hidden iframe).
    const restore = () => {
      if (document.activeElement === target && back?.isConnected) back.focus({ preventScroll: true });
    };
    target.onload = () => {
      clearTimeout(timeout);
      target.onload = null;
      try {
        const win = target.contentWindow!;
        win.addEventListener('afterprint', () => (releaseFrame(), restore()), { once: true });
        const closed = backOn([
          [win, 'afterprint'],
          [window, 'afterprint'],
          [window, 'focus'],
        ]);
        win.focus();
        win.print();
        window.addEventListener('focus', restore, { once: true });
        requestAnimationFrame(restore);
        resolve({ closed });
      } catch (err) {
        restore();
        reject(err);
      }
      // In case «afterprint» never comes (PDF viewers don't always send it).
      cleanupTimer = setTimeout(releaseFrame, 5 * 60_000);
    };
    target.src = url;
  });
}

function openOrDownload(url: string, fileName: string): 'tab' | 'download' {
  const tab = window.open(url, '_blank');
  if (tab) {
    try {
      tab.opener = null;
    } catch {
      // only a precaution
    }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    return 'tab';
  }
  downloadUrl(url, fileName);
  return 'download';
}

export interface Printed {
  /** 'dialog': the print dialog opened; 'tab': the PDF opened in another tab; 'download': it downloaded. */
  how: 'dialog' | 'tab' | 'download';
  /** When the person is back: the print dialog closed, or this tab is seen again. */
  back: Promise<void>;
}

const backFrom = (how: 'tab' | 'download') =>
  how === 'download'
    ? Promise.resolve()
    : backOn([
        [window, 'focus'],
        [document, 'visibilitychange'],
      ]);

/** Sends the bytes to print (see Printed). */
export async function printBytes(bytes: Uint8Array, fileName: string): Promise<Printed> {
  const url = pdfUrl(bytes);
  if (canPrintInFrame()) {
    try {
      return { how: 'dialog', back: (await printInFrame(url)).closed };
    } catch (err) {
      console.warn('Could not print directly; opening the PDF.', err);
      releaseFrame();
      const how = openOrDownload(pdfUrl(bytes), fileName);
      return { how, back: backFrom(how) };
    }
  }
  const how = openOrDownload(url, fileName);
  return { how, back: backFrom(how) };
}
