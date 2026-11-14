// Time budgets with 150 pieces on 10 sheets: dragging, scrolling, selecting,
// zooming, pinching, gliding after a two-finger pan and dragging at 200 % out
// of the sheets. These run alone, after the rest (the `performance` project:
// one worker), so other workers don't eat into the numbers; each test
// attaches what it measured («measures»).
// The gestures are dispatched inside the page, so each move's handler time is
// measured on its own; frames are the gaps between animation frames, and long
// tasks come from the browser's PerformanceObserver.
// And tracing a large image's contour cut line, which must not block the page.
import { expect, test, tiles, type App } from '../support/test.ts';
import { outsideMargin, overlapping } from '../support/geometry.ts';

/** Adds 150 tiles (15 to an A4 sheet) and arranges them: 10 full sheets, no overlaps. */
async function load150(app: App) {
  await app.addFiles(tiles(0, 150));
  await app.page.locator('#arrange').click();
  await expect(app.page.locator('#sheets .page')).toHaveCount(10);
  await expect(app.pieces()).toHaveCount(150);
  const g = await app.geometry();
  expect(overlapping(g.pieces)).toEqual([]);
  expect(outsideMargin(g)).toEqual([]);
}

async function attach(info: import('@playwright/test').TestInfo, measures: unknown) {
  await info.attach('measures', { body: JSON.stringify(measures, null, 2), contentType: 'application/json' });
}

/** Long tasks over 50 ms. */
const long = (list: number[]) => list.filter((ms) => ms > 50);

