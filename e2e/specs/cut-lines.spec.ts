// Cut lines in a real browser: the layer over the pieces lets the pointer
// through, hides while dragging, waits while the pieces glide to where a
// change leaves them (frame by frame), follows the cut margin while typing, the
// selected piece shows its cut box, an image the worker finds no transparency
// in says why its Contour line is its rectangle, and the choice survives a reload. Which
// lines and which stroke are tested lower (tests/components/CutLayer.test.tsx,
// tests/components/CutsSection.test.tsx, tests/core/cutmarks.test.js,
// tests/services/pdf.test.js); the PDF against the screen, in export-parity.spec.ts.
import type { Page } from '@playwright/test';
import { dragPieceTo, pieceOf } from '../support/editing.ts';
import { animationsOver, dropNoted, expectGlide, noteClick, TOL, wayOf } from '../support/motion.ts';
import { cards, expect, test, type App } from '../support/test.ts';

/** The first sheet's cut lines (mm, as the SVG draws them) and its stroke. */
const screenLines = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('#sheets .page .cut-layer');
    if (!svg) return null;
    return {
      width: svg.getAttribute('data-width'),
      color: svg.getAttribute('data-color'),
      dash: svg.getAttribute('data-dash'),
      // The cut lines themselves, not their emphasis while a control of theirs has the pointer or the focus.
      lines: [...svg.querySelectorAll(':scope > g:not(.cut-emphasis) line')].map((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k)))),
    };
  });

async function chooseCuts(app: App, mode: 'none' | 'corners' | 'outline' | 'contour') {
  await app.page.keyboard.press('Escape');
  await app.openSetting('#cut-mode');
  // The chip's radio covers it (it is what gets the click).
  await app.page.locator(`#cut-mode input[value="${mode}"]`).click();
  await expect(app.page.locator(`#cut-mode input[value="${mode}"]`)).toBeChecked();
}

async function moreOptions(app: App) {
  await app.openSetting('#cut-mode');
  const details = app.page.locator('#cut-options');
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator('summary').click();
  await expect(app.page.locator('#cut-margin')).toBeVisible();
}

