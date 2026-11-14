// Cut lines in a real browser: the layer over the pieces lets the pointer
// through, hides while dragging, follows the cut margin while typing, the
// selected piece shows its cut box, and the choice survives a reload. Which
// lines and which stroke are tested lower (tests/components/CutLayer.test.tsx,
// tests/components/CutsSection.test.tsx, tests/core/cutmarks.test.js,
// tests/services/pdf.test.js); the PDF against the screen, in export-parity.spec.ts.
import type { Page } from '@playwright/test';
import { expect, test, type App } from '../support/test.ts';

/** The first sheet's cut lines (mm, as the SVG draws them) and its stroke. */
const screenLines = (page: Page) =>
  page.evaluate(() => {
    const svg = document.querySelector('#sheets .page .cut-layer');
    if (!svg) return null;
    return {
      width: svg.getAttribute('data-width'),
      color: svg.getAttribute('data-color'),
      dash: svg.getAttribute('data-dash'),
      lines: [...svg.querySelectorAll('line')].map((l) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k)))),
    };
  });

async function chooseCuts(app: App, mode: 'none' | 'corners' | 'outline') {
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

test('the cut lines, their stroke and margin, and the crops are saved with the project: after a reload, the same pieces, lines and controls', async ({ app, page }) => {
  await app.addFiles(['wide.png', 'twopage.pdf', 'small.jpg']);
  const [image, pdf] = await app.ids();
  for (const [id, size] of [[image, 'id-4x4'], [pdf, '9x13']] as const) {
    await app.piece(id).focus();
    await app.openMeasures();
    await page.locator('#photo-size').selectOption(size);
    await expect(page.locator('#photo-size')).toHaveValue(size);
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
  expect(await screenLines(page)).toEqual(saved);
  await app.openSetting('#cut-mode');
  await expect(page.locator('#cut-mode input[value="outline"]')).toBeChecked();
  await moreOptions(app);
  await expect(page.locator('#cut-weight input[value="medium"]')).toBeChecked();
  await expect(page.locator('#cut-dash input[value="dotted"]')).toBeChecked();
  await expect(page.locator('#cut-margin')).toHaveValue('3');
});
