// Accessibility and layout of every UI state, in one catalogue. Each flow
// reaches its states like a person would (clicks, keys, files) at every
// viewport where they were checked before (plus a few where the layout
// changes), and every state is checked once in light and once in dark (the
// same page, switched with emulateMedia): axe (WCAG 2.0/2.1 A and AA plus best
// practices) with no violations, no text clipped without an ellipsis, no
// one-line control wrapped, no controls covering each other, no horizontal
// scroll, enough contrast inside modal dialogs. Screenshots of each state (up
// to 1440 px) are attached to the report. See e2e/support/accessibility.ts.
import type { Locator, Page } from '@playwright/test';
import { App, cards, expect, norm, test } from '../support/test.ts';
import { Catalogue, DESKTOP, MEDIUM, PHONE, SCHEMES, WIDE, axeSummary, readLayout, scan, sizeTitle, type Size } from '../support/accessibility.ts';
import { holdApp, skeletonShown } from '../support/boot.ts';

const LONG_NAME = 'Tarjetas de cumpleaños de la abuela Marta (versión final)';

interface FlowOptions {
  /** The query string the app opens with. */
  query?: string;
  /** Runs before the app loads (e.g. an init script). */
  before?: (page: Page) => Promise<unknown>;
  /** The advice before printing and the summary after show (off elsewhere: see App.printing). */
  printing?: boolean;
  /** Usage tips show (off elsewhere: see App.tips). */
  tips?: boolean;
}

/** One test per viewport, each with its own page at that size and the app opened. */
function flow(title: string, sizes: readonly Size[], run: (c: Catalogue, app: App) => Promise<void>, options: FlowOptions = {}) {
  test.describe(title, () => {
    for (const size of sizes)
      test.describe(() => {
        test.use({ viewport: size });
        test(sizeTitle(size), async ({ page }, testInfo) => {
          await options.before?.(page);
          const app = new App(page, testInfo);
          app.printing = !!options.printing;
          app.tips = !!options.tips;
          await app.open(options.query);
          const c = new Catalogue(app, testInfo, size);
          await run(c, app);
          testInfo.annotations.push({ type: 'scans', description: String(c.scans) });
        });
      });
  });
}

// ---------- Helpers that act like a person ----------

const saved = (page: Page) => expect(page.locator('#project')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });

async function openDialog(page: Page, opener: string, dialog: string) {
  await page.locator(opener).click();
  await expect(page.locator(`${dialog}[open]`)).toBeVisible();
}

async function closeWithEscape(page: Page, dialog: string) {
  await page.keyboard.press('Escape');
  await expect(page.locator(`${dialog}[open]`)).toHaveCount(0);
}

/** On phones, the properties panel is a bottom sheet: opens it if it is closed. */
async function openProps(c: Catalogue) {
  if (c.narrow && !(await c.page.locator('#props-panel.is-open').count())) await c.page.locator('#props-toggle').click();
  if (c.narrow) await expect(c.page.locator('#props-panel.is-open')).toBeVisible();
}

/** On phones, closes the properties sheet with its close button. */
async function closeProps(c: Catalogue) {
  if (!c.narrow || !(await c.page.locator('#props-panel.is-open').count())) return;
  await c.page.locator('#props-panel [data-close-panel]').click();
  await expect(c.page.locator('#props-panel.is-open')).toHaveCount(0);
}

/** Opens the pieces list where it isn't a column: the drawer (medium) or the bottom sheet (phones). */
async function openList(c: Catalogue) {
  if (!c.listHidden) return;
  await c.page.locator(c.narrow ? '#pieces-dock' : '#pieces-toggle').click();
  await expect(c.page.locator('#pieces-panel.is-open')).toBeVisible();
}

async function closeList(c: Catalogue) {
  if (!(await c.page.locator('#pieces-panel.is-open').count())) return;
  await c.page.keyboard.press('Escape');
  await expect(c.page.locator('#pieces-panel.is-open')).toHaveCount(0);
}

/** Focuses a piece and waits until it has the focus and the selection. */
async function focusPiece(piece: Locator) {
  await piece.focus();
  await expect(piece).toBeFocused();
  await expect(piece).toHaveClass(/\bis-selected\b/);
}

// ---------- Editing ----------