test.describe('with 150 pieces on 10 sheets', () => {
  test.beforeEach(async ({ app }) => {
    await load150(app);
  });

  test('dragging a piece: each move < 1 ms (p95), frames p95 < 34 ms; dropping, with its full render, < 50 ms; no long tasks', async ({ page }, info) => {
    const drag = await page.evaluate(async () => {
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      const longs: number[] = [];
      const observer = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      observer.observe({ entryTypes: ['longtask'] });
      const node = document.querySelectorAll('#sheets .page')[4].querySelector<HTMLElement>('.piece')!;
      node.scrollIntoView({ block: 'center' });
      await frame();
      const r = node.getBoundingClientRect();
      const opts = (x: number, y: number) => ({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 });
      node.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + 5, r.top + 5)));
      const times: number[] = [];
      const frames: number[] = [];
      let last = performance.now();
      for (let i = 1; i <= 120; i++) {
        const t = performance.now();
        node.dispatchEvent(new PointerEvent('pointermove', opts(r.left + 5 + i * 2, r.top + 5 + i * 3)));
        times.push(performance.now() - t);
        await frame();
        const now = performance.now();
        frames.push(now - last);
        last = now;
      }
      // While dragging, the piece is in the drag layer.
      const moved = document.getElementById('drag-layer')!.contains(node);
      const t = performance.now();
      node.dispatchEvent(new PointerEvent('pointerup', opts(r.left + 245, r.top + 365)));
      const up = performance.now() - t;
      // The drop rendered within that time: the piece is back on a sheet.
      const landed = !!document.querySelector(`#sheets .page .piece[data-id="${node.dataset.id}"]`);
      // A long task is reported when it ends, before the next frames: after two,
      // its entry is in the observer's buffer, and takeRecords() collects it.
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      longs.push(...observer.takeRecords().map((e) => e.duration));
      observer.disconnect();
      times.sort((a, b) => a - b);
      frames.sort((a, b) => a - b);
      return { moved, landed, median: times[60], p95: times[114], max: times.at(-1)!, frameP95: frames[114], up, longs };
    });
    await attach(info, drag);
    expect(drag.moved, 'the gesture really drags (the drag layer)').toBe(true);
    expect(drag.landed, 'the drop is rendered when pointerup returns').toBe(true);
    expect(drag.p95).toBeLessThan(1);
    expect(drag.frameP95).toBeLessThan(34);
    expect(drag.up).toBeLessThan(50);
    expect(long(drag.longs)).toEqual([]);
  });

  test('scrolling through the 10 sheets: frames p95 < 34 ms, no long tasks; without a selection the current sheet follows the scroll', async ({ page }, info) => {
    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('#sheets .piece.is-selected').count()).toBe(0);
    const scroll = await page.evaluate(async () => {
      const stage = document.getElementById('stage')!;
      stage.scrollTop = 0;
      const longs: number[] = [];
      const observer = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      observer.observe({ entryTypes: ['longtask'] });
      const gaps: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 90; i++) {
        stage.scrollTop += 80;
        await new Promise((done) => requestAnimationFrame(done));
        const now = performance.now();
        gaps.push(now - last);
        last = now;
      }
      observer.disconnect();
      gaps.sort((a, b) => a - b);
      return { median: gaps[45], p95: gaps[85], max: gaps.at(-1)!, longs, scrollTop: stage.scrollTop };
    });
    await attach(info, scroll);
    expect(scroll.p95).toBeLessThan(34);
    expect(long(scroll.longs)).toEqual([]);
    await expect(page.locator('#sheets .page.is-current .page-label')).toHaveText(/^Hoja (9|10) de 10$/);
  });

  test('selecting a piece, until it shows selected: < 30 ms (median of 10)', async ({ page }, info) => {
    const sel = await page.evaluate(async () => {
      // One task later (after React's flush), without the 4 ms clamp of setTimeout.
      const nextTask = () =>
        new Promise<void>((done) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => done();
          channel.port2.postMessage(null);
        });
      const nodes = document.querySelectorAll<HTMLElement>('#sheets .piece');
      const times: number[] = [];
      for (let i = 0; i < 10; i++) {
        const node = nodes[i * 13];
        node.scrollIntoView({ block: 'center' });
        await new Promise((done) => requestAnimationFrame(done));
        const t = performance.now();
        node.focus({ preventScroll: true });
        while (!node.classList.contains('is-selected') && performance.now() - t < 1000) await nextTask();
        times.push(performance.now() - t);
      }
      const selected = [...document.querySelectorAll('#sheets .piece.is-selected')].map((n) => (n as HTMLElement).dataset.id);
      times.sort((a, b) => a - b);
      return { median: times[5], max: times.at(-1)!, selected, last: nodes[9 * 13].dataset.id };
    });
    await attach(info, sel);
    expect(sel.selected, 'the last one focused is the one selected').toEqual([sel.last]);
    expect(sel.median).toBeLessThan(30);
  });

  test('zooming with Ctrl + wheel, a turn a frame in and out: frames p95 < 34 ms, no long tasks', async ({ page }, info) => {
    const before = await page.locator('#zoom-level').textContent();
    const zoom = await page.evaluate(async () => {
      const stage = document.getElementById('stage')!;
      const r = stage.getBoundingClientRect();
      const longs: number[] = [];
      const observer = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      observer.observe({ entryTypes: ['longtask'] });
      const gaps: number[] = [];
      const levels = new Set<string>();
      let last = performance.now();
      for (let i = 0; i < 40; i++) {
        const deltaY = i < 20 ? -40 : 40;
        stage.dispatchEvent(new WheelEvent('wheel', { deltaY, ctrlKey: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
        await new Promise((done) => requestAnimationFrame(done));
        levels.add(document.getElementById('zoom-level')!.textContent ?? '');
        const now = performance.now();
        gaps.push(now - last);
        last = now;
      }
      // A long task is reported when it ends, before the next frames: after two,
      // its entry is in the observer's buffer, and takeRecords() collects it.
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      longs.push(...observer.takeRecords().map((e) => e.duration));
      observer.disconnect();
      gaps.sort((a, b) => a - b);
      return { median: gaps[20], p95: gaps[37], max: gaps.at(-1)!, longs, levels: levels.size };
    });
    await attach(info, { ...zoom, before });
    expect(zoom.levels, 'the wheel really zooms').toBeGreaterThan(5);
    expect(zoom.p95).toBeLessThan(34);
    expect(long(zoom.longs)).toEqual([]);
  });

  test('pinching with two fingers, spreading and closing a little each frame: each move < 1 ms (p95), frames p95 < 34 ms, no long tasks', async ({ page }, info) => {
    const before = await page.locator('#zoom-level').textContent();
    const pinch = await page.evaluate(async () => {
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      const stage = document.getElementById('stage')!;
      const r = stage.getBoundingClientRect();
      const longs: number[] = [];
      const observer = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      observer.observe({ entryTypes: ['longtask'] });
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const opts = (id: number, x: number) => ({ bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 21, clientX: x, clientY: cy, button: 0, buttons: 1 });
      const fingers = (type: string, d: number) => {
        for (const [id, x] of [[21, cx - d / 2], [22, cx + d / 2]]) stage.dispatchEvent(new PointerEvent(type, opts(id, x)));
      };
      fingers('pointerdown', 100);
      const times: number[] = [];
      const gaps: number[] = [];
      const levels = new Set<string>();
      let last = performance.now();
      for (let i = 1; i <= 40; i++) {
        const t = performance.now();
        // Both fingers move each frame, as a phone sends them.
        fingers('pointermove', i <= 20 ? 100 + i * 12 : 340 - (i - 20) * 12);
        times.push(performance.now() - t);
        await frame();
        levels.add(document.getElementById('zoom-level')!.textContent ?? '');
        const now = performance.now();
        gaps.push(now - last);
        last = now;
      }
      fingers('pointerup', 100);
      // A long task is reported when it ends, before the next frames: after two,
      // its entry is in the observer's buffer, and takeRecords() collects it.
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      longs.push(...observer.takeRecords().map((e) => e.duration));
      observer.disconnect();
      times.sort((a, b) => a - b);
      gaps.sort((a, b) => a - b);
      return { median: times[20], p95: times[37], max: times.at(-1)!, frameMedian: gaps[20], frameP95: gaps[37], frameMax: gaps.at(-1)!, longs, levels: levels.size };
    });
    await attach(info, { ...pinch, before });
    expect(pinch.levels, 'the fingers really zoom').toBeGreaterThan(5);
    expect(pinch.p95).toBeLessThan(1);
    expect(pinch.frameP95).toBeLessThan(34);
    expect(long(pinch.longs)).toEqual([]);
  });

  test('gliding on after two fingers pan and lift: lifting < 16 ms, frames p95 < 34 ms until it stops, no long tasks', async ({ page }, info) => {
    await page.keyboard.press('Escape');
    // The glide doesn't run with reduced motion.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const glide = await page.evaluate(async () => {
      const frame = () => new Promise((done) => requestAnimationFrame(done));
      const stage = document.getElementById('stage')!;
      stage.scrollTop = 0;
      await frame();
      const r = stage.getBoundingClientRect();
      const longs: number[] = [];
      const observer = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      observer.observe({ entryTypes: ['longtask'] });
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.8;
      const opts = (id: number, x: number, y: number) => ({ bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 31, clientX: x, clientY: y, button: 0, buttons: 1 });
      const fingers = (type: string, dy: number) => {
        for (const [id, x] of [[31, cx - 50], [32, cx + 50]]) stage.dispatchEvent(new PointerEvent(type, opts(id, x, cy + dy)));
      };
      fingers('pointerdown', 0);
      // Up 30 px a frame, both fingers, then lifted as they move.
      for (let i = 1; i <= 10; i++) {
        await frame();
        fingers('pointermove', -i * 30);
      }
      const t = performance.now();
      fingers('pointerup', -300);
      const up = performance.now() - t;
      const released = stage.scrollTop;
      const gaps: number[] = [];
      let last = performance.now();
      let still = 0;
      let top = stage.scrollTop;
      // Until the scroll has stayed put for 10 frames (those aren't counted).
      while (still < 10 && gaps.length < 1000) {
        await frame();
        const now = performance.now();
        gaps.push(now - last);
        last = now;
        still = stage.scrollTop === top ? still + 1 : 0;
        top = stage.scrollTop;
      }
      gaps.splice(-10);
      // A long task is reported when it ends, before the next frames: after two,
      // its entry is in the observer's buffer, and takeRecords() collects it.
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      longs.push(...observer.takeRecords().map((e) => e.duration));
      observer.disconnect();
      gaps.sort((a, b) => a - b);
      const at = (q: number) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))];
      return { up, glided: stage.scrollTop - released, frames: gaps.length, frameMedian: at(0.5), frameP95: at(0.95), frameMax: gaps.at(-1)!, longs };
    });
    await attach(info, glide);
    expect(glide.glided, 'the sheets really glide on').toBeGreaterThan(300);
    expect(glide.up).toBeLessThan(16);
    expect(glide.frameP95).toBeLessThan(34);
    expect(long(glide.longs)).toEqual([]);
  });

  test('dragging at 200 % and out of the sheets (where the new-sheet placeholders show): each move < 1 ms (p95), no long tasks', async ({ page }, info) => {
    await page.locator('#zoom-level').click();
    await page.locator('#zoom-menu-level-200').click();
    await expect(page.locator('#zoom-level')).toContainText('200');
    const drag = await page.evaluate(async () => {
      const longs: number[] = [];
      const observer = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      observer.observe({ entryTypes: ['longtask'] });
      const node = document.querySelectorAll('#sheets .page')[4].querySelector<HTMLElement>('.piece')!;
      node.scrollIntoView({ block: 'center', inline: 'center' });
      await new Promise((done) => requestAnimationFrame(done));
      const r = node.getBoundingClientRect();
      const sheet = node.closest('.sheet')!.getBoundingClientRect();
      const opts = (x: number, y: number) => ({ bubbles: true, cancelable: true, pointerId: 8, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 });
      node.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + 5, r.top + 5)));
      const times: number[] = [];
      // Inside the sheet, then out past its left edge (outside every sheet).
      const to = (i: number) => (i < 60 ? [r.left + 5 + i * 2, r.top + 5 + i] : [r.left + 5 - (i - 60) * ((r.left - sheet.left + 400) / 60), r.top + 65]);
      for (let i = 1; i <= 120; i++) {
        const [x, y] = to(i);
        const t = performance.now();
        node.dispatchEvent(new PointerEvent('pointermove', opts(x, y)));
        times.push(performance.now() - t);
        await new Promise((done) => requestAnimationFrame(done));
      }
      const outside = !document.getElementById('new-sheet-end')!.hidden;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      node.dispatchEvent(new PointerEvent('pointerup', opts(r.left, r.top)));
      // A long task is reported when it ends, before the next frames: after two,
      // its entry is in the observer's buffer, and takeRecords() collects it.
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      longs.push(...observer.takeRecords().map((e) => e.duration));
      observer.disconnect();
      times.sort((a, b) => a - b);
      return { median: times[60], p95: times[114], max: times.at(-1)!, outside, longs };
    });
    await attach(info, drag);
    expect(drag.outside, 'the drag ends outside the sheets, with the placeholders').toBe(true);
    expect(drag.p95).toBeLessThan(1);
    expect(long(drag.longs)).toEqual([]);
  });
});

