// The privacy policy's promise, in a real browser: the editor talks only to
// its own origin and sends nothing of what the person loads. A whole session
// (files and a PDF, editing, crop, cut lines with the contour's worker, every
// dialog, menu and the command palette, every language and theme, projects,
// the clipboard, the PDF downloaded and printed, a reload) runs with every
// request watched from four places (e2e/support/network.ts says what each
// engine lets each one see): a recording proxy that refuses anything not
// for the page's own origin, Playwright's routing that aborts it, and
// watches inside each page and each worker. A request elsewhere, a body, a
// WebSocket, a cookie or a worker the test couldn't see into fails the
// test. The second test checks that each watch catches what it should, in
// the engine it runs in: a check that can't fail tests nothing. That the
// code has no address of another server in it is in
// tests/build/other-origins.test.ts.
import type { Page } from '@playwright/test';
import { clipboardKey } from '../support/keyboard.ts';
import { dragPieceTo, dropFile } from '../support/editing.ts';
import { NetworkWatch, startRecorder, watchNetwork, WORKER_PRELUDE, type Recorder } from '../support/network.ts';
import { expect, openedUrls, printCalls, printsInFrame, test as printing } from '../support/print.ts';
import { card, openProjects, renameInBar, saved } from '../support/projects.ts';

const PATREON = 'https://www.patreon.com/ejemplo';

const test = printing.extend<{ recorder: Recorder & { watch: NetworkWatch }; network: NetworkWatch }>({
  recorder: async ({ baseURL }, use) => {
    const watch = new NetworkWatch(new URL(baseURL!).origin);
    const recorder = await startRecorder(watch);
    await use({ ...recorder, watch });
    await recorder.close();
  },
  // Every request of the context goes through the recording proxy.
  proxy: async ({ recorder }, use) => use({ server: recorder.server }),
  // Automatic, so it watches before the app fixture opens the page.
  network: [
    async ({ context, recorder }, use) => {
      await watchNetwork(context, recorder.watch);
      await use(recorder.watch);
    },
    { auto: true },
  ],
});