flow('editing', [DESKTOP, MEDIUM, PHONE], async (c, app) => {
  const page = c.page;
  await c.state('empty');
  await app.addFiles(['big.png', 'small.jpg', 'square.webp', 'twopage.pdf']);
  await page.keyboard.press('Escape');
  await expect.poll(() => app.selectedIds()).toEqual([]);
  await c.state('pieces without a selection');
  const small = app.pieceNamed('small.jpg');
  await focusPiece(small);
  await c.state('a piece selected, with its toolbar');
  if (c.width === MEDIUM.width) {
    await page.locator('#pieces-toggle').click();
    await expect(page.locator('#pieces-panel.is-open')).toBeVisible();
    await c.state('pieces panel over the canvas');
    await closeList(c);
  }
  if (c.narrow) {
    await page.locator('#props-toggle').click();
    await expect(page.locator('#props-panel.is-open')).toBeVisible();
    await c.state('properties in the bottom sheet');
  }
  if (c.width !== DESKTOP.width) return;

  const title = page.locator('.page-label').first();
  await title.focus();
  await expect(page.locator('#tooltip')).toBeVisible();
  await c.state('sheet title focused, with its tooltip');

  await focusPiece(small);
  await app.setMeasure('scale', 400);
  await app.setMeasure('pos-x', -5);
  await page.locator('#fill-details summary').click();
  await expect(page.locator('#fill-details')).toHaveAttribute('open', '');
  await expect(page.locator('#pill')).toBeVisible();
  await c.state('notices, badges and «Rellenar» open');

  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await app.showTab('project');
  const arrange = page.locator('[aria-controls="section-arrange"]');
  await arrange.click();
  await expect(arrange).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#grid-show').click();
  await expect(page.locator('#sheets .grid-layer').first()).toBeVisible();
  await c.state('a section folded and the grid showing');

  await focusPiece(small);
  await page.keyboard.press('Enter');
  await expect(page.locator('#piecebar button').first()).toBeFocused();
  await expect(page.locator('#tooltip')).toBeVisible();
  await c.state('tooltip of the focused toolbar button');
});

// ---------- Printing: the advice before, the summary after ----------

// With a donation link, and 8 sheets saved before: printing 12 cards on 2 sheets reaches 10.
flow(
  'printing',
  [DESKTOP, MEDIUM, PHONE, WIDE],
  async (c, app) => {
    const page = c.page;
    await app.addFiles(cards(0, 12));
    await openDialog(page, '#export', '#print-tip');
    await c.state('advice before downloading');
    await closeWithEscape(page, '#print-tip');
    // Printing without a PDF viewer opens another tab: blocked here, so it downloads instead.
    await page.evaluate(() => (window.open = () => null));
    await openDialog(page, '#print', '#print-tip');
    await c.state('advice before printing');
    await Promise.all([page.waitForEvent('download'), page.locator('#print-tip-go').click()]);
    await expect(page.locator('#print-summary[open] #summary-donate')).toBeVisible();
    await expect(page.locator('#print-summary .summary-milestone')).toBeVisible();
    await c.state('summary dialog after printing: a milestone and the request for a donation');
  },
  {
    printing: true,
    query: `?donar=${encodeURIComponent('https://www.patreon.com/ejemplo')}`,
    before: (page) => page.addInitScript(() => localStorage.getItem('scooch:savings') ?? localStorage.setItem('scooch:savings', JSON.stringify({ v: 1, sheets: 8, turn: 0 }))),
  }
);

// Two cards, each alone on a sheet: arranged they'd take one.
flow(
  'summary suggesting a fuller arrangement',
  [DESKTOP, PHONE],
  async (c, app) => {
    const page = c.page;
    await app.addFiles(cards(0, 2));
    await focusPiece(app.pieces().last());
    await page.keyboard.press('Shift+PageDown');
    await expect(page.locator('#sheets .page')).toHaveCount(2);
    await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    await expect(page.locator('#print-summary[open] #summary-suggest')).toBeVisible();
    await c.state('summary dialog after downloading, suggesting «Acomodar»');
  },
  { printing: true, before: (page) => page.addInitScript(() => localStorage.setItem('scooch:print-preferences', JSON.stringify({ v: 1, tip: false, summary: true }))) }
);

// ---------- A usage tip ----------