test('tracing the contour of a 4000 × 4000 px transparent image: drawn < 2 s after choosing «Silueta», no long tasks', async ({ app, page }, info) => {
  // A lobed shape and a dot on a transparent background, drawn in the page.
  const png = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(4000, 4000);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e8743b';
    ctx.beginPath();
    for (let i = 0; i <= 360; i++) {
      const a = (i / 360) * 2 * Math.PI;
      const r = 1400 * (0.7 + 0.3 * Math.cos(5 * a));
      ctx.lineTo(2000 + r * Math.cos(a), 2000 + r * Math.sin(a));
    }
    ctx.fill();
    ctx.beginPath();
    ctx.arc(450, 450, 250, 0, 2 * Math.PI);
    ctx.fill();
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  await page.locator('#file').setInputFiles({ name: 'grande.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(app.pieces()).toHaveCount(1, { timeout: 60_000 });
  await app.idle();
  await app.openSetting('#cut-mode');
  const traced = await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    const longs: number[] = [];
    const observer = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
    observer.observe({ entryTypes: ['longtask'] });
    const t0 = performance.now();
    document.querySelector<HTMLInputElement>('#cut-mode input[value="contour"]')!.click();
    while (!document.querySelector('#sheets .cut-layer path')) await frame();
    const ms = performance.now() - t0;
    await frame();
    await frame();
    longs.push(...observer.takeRecords().map((e) => e.duration));
    observer.disconnect();
    return { ms, longs, paths: document.querySelectorAll('#sheets .cut-layer path').length };
  });
  await attach(info, traced);
  expect(traced.paths, 'the shape and the dot').toBe(2);
  expect(traced.ms).toBeLessThan(2000);
  expect(long(traced.longs)).toEqual([]);
});
