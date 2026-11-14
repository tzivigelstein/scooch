// The panels and the «Propiedades» tabs at the three layouts — columns (1440),
// the pieces drawer (1024) and the bottom sheet (390) — with what only a
// browser shows: what is visible at each width, opening and closing the drawer
// and the sheet, touch-sized targets, no horizontal scroll, a section kept
// across a reload, and the tabs reached with the real pointer, keyboard and
// focus. What the panels show and the tabs' semantics are tested in
// tests/components (Tabs, panels, PieceList); which tab follows the selection
// in tests/state/follow-selection.test.ts.
import { horizontalOverflow, readSmallTargets, readTabs } from '../support/layout.ts';
import { expect, test, tiles, type App } from '../support/test.ts';

const tabs = (app: App) => app.page.evaluate(readTabs);

test.describe('panel layouts', () => {
  test.describe('at 1440 px', () => {
    test('both panels are columns, without panel buttons; the empty list shows its help and the add zone', async ({ app }) => {
      const { page } = app;
      await expect(page.locator('#pieces-panel')).toBeVisible();
      await expect(page.locator('#props-panel')).toBeVisible();
      await expect(page.locator('#pieces-toggle')).toBeHidden();
      await expect(page.locator('#pieces-dock')).toBeHidden();
      await expect(page.locator('#list-empty')).toBeVisible();
      await expect(page.locator('#addzone')).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });

    test('a collapsed section stays collapsed after a reload, and opens again', async ({ app, page }) => {
      await app.addFiles(['small.jpg', 'square.webp', 'tall.png']);
      await app.showTab('project');
      const arrange = page.locator('[aria-controls="section-arrange"]');
      await arrange.click();
      await expect(arrange).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#gap')).toBeHidden();
      await expect(page.locator('#project')).toHaveAttribute('data-status', 'saved');
      await page.reload();
      await app.ready();
      await expect(app.pieces()).toHaveCount(3);
      await app.showTab('project');
      await expect(arrange).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#gap')).toBeHidden();
      await arrange.click();
      await expect(page.locator('#gap')).toBeVisible();
    });
  });

  test.describe('at 1024 px', () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test('the pieces panel folds into a «Piezas» strip: it opens over the canvas with the focus in the list; Esc, P and a click outside', async ({ app, page }) => {
      await app.addFiles(['small.jpg', 'square.webp']);
      const toggle = page.locator('#pieces-toggle');
      const panel = page.locator('#pieces-panel');
      await expect(toggle).toBeVisible();
      await expect(panel).toBeHidden();
      await expect(page.locator('#props-panel')).toBeVisible();

      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(panel).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#piece-list .piece-row:focus')).toHaveCount(1);

      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await app.pieceNamed('small.jpg').focus();
      await page.keyboard.press('p');
      await expect(panel).toBeVisible();
      await expect(page.locator('#piece-list .piece-row:focus')).toHaveCount(1);

      await page.mouse.click(600, 700);
      await expect(panel).toBeHidden();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  });

  test.describe('at 390 px', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('no side panels: «Piezas» and «Propiedades» at the bottom open the bottom sheet and the list overlay, touch-sized, without horizontal scroll', async ({ app, page }) => {
      const props = page.locator('#props-panel');
      const pieces = page.locator('#pieces-panel');
      await expect(pieces).toBeHidden();
      await expect(props).toBeHidden();
      await expect(page.locator('#pieces-dock')).toBeVisible();
      await expect(page.locator('#props-toggle')).toBeVisible();
      await app.addFiles(['small.jpg', 'square.webp']);

      await app.pieces().first().focus();
      await page.locator('#props-toggle').click();
      await expect(props).toBeVisible();
      await expect(page.locator('#props-toggle')).toHaveAttribute('aria-expanded', 'true');
      const sheet = (await props.boundingBox())!;
      expect(sheet.width).toBeCloseTo(390, 0);
      expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(843);
      expect(await page.evaluate(readSmallTargets, '#props-panel button, #props-panel input, #props-panel select, #props-panel summary, .topbar button')).toEqual([]);

      await page.keyboard.press('Escape');
      await expect(props).toBeHidden();
      await page.locator('#pieces-dock').click();
      await expect(pieces).toBeVisible();
      await expect(page.locator('#piece-list .piece-row:focus')).toHaveCount(1);
      expect(await page.evaluate(readSmallTargets, '.dock-btn, #piece-list [role="option"]')).toEqual([]);

      await page.locator('#pieces-panel .drawer-close').click();
      await expect(pieces).toBeHidden();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });

    test('the top bar takes two rows (brand and project; actions)', async ({ app }) => {
      const { page } = app;
      const bar = (await page.locator('.topbar').boundingBox())!;
      expect(bar.height).toBeGreaterThan(80);
      expect(bar.height).toBeLessThan(110);
    });
  });
});