// One piece duplicated three times with its toolbar: the tip about «Duplicar ×N», with its button.
flow(
  'usage tip',
  [DESKTOP, MEDIUM, PHONE, WIDE],
  async (c, app) => {
    const page = c.page;
    await app.addFiles(cards(0, 1));
    await focusPiece(app.pieces().first());
    for (let n = 2; n <= 4; n++) {
      await page.locator('#piecebar [data-action="duplicate"]').click();
      await expect(app.pieces()).toHaveCount(n);
    }
    await expect(page.locator('#usage-tip')).toBeVisible();
    await c.state('a usage tip in the notice area, with its buttons');
  },
  { tips: true }
);

// ---------- Dialogs over a document ----------

flow('preferences and shortcuts', [DESKTOP, MEDIUM, PHONE, WIDE], async (c, app) => {
  const page = c.page;
  await app.addFiles(cards(0, 4));
  await openDialog(page, '#prefs-open', '#prefs');
  await c.state('Preferences');
  await closeWithEscape(page, '#prefs');
  if (await page.locator('#help').isVisible()) await page.locator('#help').click();
  else await page.keyboard.press('Shift+Slash');
  await expect(page.locator('#shortcuts[open]')).toBeVisible();
  await c.state('shortcuts, with the link to Preferences');
  await page.locator('#shortcuts-search').fill('hoja');
  await expect(page.locator('#shortcuts-rows table')).toHaveCount(4);
  await c.state('shortcuts filtered by a search');
});

// ---------- The command palette ----------

flow('command palette', [DESKTOP, MEDIUM, PHONE, WIDE], async (c, app) => {
  const page = c.page;
  const shown = page.locator('#palette[open]');
  await app.addFiles(cards(0, 4));
  await page.locator('#palette-open').click();
  await expect(page.locator('#palette-input')).toBeFocused();
  await page.keyboard.type('acomodar');
  await page.keyboard.press('Enter');
  await expect(shown).toHaveCount(0);
  await page.locator('#palette-open').click();
  await expect(page.locator('#palette-group-0')).toHaveText('Recientes');
  await c.state('command palette: the recent command, then every command by section');
  await page.keyboard.type('rehacer');
  await expect(page.locator('#palette-option-redo')).toHaveAttribute('aria-disabled', 'true');
  await c.state('command palette: a search, with a command that can’t run and why');
  await page.locator('#palette-input').fill('papel');
  await page.keyboard.press('Enter');
  await expect(page.locator('#palette-step')).toHaveText('Cambiar el papel');
  await c.state('command palette: the paper’s choices, the one in use marked');
  await page.keyboard.type('xyzzy');
  await expect(page.locator('#palette-empty')).toHaveText('No hay opciones que coincidan con «xyzzy»');
  await c.state('command palette: nothing found');
  await page.keyboard.press('Escape');
  await expect(shown).toHaveCount(0);
});

// ---------- Multiple selection ----------

flow('multiple selection', [DESKTOP, MEDIUM, PHONE, WIDE], async (c, app) => {
  const page = c.page;
  await app.addFiles(cards(0, 4));
  const ids = await app.ids();

  await app.selectIds([ids[0]]);
  await openProps(c);
  await c.state('one piece: align to the usable area');
  // With the keyboard on an align button, the canvas shows where the piece would go.
  await page.locator('[data-align="left"]').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.preview-ghost')).toHaveCount(1);
  await c.state('the ghost of aligning, from the keyboard');
  await closeProps(c);

  await app.selectIds(ids.slice(0, 3));
  // Wider than a phone the group's panel is always there: one state.
  await c.state(c.narrow ? 'several selected: frames and toolbar' : 'several selected: frames, toolbar and group panel');
  if (c.narrow) {
    await openProps(c);
    await c.state('group panel');
  }
  await openProps(c);
  await page.locator('#distribute-mode input[value="even"]').check({ force: true });
  await app.selectIds(ids.slice(0, 2));
  await openProps(c);
  await c.state('distribute disabled, with the reason');
  await page.locator('#distribute-mode input[value="gap"]').check({ force: true });
  await closeProps(c);

  // The first two share a row: aligning them on the other axis would put one on the other.
  const [a, b] = (await app.geometry()).pieces;
  await app.selectIds([a.id, b.id]);
  await openProps(c);
  await page.locator(Math.abs(a.y - b.y) < 1 ? '[data-align="left"]' : '[data-align="top"]').click();
  await closeProps(c);
  await expect(page.locator('#pill-action')).toBeVisible();
  await c.state('alignment refused, with «Permitir superposición»');

  await openList(c);
  await c.state('piece list with several selected');
  if (c.listHidden) await closeList(c);

  // On two sheets: X, Y, width and height off, in place, the reason in the focused one's tooltip.
  // (The notice of the refused alignment is closed: it isn't what this state is about.)
  await page.locator('#pill-close').click();
  await expect(page.locator('#pill')).toBeHidden();
  await page.locator('#add-sheet').click();
  await app.addFiles(cards(4, 1));
  await app.selectIds([ids[0], (await app.ids()).at(-1)!]);
  await openProps(c);
  await expect(page.locator('#piece-title')).toHaveText('2 piezas en 2 hojas');
  await page.locator('#pos-y').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#pos-x')).toBeFocused();
  await expect(page.locator('#tooltip .tip-note')).toHaveText('Disponible cuando las piezas están en una misma hoja');
  await c.state('several selected on two sheets: the measures off, with the reason');
});