/** The file name of each URL, without its hash: «/assets/pdf-lib-AbC123.js» → «pdf-lib». */
const names = (urls: readonly string[]) => [...new Set(urls.map((u) => /\/assets\/(.+?)-[\w-]{8}\.\w+$/.exec(u.split(/[?#]/)[0])?.[1] ?? u))];

const summary = (page: Page) => page.locator('#print-summary');

async function closeSummary(page: Page) {
  await expect(summary(page)).toHaveAttribute('open', '');
  await page.locator('#summary-done').click();
  await expect(summary(page)).not.toHaveAttribute('open');
}

/** Opens Preferences, does `inside`, and closes it with Esc. */
async function inPreferences(page: Page, inside: () => Promise<void>) {
  await page.locator('#prefs-open').click();
  await expect(page.locator('#prefs')).toHaveAttribute('open', '');
  await inside();
  await page.keyboard.press('Escape');
  await expect(page.locator('#prefs')).not.toHaveAttribute('open');
}

test.describe('a whole session in the editor', () => {
  // The summary after printing asks for a donation with a link to Patreon: shown, never followed.
  test.use({ printSpy: 'record', appQuery: `?donar=${encodeURIComponent(PATREON)}` });

  test('sends no request to another origin, none with a body, opens no WebSocket and sets no cookie', async ({ app, page, context, network }, info) => {
    test.slow();

    await test.step('images by the file input and by a drop, and a PDF (pdf.js and its worker)', async () => {
      await app.addFiles(['small.jpg', 'sticker.png', 'twopage.pdf']);
      await dropFile(page, '#canvas', 'square.webp', 'image/webp', async () => {});
      await expect(app.pieces()).toHaveCount(4, { timeout: 30_000 });
      await app.idle();
    });
    const piece = app.pieceNamed('small.jpg');
    const id = Number(await piece.getAttribute('data-id'));

    await test.step('move, resize and rotate a piece, and type its position', async () => {
      await app.selectIds([id]);
      // Into the empty bottom left of the sheet, where it can turn without overlapping.
      await dragPieceTo(app, id, 15, 190);
      const handle = (await page.locator('#handle').boundingBox())!;
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(handle.x + handle.width / 2 + i * 5, handle.y + handle.height / 2 + i * 4);
      await page.mouse.up();
      const turn = async () => (await app.geometry()).pieces.find((p) => p.id === id)!.r;
      const before = await turn();
      await page.locator('#piecebar [data-action="rotate-right"]').click();
      await expect.poll(turn).toBe((before + 90) % 360);
      await app.setMeasure('pos-x', '12,5');
      await expect(page.locator('#pos-x')).toHaveValue('12,5');
    });

    await test.step('crop it with the keyboard, then arrange', async () => {
      await piece.focus();
      await page.keyboard.press('k');
      await expect(page.locator('#crop-frame')).toBeFocused();
      await page.keyboard.press('+');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      await expect(page.locator('#crop-frame')).toHaveCount(0);
      await page.locator('#arrange').click();
      await app.heard(/Se acomodaron 4 piezas/);
    });

    await test.step('every kind of cut line, the contour of a transparent image among them (its worker)', async () => {
      await page.keyboard.press('Escape');
      await app.openSetting('#cut-mode');
      for (const mode of ['corners', 'outline', 'contour']) {
        await page.locator(`#cut-mode input[value="${mode}"]`).click();
        await expect(page.locator(`#cut-mode input[value="${mode}"]`)).toBeChecked();
      }
      await expect.poll(() => page.locator('#sheets .cut-layer path').count(), { message: 'the sticker’s contour is traced' }).toBeGreaterThanOrEqual(1);
    });

    await test.step('copy, cut and paste; undo and redo', async () => {
      await app.selectIds([id]);
      await clipboardKey(page, 'copy');
      await clipboardKey(page, 'paste');
      await expect(app.pieces()).toHaveCount(5);
      await clipboardKey(page, 'cut');
      await expect(app.pieces()).toHaveCount(4);
      await clipboardKey(page, 'paste');
      await expect(app.pieces()).toHaveCount(5);
      await app.undo();
      await expect(app.pieces()).toHaveCount(4);
      await app.redo();
      await expect(app.pieces()).toHaveCount(5);
      await page.keyboard.press('Control+z');
      await expect(app.pieces()).toHaveCount(4);
    });

    await test.step('every dialog, both menus and the command palette', async () => {
      await inPreferences(page, async () => {});
      await page.locator('#help').click();
      await expect(page.locator('#shortcuts')).toHaveAttribute('open', '');
      await page.keyboard.press('Escape');
      await openProjects(page);
      await page.keyboard.press('Escape');
      await page.locator('#clear').click();
      await expect(page.locator('#confirm')).toHaveAttribute('open', '');
      await page.locator('#confirm-cancel').click();
      await page.keyboard.press('Control+k');
      await expect(page.locator('#palette-input')).toBeFocused();
      await page.keyboard.type('girar');
      await page.keyboard.press('Escape');
      await expect(page.locator('#palette[open]')).toHaveCount(0);
      await page.locator('#zoom-level').click();
      await expect(page.locator('#zoom-menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await app.pieces().first().click({ button: 'right' });
      await expect(page.locator('#context-menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#context-menu')).toBeHidden();
    });

    await test.step('every language (Hindi brings its font) and back to the browser’s, then both themes', async () => {
      await inPreferences(page, async () => {
        for (const language of ['en', 'zh-Hans', 'hi', 'fr', 'auto']) {
          await page.locator('#language').selectOption(language);
          await expect(page.locator('html')).toHaveAttribute('lang', language === 'auto' ? 'es' : language);
          if (language === 'hi') await expect.poll(() => page.evaluate(() => document.fonts.check('16px "Noto Sans Devanagari Variable"', 'हिन्दी')), { message: 'the Devanagari font in use' }).toBe(true);
        }
        for (const theme of ['Oscuro', 'Claro']) await page.locator('#prefs').getByRole('radio', { name: theme }).check();
      });
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });

    await test.step('rename the project, duplicate it and delete the copy', async () => {
      await renameInBar(page, 'Privado');
      await saved(page);
      await openProjects(page);
      await card(page, 'Privado').locator('[data-act="duplicate"]').click();
      await expect(card(page, 'Privado (copia)')).toHaveCount(1);
      await card(page, 'Privado (copia)').locator('[data-act="delete"]').click();
      await page.locator('#confirm-ok').click();
      await expect(card(page, 'Privado (copia)')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('#projects')).not.toHaveAttribute('open');
    });

    await test.step('download the PDF (the export worker and pdf-lib); the summary asks for a donation with a link that isn’t followed', async () => {
      await page.locator('#export').click();
      await expect(page.locator('#print-tip')).toHaveAttribute('open', '');
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#print-tip-go').click()]);
      expect(download.suggestedFilename()).toBe('scooch-a4.pdf');
      await expect(summary(page)).toHaveAttribute('open', '');
      await expect(page.locator('#summary-donate')).toHaveAttribute('href', PATREON);
      await closeSummary(page);
    });

    await test.step('print: in a hidden frame where the browser has a PDF viewer, else in another tab', async () => {
      const inFrame = await printsInFrame(page);
      await page.locator('#print').click();
      await expect(page.locator('#print-tip')).toHaveAttribute('open', '');
      if (inFrame) {
        await page.locator('#print-tip-go').click();
        await expect.poll(() => printCalls(page)).toHaveLength(1);
      } else {
        const [tab] = await Promise.all([context.waitForEvent('page'), page.locator('#print-tip-go').click()]);
        expect(await openedUrls(page)).toEqual([expect.stringMatching(/^blob:/)]);
        await tab.close();
      }
      await closeSummary(page);
    });

    await test.step('reload: the project comes back with its images', async () => {
      await saved(page);
      await page.reload();
      await app.ready();
      await expect(app.pieces()).toHaveCount(4);
      await expect(page.locator('#project-name-text')).toHaveText('Privado');
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('#sheets .piece img')].every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
    });

    // The watches saw the session: every worker the app started said hello,
    // and what loads late (pdf.js, pdf-lib in the export worker, the
    // languages, Hindi's font) was seen by at least one of them.
    await expect.poll(() => names(network.workers().watched), { message: 'the workers’ watches said hello' }).toEqual(expect.arrayContaining(['pdf.worker.min', 'contour.worker', 'export.worker']));
    await expect
      .poll(() => names(network.requested()), { message: 'what loads late was seen' })
      .toEqual(expect.arrayContaining(['pdfjs-dist', 'pdf.worker.min', 'pdf-lib', 'copy-en', 'copy-zh-Hans', 'copy-hi', 'copy-fr', 'noto-sans-devanagari-devanagari-wght-normal']));

    const cookies = { context: await context.cookies(), page: await page.evaluate(() => document.cookie) };
    const serviceWorkers = await page.evaluate(async () => ('serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) : []));
    await info.attach('network.json', {
      contentType: 'application/json',
      body: JSON.stringify(
        {
          proxied: network.network.length,
          proxiedOwnOrigin: network.network.filter((r) => !r.refused).length,
          routed: network.routed.length,
          pageResources: network.reports.filter((r) => r.kind === 'resource' && !r.worker).length,
          workerResources: names(network.reports.filter((r) => r.kind === 'resource' && r.worker).map((r) => r.url ?? '')),
          workers: network.workers(),
          problems: network.problems(),
        },
        null,
        2
      ),
    });
    expect(network.problems(), 'every request for the page’s own origin, a body-less GET, and every worker watched').toEqual([]);
    expect(cookies).toEqual({ context: [], page: '' });
    expect(serviceWorkers).toEqual([]);
    expect(context.serviceWorkers()).toEqual([]);
  });
});

test.describe('the watches themselves', () => {
  // The probes fail on purpose, and each engine says so in its own words.
  test.use({ allowErrors: [/.*/] });

  test('each one catches what it should in this engine: a request elsewhere with a body, a beacon, a WebSocket, an event stream, a cookie, a preconnect and a worker’s request', async ({ app, page, context, network }) => {
    const probe = 'http://probe.invalid';
    // This one is let through Playwright's routing, to reach the network.
    await context.route(`${probe}/through-proxy`, (route) => route.continue());
    await context.route('**/assets/probe.worker-e2e.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: `${WORKER_PRELUDE}fetch('${probe}/from-worker', { method: 'POST', body: 'x' }).catch(() => {}).finally(() => postMessage('sent'));` })
    );
    await page.evaluate(async (probe) => {
      await fetch(`${probe}/fetch`, { method: 'POST', body: 'what the person loaded' }).catch(() => {});
      await fetch(`${probe}/through-proxy`).catch(() => {});
      navigator.sendBeacon(`${probe}/beacon`, 'x');
      new WebSocket(`${probe.replace('http', 'ws')}/socket`);
      new EventSource(`${probe}/events`);
      document.cookie = 'probe=1';
      document.head.append(Object.assign(document.createElement('link'), { rel: 'preconnect', href: 'https://probe.invalid' }));
      await new Promise((sent) => (new Worker('/assets/probe.worker-e2e.js', { type: 'module' }).onmessage = sent));
      // A worker whose script the test can't put its watch into.
      new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' })));
    }, probe);

    const has = (re: RegExp) => network.problems().some((p) => re.test(p));
    await test.step('Playwright’s routing: the page’s request elsewhere, with its body, aborted', async () => {
      await expect.poll(() => network.routed.some((r) => r.url === `${probe}/fetch` && r.method === 'POST' && r.body)).toBe(true);
    });
    await test.step('the network: a request let through reaches the proxy, which refuses it', async () => {
      await expect.poll(() => network.network.some((r) => r.url === `${probe}/through-proxy` && r.refused)).toBe(true);
    });
    await test.step('the page’s watch: each call, the cookie and the preconnect', async () => {
      await expect.poll(() => network.reports.filter((r) => r.kind === 'call' && !r.worker).map((r) => `${r.api} ${r.url}`)).toEqual(
        expect.arrayContaining([`fetch ${probe}/fetch`, `sendBeacon ${probe}/beacon`, 'WebSocket ws://probe.invalid/socket', `EventSource ${probe}/events`])
      );
      expect(network.reports.some((r) => r.kind === 'cookie' && r.url === 'probe=1')).toBe(true);
      expect(network.reports.some((r) => r.kind === 'element' && r.url === 'https://probe.invalid/')).toBe(true);
      expect(await context.cookies()).toContainEqual(expect.objectContaining({ name: 'probe' }));
    });
    await test.step('the WebSocket: the proxy refuses its connection', async () => {
      await expect.poll(() => network.network.some((r) => r.refused && /probe\.invalid(:80|\/socket)/.test(r.url))).toBe(true);
    });
    await test.step('the worker’s watch says hello and reports its request, which Playwright’s routing (Chromium, WebKit) or the proxy (Firefox) caught too', async () => {
      await expect.poll(() => network.reports.some((r) => r.kind === 'call' && r.worker?.endsWith('/assets/probe.worker-e2e.js') && r.url === `${probe}/from-worker` && r.body)).toBe(true);
      await expect.poll(() => [...network.routed, ...network.network].some((r) => r.url === `${probe}/from-worker`)).toBe(true);
    });
    await test.step('each of them fails the session’s check, and so does the worker the test couldn’t watch', async () => {
      for (const re of [/^request \(fetch\): POST http:\/\/probe\.invalid\/fetch with a body$/, /^network: GET http:\/\/probe\.invalid\/through-proxy$/, /called sendBeacon/, /called WebSocket/, /called EventSource/, /wrote a cookie: probe=1$/, /has <link href> = https:\/\/probe\.invalid\/$/, /^worker .*called fetch \(POST, with a body\): http:\/\/probe\.invalid\/from-worker$/, /^a worker the test couldn’t watch: blob:/])
        await expect.poll(() => has(re), { message: String(re) }).toBe(true);
    });
    await expect(app.pieces()).toHaveCount(0);
  });
});