// A wide screen makes the side panels wider, nothing else: the text and the
// controls keep the browser's size (the root font is 100 % at every width).
test.describe('wide screens', () => {
  const WIDTHS = [1440, 1920, 2560, 3440];
  /** The panels' widths: their usual size, then a share of the screen, up to a cap (src/styles/tokens.css). */
  const expected = (w: number) => ({ left: Math.min(Math.max(228, 0.15 * w), 320), right: Math.min(Math.max(288, 0.19 * w), 384) });

  test('only the side panels grow: the root font, a top-bar button and a field stay the same size, with no horizontal scroll', async ({ app, page }) => {
    await app.addFiles(tiles(0, 2));
    await app.row((await app.ids())[0]).click();
    const sizes: Record<string, string | number>[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1200 });
      const panels = expected(width);
      await expect.poll(() => page.locator('#pieces-panel').evaluate((el) => el.getBoundingClientRect().width), { message: `left panel at ${width}` }).toBeCloseTo(panels.left, 1);
      await expect.poll(() => page.locator('#props-panel').evaluate((el) => el.getBoundingClientRect().width), { message: `right panel at ${width}` }).toBeCloseTo(panels.right, 1);
      sizes.push(
        await page.evaluate(() => ({
          root: getComputedStyle(document.documentElement).fontSize,
          button: document.getElementById('export')!.getBoundingClientRect().height,
          label: getComputedStyle(document.getElementById('export')!).fontSize,
          field: document.getElementById('pos-x')!.getBoundingClientRect().height,
          list: getComputedStyle(document.querySelector('#piece-list [role="option"]')!).fontSize,
        }))
      );
      expect(await horizontalOverflow(page), `no horizontal scroll at ${width}`).toBeLessThanOrEqual(0);
    }
    expect(sizes[0].root).toBe('16px');
    for (const [i, size] of sizes.entries()) expect(size, `sizes at ${WIDTHS[i]} px`).toEqual(sizes[0]);
  });
});

