// Download and print. Printing uses the same PDF as the download, loaded in a
// hidden iframe; if the browser doesn't allow it, the PDF opens in another tab
// (or, if that's blocked too, it downloads).

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

function printInFrame(url: string) {
  return new Promise<void>((resolve, reject) => {
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
        win.focus();
        win.print();
        window.addEventListener('focus', restore, { once: true });
        requestAnimationFrame(restore);
        resolve();
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

/**
 * Sends the bytes to print. Returns 'dialog' if the print dialog opened,
 * 'tab' if the PDF opened in another tab or 'download' if it downloaded.
 */
export async function printBytes(bytes: Uint8Array, fileName: string): Promise<'dialog' | 'tab' | 'download'> {
  const url = pdfUrl(bytes);
  if (canPrintInFrame()) {
    try {
      await printInFrame(url);
      return 'dialog';
    } catch (err) {
      console.warn('Could not print directly; opening the PDF.', err);
      releaseFrame();
      return openOrDownload(pdfUrl(bytes), fileName);
    }
  }
  return openOrDownload(url, fileName);
}