// ---------- Sheets ----------

flow('sheets', [DESKTOP, MEDIUM, PHONE], async (c, app) => {
  const page = c.page;
  await app.addFiles([...cards(0, 12), 'twopage.pdf', 'big.png']);
  // They went to two sheets, and a notice says so: closed, it isn't what these states are about.
  await page.locator('#pill-close').click();
  await expect(page.locator('#pill')).toBeHidden();
  await page.locator('#project-name').click();
  await page.locator('#project-name-input').fill(LONG_NAME);
  await page.keyboard.press('Enter');
  await expect(page.locator('#project-name')).toHaveText(LONG_NAME);
  const secondSheet = page.locator('#sheets .page').nth(1);
  await focusPiece(secondSheet.locator('.piece').first());
  const stage = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.mouse.wheel(0, -120);
  await c.state('several sheets, a piece on the second one selected');

  if (c.listHidden) {
    await openList(c);
    await c.state('piece list grouped by sheet');
    await closeList(c);
  }

  // A piece moved off its sheet (shows cut off, with its frame and toolbar) and the notice naming the sheet.
  await focusPiece(secondSheet.locator('.piece').first());
  await app.setMeasure('pos-x', 180);
  await app.closePopover();
  await closeProps(c);
  await focusPiece(secondSheet.locator('.piece').first());
  await expect(page.locator('#pill')).toBeVisible();
  await c.state('piece off the sheet, the notice naming its sheet');
  await page.keyboard.press('Control+z');

  // Dragging the first sheet's rightmost piece past its right edge, with the grid on.
  await page.keyboard.press('g');
  await expect(page.locator('#sheets .grid-layer').first()).toBeVisible();
  const rightmost = await page.evaluate(
    () => [...document.querySelectorAll<HTMLElement>('#sheets .page')[0].querySelectorAll<HTMLElement>('.piece')].sort((p, q) => q.getBoundingClientRect().right - p.getBoundingClientRect().right)[0].dataset.id
  );
  const piece = app.piece(Number(rightmost));
  await piece.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const before = await app.snapshot();
  const box = (await piece.boundingBox())!;
  const sheet = (await page.locator('#sheets .page').first().locator('.sheet').boundingBox())!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const to = sheet.x + sheet.width + 200;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + ((to - from.x) * i) / 12, from.y);
  await expect(piece).toHaveClass(/\bis-dragging\b|\bis-selected\b/);
  await c.state('dragging a piece past the sheet’s right edge', { keepPointer: true });
  await page.mouse.up();
  await c.state('piece dropped past the sheet’s edge');
  // Wherever it ended up, back to how it was (a piece that went back to its place left no step).
  if ((await app.snapshot()) !== before) await page.keyboard.press('Control+z');
  await expect.poll(() => app.snapshot()).toBe(before);
  await page.keyboard.press('g');
  await expect(page.locator('#sheets .grid-layer').first()).toBeHidden();

  const remove = secondSheet.locator('.page-remove');
  const sheetsBefore = await page.locator('#sheets .page').count();
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pill-action')).toHaveText('Deshacer');
  await c.state('a sheet removed with its pieces, «Deshacer» in the notice');
  await page.locator('#pill-action').click();
  await expect(page.locator('#sheets .page')).toHaveCount(sheetsBefore);

  await openList(c);
  await page.locator('#clear').click();
  await expect(page.locator('#confirm[open]')).toBeVisible();
  await c.state('confirm removing every piece');
  await closeWithEscape(page, '#confirm');
  await closeList(c);

  // The end of the canvas, with «add a sheet».
  await focusPiece(app.pieces().first());
  await page.keyboard.press('Escape');
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await page.mouse.wheel(0, 100_000);
  await expect(page.locator('#add-sheet')).toBeInViewport();
  await c.state('end of the canvas, with «add a sheet»');

  await app.openSheet();
  await page.locator('#paper').selectOption('custom');
  await page.locator('#paper-w').fill('5');
  await expect(page.locator('#paper-w')).toHaveAttribute('aria-invalid', 'true');
  await c.state('custom paper with an error');
});