test.describe('properties tabs', () => {
  test('the sheet’s title, «Cambiar el papel»: a click, and Enter or Space after Shift+Tab, show Proyecto with nothing selected and Papel open and in view, with the focus on the paper size; Tab onto a piece shows Pieza', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp', 'tall.png']);
    const title = page.locator('.page-label');
    const papel = page.locator('[aria-controls="section-sheet"]');
    const panel = page.locator('#props-panel');
    await expect(title).toHaveRole('button');
    await expect(title).toHaveAccessibleName('Hoja 1 de 1: cambiar el papel');
    await expect(title).toHaveAttribute('data-tip', 'Cambiar el papel');
    await expect(title).toHaveAccessibleDescription('Lleva a Papel, en la pestaña Proyecto de Propiedades');
    /** Papel's header is below the tabs (they stick to the top of the panel) and the paper size above the panel's end. */
    const papelInView = () =>
      page.evaluate(() => {
        const bottom = document.getElementById('props-panel')!.getBoundingClientRect().bottom;
        const tabsBottom = document.querySelector('.props-tabs')!.getBoundingClientRect().bottom;
        return document.querySelector('[aria-controls="section-sheet"]')!.getBoundingClientRect().top >= tabsBottom - 0.5 && document.getElementById('paper')!.getBoundingClientRect().bottom <= bottom + 0.5;
      });

    // Papel collapsed: the title opens it.
    await app.showTab('project');
    await papel.click();
    await expect(papel).toHaveAttribute('aria-expanded', 'false');
    await title.click();
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project', active: 'paper' });
    await expect(papel).toHaveAttribute('aria-expanded', 'true');

    // A piece selected (the lowest, so its toolbar isn't over the title) and
    // Pieza scrolled to its end, in a window short enough for the panel to scroll.
    await page.setViewportSize({ width: 1440, height: 560 });
    const lowest = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#sheets .piece')].sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0].dataset.id);
    await app.piece(Number(lowest)).click();
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'piece', activePiece: Number(lowest) });
    await panel.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await title.click();
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project', active: 'paper' });
    expect(await app.selectedIds()).toEqual([]);
    expect(await papelInView()).toBe(true);

    for (const key of ['Enter', 'Space']) {
      await test.step(key, async () => {
        await app.pieces().first().focus();
        await expect.poll(() => tabs(app)).toMatchObject({ selected: 'piece' });
        for (let i = 0; i < 10 && !(await title.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Shift+Tab');
        await expect(title).toBeFocused();
        await page.keyboard.press(key);
        await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project', active: 'paper' });
        expect(await app.selectedIds()).toEqual([]);
      });
    }

    // Tab from the title onto a piece: it gets selected and Pieza shows; the focus stays on the piece.
    await title.focus();
    for (let i = 0; i < 5 && (await app.active()).piece === null; i++) await page.keyboard.press('Tab');
    const focused = (await app.active()).piece;
    expect(focused).not.toBeNull();
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'piece', activePiece: focused });
    expect(await app.selectedIds()).toEqual([focused]);
  });

  test('M and H with the real focus: the tab shows with the focus on it, Tab goes into its controls and Esc back to the canvas', async ({ app, page }) => {
    await app.addFiles(['small.jpg', 'square.webp', 'tall.png']);
    const first = app.pieces().first();
    await first.focus();
    await page.locator('#props-tab-project').click();
    await first.focus();
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project' });

    await page.keyboard.press('m');
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'piece', active: 'props-tab-piece', tabStops: 'piece' });
    await page.keyboard.press('h');
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project', active: 'props-tab-project', tabStops: 'project' });
    await page.keyboard.press('Tab');
    await expect(page.locator('[aria-controls="section-sheet"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#paper')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sheets .piece.is-selected')).toBeFocused();

    // Nothing selected: M shows Pieza with only its hint; Esc goes back to the sheet.
    await page.keyboard.press('Escape');
    await expect.poll(() => app.selectedIds()).toEqual([]);
    await page.keyboard.press('m');
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'piece', active: 'props-tab-piece', hintOnly: true });
    await expect(page.locator('#piece-empty')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#sheets'))).toBe(true);
  });

  test('a selection change while typing in a Proyecto field doesn’t hide the field', async ({ app, page }) => {
    // Nothing selected: Proyecto shows. Files that finish loading get selected,
    // which would switch to Pieza — but the field being typed in stays.
    await app.openSetting('#gap');
    const gap = page.locator('#gap');
    await gap.focus();
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project', active: 'gap' });
    await app.addFiles(tiles(0, 2));
    expect((await app.selectedIds()).length).toBeGreaterThan(0);
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project', active: 'gap' });
    await expect(gap).toBeVisible();
    // Once the field is left, the next selection change switches.
    await app.pieces().first().focus();
    await expect.poll(() => tabs(app)).toMatchObject({ selected: 'piece' });
  });

  for (const [width, height] of [
    [1024, 768],
    [390, 844],
  ]) {
    test.describe(`at ${width} px`, () => {
      test.use({ viewport: { width, height } });

      test('Propiedades opens on the contextual tab, switches to Proyecto, has touch-sized tabs; H and M open it with the focus on the tab, Tab reaches the first field and Esc goes back to the piece', async ({ app, page }) => {
        const narrow = width < 800;
        const props = page.locator('#props-panel');
        await app.addFiles(['small.jpg', 'square.webp']);
        await page.keyboard.press('Escape');
        const first = app.pieces().first();
        const id = Number(await first.getAttribute('data-id'));
        await first.focus();
        if (narrow) await page.locator('#props-toggle').click();
        await expect(page.locator('#props-tab-piece')).toBeVisible();
        await expect.poll(() => tabs(app)).toMatchObject({ selected: 'piece' });

        if (narrow) {
          await test.step('the sheet’s title opens the bottom sheet on Proyecto with the focus on the paper size; Esc closes it, back to the title', async () => {
            await page.keyboard.press('Escape');
            await first.focus();
            await page.locator('.page-label').first().click();
            await expect(props).toBeVisible();
            await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project', active: 'paper' });
            await page.keyboard.press('Escape');
            await expect(props).toBeHidden();
            await expect(page.locator('.page-label').first()).toBeFocused();
            await first.focus();
            if (!(await props.isVisible())) await page.locator('#props-toggle').click();
            await page.locator('#props-tab-piece').click();
          });
        }

        await page.locator('#props-tab-project').click();
        await expect(page.locator('#paper')).toBeVisible();
        await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project' });
        const tab = (await page.locator('#props-tab-project').boundingBox())!;
        expect(tab.height).toBeGreaterThanOrEqual(40);
        expect(tab.width).toBeGreaterThanOrEqual(40);
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

        if (narrow) {
          await page.locator('#props-tab-project').focus();
          await page.keyboard.press('Escape');
          await expect(props).toBeHidden();
        }
        await first.focus();
        await page.keyboard.press('h');
        await expect(props).toBeVisible();
        await expect.poll(() => tabs(app)).toMatchObject({ selected: 'project', active: 'props-tab-project' });
        await page.keyboard.press('m');
        await expect.poll(() => tabs(app)).toMatchObject({ selected: 'piece', active: 'props-tab-piece' });
        await page.keyboard.press('Tab');
        await expect(page.locator('#pos-x')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(app.piece(id)).toBeFocused();
        if (narrow) await expect(props).toBeHidden();
        else await expect(props).toBeVisible();
      });
    });
  }
});
