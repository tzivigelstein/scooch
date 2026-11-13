// Printing and downloading the PDF in a real browser: printing loads the same
// PDF as the download in a hidden iframe and calls its print() (spied: no
// dialog opens); where that can't work the PDF opens in another tab (print()
// fails, or there is no PDF viewer), or downloads (popups blocked too).
// Full Chromium has the PDF viewer; the headless shell (the default) doesn't.
// What each way says, and that the print notice persists, is in
// tests/state/print-notices.test.ts; the print resolution, in
// tests/state/print-resolution.test.ts and the components' tests.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { pdfInfo } from '../support/pdf.ts';
import { expect, lastPdf, openedUrls, pdfUrls, printCalls, printFrames, test } from '../support/print.ts';
import { norm } from '../support/test.ts';

const pill = (page: Page) => page.locator('#pill-text');

test.describe('printing with a PDF viewer', () => {
  test.use({ pdfViewer: true, printSpy: 'record' });

  test('Print is off with no pieces; then print() is called on the PDF, loaded in one hidden off-screen iframe, and the pill gives the tip', async ({ app, page }) => {
    expect(await page.evaluate(() => navigator.pdfViewerEnabled), 'full Chromium has a PDF viewer').toBe(true);
    await expect(page.locator('#print')).toBeDisabled();
    await app.addFiles(['big.png', 'small.jpg']);
    await page.locator('#print').click();
    await expect.poll(() => printCalls(page)).toHaveLength(1);
    const [call] = await printCalls(page);
    expect(call).toEqual({ src: (await pdfUrls(page)).at(-1), contentType: 'application/pdf' });
    const frame = await printFrames(page).evaluate((f: HTMLIFrameElement) => ({
      display: getComputedStyle(f).display,
      left: f.getBoundingClientRect().left,
      hidden: f.getAttribute('aria-hidden'),
      tab: f.tabIndex,
      title: f.title,
    }));
    // Not display:none (a hidden iframe wouldn't print), off-screen, out of the tab order and of the accessibility tree.
    expect(frame).toEqual({ display: 'block', left: expect.any(Number), hidden: 'true', tab: -1, title: 'PDF para imprimir' });
    expect(frame.left).toBeLessThan(-1000);
    await expect.poll(async () => norm(await pill(page).textContent())).toBe('En el diálogo de impresión, elige «Tamaño real» o «100 %» y el papel A4');
  });

  test('a second print reuses the iframe, and printing and downloading give the same PDF: one A4 page with both images, titled «Scooch A4»', async ({ app, page }) => {
    await app.addFiles(['big.png', 'small.jpg']);
    await page.locator('#print').click();
    await expect.poll(() => printCalls(page)).toHaveLength(1);
    const printed = await pdfInfo(await lastPdf(page));
    expect(printed.pages.map(({ w, h, xobjects }) => ({ w, h, xobjects }))).toEqual([{ w: 210, h: 297, xobjects: 2 }]);
    await page.locator('#print').click();
    await expect.poll(() => printCalls(page)).toHaveLength(2);
    await expect(printFrames(page)).toHaveCount(1);
    const downloaded = await app.downloadPdf();
    expect(downloaded.name).toBe('scooch-a4.pdf');
    expect(downloaded.info.pages.map(({ streams: _s, ...page }) => page)).toEqual(printed.pages.map(({ streams: _s, ...page }) => page));
    expect(downloaded.info.title).toBe('Scooch A4');
  });
});

test.describe('printing when print() fails', () => {
  test.use({ pdfViewer: true, printSpy: 'throw' });

  test('the PDF opens in another tab, and the pill says so', async ({ app, page, context }) => {
    await app.addFiles(['small.jpg']);
    const [tab] = await Promise.all([context.waitForEvent('page'), page.locator('#print').click()]);
    expect(await openedUrls(page)).toEqual([(await pdfUrls(page)).at(-1)]);
    await tab.waitForURL(/^blob:/);
    await expect.poll(async () => norm(await pill(page).textContent())).toBe('Se abrió el PDF en otra pestaña. Imprímelo desde ahí con «Tamaño real» o «100 %» y el papel A4.');
    await tab.close();
  });
});

test.describe('printing without a PDF viewer', () => {
  test.use({ printSpy: 'record' });

  test('the PDF opens in another tab, without an iframe', async ({ app, page, context }) => {
    expect(await page.evaluate(() => navigator.pdfViewerEnabled), 'the headless shell has no PDF viewer').toBe(false);
    await app.addFiles(['small.jpg']);
    const [tab] = await Promise.all([context.waitForEvent('page'), page.locator('#print').click()]);
    // A tab opened (the event) with the PDF's URL (without a viewer it can't show it).
    expect(await openedUrls(page)).toEqual([(await pdfUrls(page)).at(-1)]);
    await expect(printFrames(page)).toHaveCount(0);
    await expect.poll(async () => norm(await pill(page).textContent())).toMatch(/^Se abrió el PDF en otra pestaña\./);
    await tab.close();
  });

  test('with popups blocked too, the PDF downloads and the pill explains how to print it', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    await page.evaluate(() => (window.open = () => null));
    const { name, info } = await app.downloadPdf('#print');
    expect(name).toBe('scooch-a4.pdf');
    expect(info.pages).toHaveLength(1);
    await expect(printFrames(page)).toHaveCount(0);
    await expect.poll(async () => norm(await pill(page).textContent())).toBe('Se descargó scooch-a4.pdf. Ábrelo e imprímelo con «Tamaño real» o «100 %» y el papel A4.');
  });
});

test.describe('downloading', () => {
  test('Descargar PDF and Ctrl+E download scooch-a4.pdf: a PDF with every piece on one A4 page', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'twopage.pdf', 'rotated.pdf']);
    const first = await app.download();
    expect(first.name).toBe('scooch-a4.pdf');
    expect(readFileSync(first.file).subarray(0, 5).toString()).toBe('%PDF-');
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+e')]);
    expect(download.suggestedFilename()).toBe('scooch-a4.pdf');
    const info = await pdfInfo((await download.path())!);
    expect(info.pages.map(({ w, h, xobjects }) => ({ w, h, xobjects }))).toEqual([{ w: 210, h: 297, xobjects: 3 }]);
  });
});
