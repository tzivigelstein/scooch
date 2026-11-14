// Printing and downloading the PDF in a real browser: first the advice on
// printing at real size (its button is the click that prints or downloads),
// then printing loads the same PDF as the download in a hidden iframe and
// calls its print() (spied: no dialog opens, and it closes right away);
// where that can't work the PDF opens in another tab (print() fails, or there
// is no PDF viewer), or downloads (popups blocked too). Once the person is
// back, the summary card shows. Full Chromium has the PDF viewer; the
// headless shell (the default) doesn't. What each way says, the advice's
// contents and the summary's lines are in tests/state/printing-flow.test.ts
// and the components' tests.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { pdfInfo } from '../support/pdf.ts';
import { expect, lastPdf, openedUrls, pdfUrls, printCalls, printFrames, test } from '../support/print.ts';
import { norm } from '../support/test.ts';

const pill = (page: Page) => page.locator('#pill-text');
const advice = (page: Page) => page.locator('#print-tip');

/** Clicks the bar's button and goes on from the advice with its own button. */
async function throughAdvice(page: Page, button: '#print' | '#export') {
  await page.locator(button).click();
  await expect(advice(page)).toHaveAttribute('open', '');
  await page.locator('#print-tip-go').click();
}

test.describe('printing with a PDF viewer', () => {
  test.use({ pdfViewer: true, printSpy: 'record' });

  test('Print is off with no pieces; then the advice shows (Esc prints nothing), and its «Imprimir» calls print() on the PDF in one hidden off-screen iframe; the summary shows after', async ({ app, page }) => {
    expect(await page.evaluate(() => navigator.pdfViewerEnabled), 'full Chromium has a PDF viewer').toBe(true);
    await expect(page.locator('#print')).toBeDisabled();
    await app.addFiles(['big.png', 'small.jpg']);

    await test.step('the advice, focused on «Imprimir»; Esc closes it and nothing prints', async () => {
      await page.locator('#print').click();
      await expect(advice(page)).toHaveAttribute('open', '');
      await expect(page.locator('#print-tip-title')).toHaveText('Antes de imprimir');
      await expect(page.locator('#print-tip-go')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(advice(page)).not.toHaveAttribute('open');
      await expect(page.locator('#print')).toBeFocused();
      expect(await printCalls(page)).toEqual([]);
    });

    await test.step('«Imprimir» (Enter): print() on the PDF in the hidden iframe; no tip in the pill', async () => {
      await page.locator('#print').click();
      await expect(page.locator('#print-tip-go')).toBeFocused();
      await page.keyboard.press('Enter');
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
      await expect(page.locator('#pill')).toBeHidden();
    });

    await test.step('back from the print dialog: the summary card, reached with Tab from «Imprimir»', async () => {
      await expect(page.locator('#print-summary')).toBeVisible();
      await expect(page.locator('#print-summary .summary-usage')).toHaveText(/de la hoja aprovechada$/);
      await page.locator('#print').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('#summary-close')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('#print-summary')).toHaveCount(0);
      await expect(page.locator('#print')).toBeFocused();
    });
  });

  test('«No volver a mostrar»: the next print goes straight to print(), reusing the iframe; printing and downloading give the same PDF, titled «Scooch A4»', async ({ app, page }) => {
    await app.addFiles(['big.png', 'small.jpg']);
    await page.locator('#print').click();
    await page.locator('#print-tip-never').check();
    await page.locator('#print-tip-go').click();
    await expect.poll(() => printCalls(page)).toHaveLength(1);
    const printed = await pdfInfo(await lastPdf(page));
    expect(printed.pages.map(({ w, h, xobjects }) => ({ w, h, xobjects }))).toEqual([{ w: 210, h: 297, xobjects: 2 }]);
    await page.locator('#print').click();
    await expect.poll(() => printCalls(page)).toHaveLength(2);
    await expect(advice(page)).not.toHaveAttribute('open');
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
    await page.locator('#print').click();
    const [tab] = await Promise.all([context.waitForEvent('page'), page.locator('#print-tip-go').click()]);
    expect(await openedUrls(page)).toEqual([(await pdfUrls(page)).at(-1)]);
    await tab.waitForURL(/^blob:/);
    await expect.poll(async () => norm(await pill(page).textContent()) || norm(await page.locator('#summary-note').textContent())).toBe('Se abrió el PDF en otra pestaña. Imprímelo desde ahí.');
    await tab.close();
  });
});

test.describe('printing without a PDF viewer', () => {
  test.use({ printSpy: 'record' });

  test('the PDF opens in another tab, without an iframe, in the click of «Imprimir»', async ({ app, page, context }) => {
    expect(await page.evaluate(() => navigator.pdfViewerEnabled), 'the headless shell has no PDF viewer').toBe(false);
    await app.addFiles(['small.jpg']);
    await page.locator('#print').click();
    const [tab] = await Promise.all([context.waitForEvent('page'), page.locator('#print-tip-go').click()]);
    // A tab opened (the event) with the PDF's URL (without a viewer it can't show it).
    expect(await openedUrls(page)).toEqual([(await pdfUrls(page)).at(-1)]);
    await expect(printFrames(page)).toHaveCount(0);
    await expect.poll(async () => norm(await pill(page).textContent())).toMatch(/^Se abrió el PDF en otra pestaña\./);
    await tab.close();
  });

  test('with popups blocked too, the PDF downloads and the summary says so', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    await page.evaluate(() => (window.open = () => null));
    const [download] = await Promise.all([page.waitForEvent('download'), throughAdvice(page, '#print')]);
    expect(download.suggestedFilename()).toBe('scooch-a4.pdf');
    expect((await pdfInfo((await download.path())!)).pages).toHaveLength(1);
    await expect(printFrames(page)).toHaveCount(0);
    // Said in the summary once the person is back (the notice goes).
    await expect(page.locator('#summary-note')).toHaveText('Se descargó scooch-a4.pdf. Ábrelo para imprimirlo.');
  });
});

test.describe('downloading', () => {
  test('Descargar PDF shows the advice for when it is printed, and «Descargar» downloads scooch-a4.pdf; Ctrl+E too: every piece on one A4 page; the summary after', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'twopage.pdf', 'rotated.pdf']);
    await page.locator('#export').click();
    await expect(advice(page)).toHaveAttribute('open', '');
    await expect(page.locator('#print-tip-title')).toHaveText('Antes de descargar');
    await expect(page.locator('#print-tip-lead')).toHaveText('Cuando lo imprimas, elige:');
    const [first] = await Promise.all([page.waitForEvent('download'), page.locator('#print-tip-go').click()]);
    expect(first.suggestedFilename()).toBe('scooch-a4.pdf');
    expect(readFileSync((await first.path())!).subarray(0, 5).toString()).toBe('%PDF-');
    await expect(page.locator('#print-summary')).toBeVisible();
    await page.keyboard.press('Control+e');
    await expect(advice(page)).toHaveAttribute('open', '');
    const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
    expect(download.suggestedFilename()).toBe('scooch-a4.pdf');
    const info = await pdfInfo((await download.path())!);
    expect(info.pages.map(({ w, h, xobjects }) => ({ w, h, xobjects }))).toEqual([{ w: 210, h: 297, xobjects: 3 }]);
  });
});