test.describe('the cut layer', () => {
  test('is drawn when chosen, hidden from assistive technology, and lets the pointer through to the pieces', async ({ app, page }) => {
    await app.addFiles(['wide.png', 'tall.png', 'small.jpg']);
    await expect(page.locator('.cut-layer')).toHaveCount(0);
    await chooseCuts(app, 'corners');
    await expect.poll(async () => (await screenLines(page))?.lines.length ?? 0).toBeGreaterThan(0);
    const layer = page.locator('#sheets .cut-layer').first();
    await expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(await layer.evaluate((svg) => getComputedStyle(svg).pointerEvents)).toBe('none');
    // The layer covers the whole sheet, over the pieces: a point on a piece still reaches the piece.
    const [id] = await app.ids();
    const box = (await app.piece(id).boundingBox())!;
    const hit = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y)?.closest('.piece') as HTMLElement | null)?.dataset.id ?? null, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(hit).toBe(String(id));
    const covers = await layer.evaluate((svg) => {
      const a = svg.getBoundingClientRect();
      const b = svg.closest('.sheet')!.getBoundingClientRect();
      return Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
    });
    expect(covers).toBe(true);
  });

  test('hides while dragging a piece and comes back on drop', async ({ app, page }) => {
    await app.addFiles(['wide.png', 'tall.png']);
    await chooseCuts(app, 'outline');
    const layer = page.locator('#sheets .cut-layer').first();
    await expect(layer).toBeVisible();
    const [id] = await app.ids();
    const b = (await app.piece(id).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 + 10, { steps: 4 });
    await expect(layer).toBeHidden();
    expect(await layer.evaluate((svg) => getComputedStyle(svg).visibility)).toBe('hidden');
    await page.mouse.up();
    await expect(layer).toBeVisible();
  });

  /** Three cards arranged with outline cut lines, one dragged away: «Arrange» takes it back. Returns its id. */
  async function oneAway(app: App) {
    await app.addFiles(cards(0, 3));
    await app.page.locator('#arrange').click();
    await chooseCuts(app, 'outline');
    const [id] = await app.ids();
    const p = await pieceOf(app, id);
    await dragPieceTo(app, id, p.x, p.y + 150);
    await expect.poll(async () => (await pieceOf(app, id)).y).not.toBe(p.y);
    await animationsOver(app.page);
    return id;
  }

  test.describe('with motion', () => {
    test.use({ contextOptions: { reducedMotion: 'no-preference' } });

    test('while the pieces glide to where «Arrange» leaves them, the lines, already where they end, wait for them, frame by frame', async ({ app, page }) => {
      const id = await oneAway(app);
      await noteClick(page, [id]);
      await page.locator('#arrange').click();
      const noted = await dropNoted(page);
      expectGlide(noted, 0);
      const rest = noted.frames.at(-1)!.pieces[0];
      // Until its last stretch: they fade in as it gets there, and an engine may start them a frame apart.
      const away = noted.frames.filter((f) => Math.hypot(f.pieces[0].x - rest.x, f.pieces[0].y - rest.y) > wayOf(noted, 0).travel / 10);
      expect(away.map((f) => Math.max(...f.cuts)), 'hidden while the piece is on its way').toEqual(away.map(() => 0));
      expect(noted.frames.at(-1)!.cuts, 'and back once it is there').toEqual([1]);
    });
  });

  test('with reduced motion, the lines are there at every frame after «Arrange»', async ({ app, page }) => {
    const id = await oneAway(app);
    await noteClick(page, [id]);
    await page.locator('#arrange').click();
    const noted = await dropNoted(page);
    expect(wayOf(noted, 0).travel, 'it went back').toBeGreaterThan(10 * TOL);
    expect(noted.frames.map((f) => f.cuts), 'shown at every frame').toEqual(noted.frames.map(() => [1]));
  });
});

test.describe('the cut margin', () => {
  test('typing a margin moves the cut line live, before confirming', async ({ app, page }) => {
    await app.addFiles(['wide.png', 'tall.png']);
    await page.locator('#arrange').click();
    await chooseCuts(app, 'outline');
    await moreOptions(app);
    const piece = (await app.geometry()).pieces[0];
    const onEdge = (lines: number[][], d: number) =>
      lines.some(([x1, y1, x2, y2]) => (x1 === x2 && Math.abs(x1 - (piece.x - d)) < 0.01) || (y1 === y2 && Math.abs(y1 - (piece.y - d)) < 0.01));
    expect(onEdge((await screenLines(page))!.lines, 0)).toBe(true);
    await page.locator('#cut-margin').fill('4');
    await expect.poll(async () => onEdge((await screenLines(page))!.lines, 4)).toBe(true);
    expect(onEdge((await screenLines(page))!.lines, 0)).toBe(false);
    await expect(page.locator('#cut-margin')).toBeFocused(); // not confirmed yet
  });

  test('the selected piece shows its cut box faintly, the margin away from its frame', async ({ app, page }) => {
    await app.addFiles(['wide.png', 'tall.png']);
    await page.locator('#arrange').click();
    await chooseCuts(app, 'outline');
    const [id] = await app.ids();
    await app.piece(id).focus();
    await expect(page.locator('#frame')).toBeVisible();
    await expect(page.locator('#frame')).not.toHaveAttribute('data-cut');
    await moreOptions(app);
    await page.locator('#cut-margin').fill('3');
    await page.locator('#cut-margin').press('Enter');
    await app.piece(id).focus();
    await expect(page.locator('#frame')).toHaveAttribute('data-cut', '');
    const { zoom } = await app.geometry();
    const cutBox = await page.locator('#frame').evaluate((frame) => {
      const s = getComputedStyle(frame, '::before');
      return { content: s.content, border: s.borderTopStyle, inset: parseFloat(s.top) };
    });
    expect(cutBox.content).not.toBe('none');
    expect(cutBox.border).toBe('dashed');
    expect(cutBox.inset).toBeCloseTo(-3 * zoom, 1);
  });
});