// ---------- Projects ----------

flow('projects', [DESKTOP, MEDIUM, PHONE], async (c, app) => {
  const page = c.page;
  await openDialog(page, '#projects-open', '#projects');
  await c.state('projects dialog with one empty project');
  await closeWithEscape(page, '#projects');

  await app.addFiles(cards(0, 12));
  await page.locator('#project-name').click();
  await page.locator('#project-name-input').fill(LONG_NAME);
  await page.keyboard.press('Enter');
  await saved(page);
  const newProject = async () => {
    await openDialog(page, '#projects-open', '#projects');
    await page.locator('#project-new').click();
    await expect(app.pieces()).toHaveCount(0);
    await saved(page);
  };
  await newProject();
  await app.addFiles(['small.jpg', 'square.webp', 'tall.png']);
  await saved(page);
  await newProject();
  await openDialog(page, '#projects-open', '#projects');
  const cardsShown = page.locator('#projects .project-card');
  await expect(cardsShown).toHaveCount(3);
  await c.state('projects dialog with three projects');

  await cardsShown.nth(1).locator('[data-act="rename"]').click();
  await expect(cardsShown.nth(1).locator('input')).toBeFocused();
  await c.state('renaming a project in its card');
  await page.keyboard.press('Escape');
  await expect(cardsShown.nth(1).locator('input')).toHaveCount(0);

  await cardsShown.nth(1).locator('[data-act="delete"]').click();
  await expect(page.locator('#confirm[open]')).toBeVisible();
  await c.state('confirm deleting a project');
  await closeWithEscape(page, '#confirm');
  await closeWithEscape(page, '#projects');

  await page.locator('#project-name').click();
  await expect(page.locator('#project-name-input')).toBeFocused();
  await c.state('project name being edited in the top bar');
});

// The browser says the space is nearly full.
flow(
  'projects with little space left',
  [DESKTOP, PHONE],
  async (c) => {
    await openDialog(c.page, '#projects-open', '#projects');
    await expect(c.page.locator('#storage-low')).toBeVisible();
    await c.state('projects dialog warning that space is running out');
  },
  {
    before: (page) =>
      page.addInitScript(() => {
        const estimate = async () => ({ usage: 8.6e9, quota: 1e10 });
        // Playwright's WebKit has no navigator.storage (Safari has).
        if (navigator.storage) Object.defineProperty(navigator.storage, 'estimate', { value: estimate, configurable: true });
        else Object.defineProperty(navigator, 'storage', { value: { estimate }, configurable: true });
      }),
  }
);

flow(
  'without storage',
  [DESKTOP, PHONE],
  async (c) => {
    await expect(c.page.locator('#pill')).toBeVisible();
    await c.state('the notice that projects can’t be saved');
    await openDialog(c.page, '#projects-open', '#projects');
    await c.state('projects dialog without storage');
  },
  { before: (page) => page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })) }
);

// ---------- Canvas tools ----------