test.describe('Contour on images without a transparent background', () => {
  // The worker traces each image for real: an RGB PNG comes back as having
  // nothing transparent, as a JPG is known to; which rows and notes say so
  // in every case is tested lower (tests/components/no-transparent-background.test.tsx).
  test('a JPG and an opaque PNG keep their rectangle and say why in their row and in the Item tab while a transparent PNG follows its shape', async ({ app, page }) => {
    await app.addFiles(['sticker.png', 'wide.png', 'small.jpg']);
    const idOf = async (name: string) => Number(await app.pieceNamed(name).getAttribute('data-id'));
    const [sticker, wide, small] = [await idOf('sticker.png'), await idOf('wide.png'), await idOf('small.jpg')];
    const badge = (id: number) => app.row(id).locator('.row-badge[data-kind="opaque"]');
    const why = 'Sin fondo transparente, la línea de corte es rectangular';
    await page.locator('#arrange').click();
    await chooseCuts(app, 'contour');
    // The sticker's shape and the other two's rectangles (their 8 sides are apart: 5 mm of gap).
    await expect.poll(() => page.locator('#sheets .cut-layer > g:not(.cut-emphasis) path').count()).toBeGreaterThan(0);
    await expect(page.locator('#sheets .cut-layer > g:not(.cut-emphasis) line')).toHaveCount(8);
    await expect(badge(wide)).toHaveAttribute('data-tip', why);
    await expect(badge(small)).toHaveAttribute('data-tip', why);
    await expect(badge(sticker)).toHaveCount(0);
    await expect(app.row(small)).toHaveAccessibleName(new RegExp(`^small\\.jpg.+\\. ${why}$`));

    await app.row(small).click();
    await app.showTab('piece');
    await expect(page.locator('#opaque-note')).toBeVisible();
    await expect(page.locator('#opaque-note')).toHaveText(why);
    await app.row(sticker).click();
    await expect(page.locator('#opaque-note')).toBeHidden();

    // With Outline the rectangle is what was asked for: nothing to explain.
    await chooseCuts(app, 'outline');
    await expect(page.locator('#piece-list .row-badge[data-kind="opaque"]')).toHaveCount(0);
  });
});

test('the cut lines, their stroke and margin, and the crops are saved with the project: after a reload, the same pieces, lines and controls', async ({ app, page }) => {
  await app.addFiles(['wide.png', 'twopage.pdf', 'small.jpg']);
  const [image, pdf] = await app.ids();
  for (const [id, size] of [[image, 'id-4x4'], [pdf, '9x13']] as const) {
    await app.piece(id).focus();
    await app.choosePhotoSize(size);
  }
  await page.locator('#arrange').click();
  await chooseCuts(app, 'outline');
  await moreOptions(app);
  await page.locator('#cut-weight input[value="medium"]').click();
  await page.locator('#cut-dash input[value="dotted"]').click();
  await page.locator('#cut-margin').fill('3');
  await page.locator('#cut-margin').press('Enter');
  await expect.poll(async () => (await screenLines(page))?.dash).not.toBe('');
  const saved = await screenLines(page);
  expect(saved).toMatchObject({ width: '0.5', color: '#000000' });
  const pieces = await app.snapshot();
  await expect(page.locator('#project')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await app.ready();
  await expect(app.pieces()).toHaveCount(3);
  await expect.poll(() => app.snapshot()).toBe(pieces);
  await expect.poll(() => screenLines(page)).toEqual(saved);
  await app.openSetting('#cut-mode');
  await expect(page.locator('#cut-mode input[value="outline"]')).toBeChecked();
  await moreOptions(app);
  await expect(page.locator('#cut-weight input[value="medium"]')).toBeChecked();
  await expect(page.locator('#cut-dash input[value="dotted"]')).toBeChecked();
  await expect(page.locator('#cut-margin')).toHaveValue('3');
});