flow('zoom and canvas menus', [DESKTOP, MEDIUM, PHONE, WIDE], async (c, app) => {
  const page = c.page;
  await app.addFiles(cards(0, 12));
  const ids = await app.ids();

  // Two pieces on top of each other (the notice shows), then 400 %.
  await focusPiece(app.piece(ids[1]));
  await app.setMeasure('pos-x', '20');
  await app.setMeasure('pos-y', '20');
  if (c.narrow) {
    await page.locator('#props-tab-piece').focus();
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#pill')).toBeVisible();
  await page.locator('#zoom-level').click();
  await page.locator('#zoom-menu-level-200').click();
  await page.locator('#zoom-in').click();
  await page.locator('#zoom-in').click();
  await expect(page.locator('#zoom-level')).toHaveText(/400/);
  await c.state('zoom control at 400 % with a notice');

  await page.locator('#zoom-level').click();
  await expect(page.locator('#zoom-menu')).toBeVisible();
  await c.state('zoom menu');
  await page.locator('#zoom-menu-fit').click();
  await expect(page.locator('#zoom-menu')).toHaveCount(0);

  await focusPiece(app.piece(ids[5]));
  await page.keyboard.press('Shift+F10');
  await expect(page.locator('#context-menu')).toBeVisible();
  await c.state('piece context menu');
  await page.keyboard.press('Escape');
  await expect(page.locator('#context-menu')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const sheet = page.locator('#sheets .page .sheet').first();
  await sheet.focus();
  await expect(sheet).toBeFocused();
  await page.keyboard.press('Shift+F10');
  await expect(page.locator('#context-menu')).toBeVisible();
  await c.state('sheet context menu');
  await page.keyboard.press('Escape');
  await expect(page.locator('#context-menu')).toHaveCount(0);

  // A piece of the second sheet held below the last sheet: the new-sheet placeholder shows.
  const onSecond = (await app.geometry()).pieces.find((p) => p.sheetIndex === 1)!.id;
  await app.piece(onSecond).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = (await app.piece(onSecond).boundingBox())!;
  const x = b.x + b.width / 2;
  await page.mouse.move(x, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(x + 5, b.y + b.height / 2 + 5, { steps: 2 });
  const stage = (await page.locator('#stage').boundingBox())!;
  const lastBottom = () => page.evaluate(() => [...document.querySelectorAll('#sheets .sheet-box')].at(-1)!.getBoundingClientRect().bottom);
  await expect
    .poll(
      async () => {
        await page.mouse.move(x, stage.y + stage.height - 6);
        return lastBottom();
      },
      { intervals: [16], timeout: 15_000, message: 'the last sheet’s bottom scrolls into view' }
    )
    .toBeLessThan(stage.y + stage.height - 200);
  await page.mouse.move(x, (await lastBottom()) + 100, { steps: 5 });
  await expect(page.locator('#new-sheet-end')).toBeVisible();
  await c.state('new-sheet placeholder, mid-drag', { keepPointer: true });
  await expect(page.locator('#new-sheet-end'), 'the placeholder still shows after the scans').toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
});

flow('canvas tools in the properties panel', [DESKTOP, MEDIUM, PHONE, WIDE], async (c, app) => {
  const page = c.page;
  await app.addFiles(cards(0, 12));
  const ids = await app.ids();
  const tab = async (name: 'piece' | 'project') => {
    await openProps(c);
    await page.locator(`#props-tab-${name}`).click();
    await expect(page.locator(`#props-tab-${name}`)).toHaveAttribute('aria-selected', 'true');
  };
  const closeSheet = async () => {
    if (!c.narrow || !(await page.locator('#props-panel.is-open').count())) return;
    await page.locator('#props-tab-piece').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#props-panel.is-open')).toHaveCount(0);
  };

  await page.keyboard.press('Escape');
  await app.piece(ids[0]).click({ force: true });
  for (const id of [ids[2], ids[3]]) await app.piece(id).click({ modifiers: ['Control'], force: true });
  await expect.poll(() => app.selectedIds()).toEqual([ids[0], ids[2], ids[3]]);
  await tab('piece');
  await c.state('Pieza tab with a group');

  await page.locator('#sheets .piece.is-selected').first().focus();
  await page.keyboard.press('h');
  await expect(page.locator('#props-tab-project')).toBeFocused();
  await c.state('Proyecto tab focused with H');
  await closeSheet();

  await app.selectIds([ids[4]]);
  await focusPiece(app.piece(ids[4]));
  await tab('piece');
  await page.locator('#photo-size').focus();
  await c.state('photo size select');
  await page.locator('#photo-size').selectOption('10x15');
  await closeSheet();

  await focusPiece(app.piece(ids[4]));
  await page.keyboard.press('k');
  await expect(page.locator('#crop-frame')).toBeVisible();
  await c.state('crop mode');
  await page.keyboard.press('Escape');
  await expect(page.locator('#crop-frame')).toHaveCount(0);
  await page.keyboard.press('Control+z');

  await page.keyboard.press('Escape');
  await tab('project');
  await page.locator('#cut-mode input[value="corners"]').check({ force: true });
  const options = page.locator('#cut-options');
  if ((await options.getAttribute('open')) === null) await options.locator('summary').click();
  await expect(options).toHaveAttribute('open', '');
  await page.locator('#cut-colors input[value="custom"]').check({ force: true });
  await options.scrollIntoViewIfNeeded();
  await c.state('cut line options with the color picker');
});

// ---------- A field's limit ----------

flow('measurement field limit', [DESKTOP, PHONE], async (c, app) => {
  const page = c.page;
  await app.addFiles(cards(0, 5));
  await app.openSetting('#margin');
  await page.locator('#margin').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('21312');
  await expect(page.locator('#margin-limit')).toHaveText('Máximo 50 mm');
  await c.state('margin field showing its limit while typing');
});

// ---------- Before the app mounts ----------

// The skeleton index.html shows while the editor's script loads (held back
// here), loaded once in each theme: before the app runs, nothing follows a
// change of the system's theme.
test.describe('the skeleton before the app mounts', () => {
  for (const size of [DESKTOP, MEDIUM, PHONE])
    test.describe(() => {
      test.use({ viewport: size });
      test(`${sizeTitle(size)}: axe finds nothing in light and dark, and no text is clipped or scrolls sideways`, async ({ page, browserName }, testInfo) => {
        const release = await holdApp(page);
        for (const scheme of SCHEMES) {
          await page.emulateMedia({ colorScheme: scheme });
          await (scheme === SCHEMES[0] ? page.goto('./', { waitUntil: 'commit' }) : page.reload({ waitUntil: 'commit' }));
          await skeletonShown(page);
          await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
          const { violations } = await scan(page);
          expect.soft(axeSummary(violations), `axe violations, ${scheme}`).toEqual([]);
          const { clipped, overflowX } = await page.evaluate(readLayout);
          expect.soft({ clipped, overflowX }, `layout, ${scheme}`).toEqual({ clipped: [], overflowX: 0 });
          // In Chromium only: a screenshot waits for document.fonts.ready, which WebKit and Firefox resolve only once the document has loaded (never, with the script held).
          if (browserName === 'chromium') await testInfo.attach(`skeleton · ${size.width} px · ${scheme}`, { body: await page.screenshot(), contentType: 'image/png' });
        }
        release();
      });
    });
});

// ---------- The piece list's rows ----------

// The list's column goes from 14.25rem (up to about 1520 px wide) to 20rem
// (from about 2130 px). Whatever its width, each line of a row (the name, and
// the size with the page for a PDF) stays on one line, cut with «…» when it
// doesn't fit; the tooltip has both whole (and so does the accessible name:
// tests/components/PieceList.test.tsx).
test.describe('piece list rows', () => {
  test('a PDF page’s name and its size and page stay on one line each, cut with an ellipsis, at every width of the list', async ({ app, page }) => {
    await app.addFiles(['big.png', 'twopage.pdf']);
    const row = page.locator('#piece-list [role="option"]').filter({ hasText: 'pág. 1' });
    const dims = row.locator('.row-dims');
    await expect(dims).toBeVisible();
    const columns: number[] = [];
    for (let width = 1440; width <= 2200; width += 20) {
      await page.setViewportSize({ width, height: 900 });
      columns.push(Math.round((await page.locator('#pieces-panel').boundingBox())!.width));
      const { clipped, wrapped } = await page.evaluate(readLayout);
      expect([...clipped, ...wrapped].filter((f) => /^span\.row-(name|dims) /.test(f)), `with the list ${columns.at(-1)} px wide`).toEqual([]);
    }
    expect([Math.min(...columns), Math.max(...columns)], 'from the narrowest list to the widest').toEqual([228, 320]);

    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await dims.evaluate((el) => el.scrollWidth > el.clientWidth), 'cut where the list is narrowest').toBe(true);
    await row.hover();
    await expect(page.locator('#tooltip')).toBeVisible();
    expect(norm(await page.locator('#tooltip .tip-note').textContent())).toBe(norm(await dims.textContent()));
  });
});
