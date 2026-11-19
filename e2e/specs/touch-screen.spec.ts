// The editor on a touch screen (a coarse pointer), with what only a browser
// shows: every text field and select at 16 px at least, so iOS doesn't zoom
// the page into the one it focuses, with nothing overflowing at 390 px in any
// language, while a mouse keeps the sizes it had; «Propiedades» opens with the
// focus on its tab, not in a field (where it goes, with a mouse and with a
// finger: tests/components/panels.test.tsx); a double tap on a control isn't
// taken for a zoom, while the canvas keeps its own gestures (pinch-zoom.spec
// pinches them). Touch is emulated through
// Chromium's DevTools; on a real iPhone, Safari's own zoom still needs a look.
import type { Page } from '@playwright/test';
import { LANGUAGES } from '../../src/core/language.js';
import { readLayout } from '../support/accessibility.ts';
import { horizontalOverflow } from '../support/layout.ts';
import { expect, test, type App } from '../support/test.ts';

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true };

/** A browser of each language, as a person there would have it (as in languages.spec). */
const LOCALES: Readonly<Record<string, string>> = { es: 'es-419', en: 'en-US', 'zh-Hans': 'zh-CN', hi: 'hi-IN', fr: 'fr-FR' };

const coarse = (page: Page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches);

/**
 * The text fields and selects shown (the native ones and the app's own), by
 * id: their font size in px, whether their value fits without scrolling, and
 * whether they stay inside the window. Runs in the page.
 */
const readFields = () =>
  Object.fromEntries(
    [...document.querySelectorAll<HTMLInputElement>('input, select, textarea, .select-button')]
      .filter((el) => el.getClientRects().length && !el.closest('[hidden], dialog:not([open])') && !['checkbox', 'radio', 'range', 'color', 'file'].includes(el.type))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return [el.id || el.className, { size: parseFloat(getComputedStyle(el).fontSize), fits: el.scrollWidth <= el.clientWidth + 1, inside: r.left >= -0.5 && r.right <= innerWidth + 0.5 }];
      })
  );

type Fields = ReturnType<typeof readFields>;

/** Of `fields`, those under 16 px. */
const small = (fields: Fields) => Object.entries(fields).filter(([, f]) => f.size < 16).map(([id, f]) => `${id} ${f.size}px`);

/**
 * The boxes a finger aims at, in CSS px: a project card's actions, the
 * dialog's close button and «Nuevo proyecto»; the advice before printing's
 * buttons and its «No volver a mostrar» row (with its box and text). Opens
 * and closes «Proyectos» and the advice (turned on for it).
 */
async function readTargets(app: App) {
  const { page } = app;
  const size = async (selector: string) => {
    const box = (await page.locator(selector).first().boundingBox())!;
    return [Math.round(box.width), Math.round(box.height)];
  };
  await page.locator('#projects-open').click();
  await expect(page.locator('#projects')).toHaveAttribute('open', '');
  const projects = {
    duplicate: await size('#projects .project-card [data-act="duplicate"]'),
    rename: await size('#projects .project-card [data-act="rename"]'),
    delete: await size('#projects .project-card [data-act="delete"]'),
    close: await size('#projects-close'),
    create: (await size('#project-new'))[1],
  };
  await page.keyboard.press('Escape');
  await expect(page.locator('#projects')).not.toHaveAttribute('open', '');
  await page.evaluate(() => localStorage.setItem('scooch:print-preferences', JSON.stringify({ v: 1, tip: true, summary: false })));
  await page.reload();
  await app.ready();
  await page.locator('#print').click();
  await expect(page.locator('#print-tip')).toHaveAttribute('open', '');
  const advice = {
    cancel: (await size('#print-tip-cancel'))[1],
    go: (await size('#print-tip-go'))[1],
    never: (await size('.print-tip-never'))[1],
    box: await size('#print-tip-never'),
    text: await page.locator('.print-tip-never span').evaluate((el) => getComputedStyle(el).fontSize),
  };
  await page.keyboard.press('Escape');
  return { projects, advice };
}

/** The height of each link at the foot of a page of the site, in CSS px (rounded). */
const readFooterLinks = () => [...new Set([...document.querySelectorAll('.site-footer a')].map((a) => Math.round(a.getBoundingClientRect().height)))];

/** A two-page PDF and an image, the PDF selected, its tab shown («Pieza»: position, size, scale, photo size, copies, page). */
async function pdfSelected(app: App) {
  await app.addFiles(['small.jpg', 'twopage.pdf']);
  await app.clickPiece(app.pieceNamed('twopage.pdf'));
  await app.openMeasures();
}

/** «Proyecto» with a custom paper and cut lines, their options open: every field of the tab shows. */
async function everyProjectField(app: App) {
  const { page } = app;
  await app.openSheet();
  await page.locator('#paper').selectOption('custom');
  await expect(page.locator('#paper-w')).toBeVisible();
  await app.openSetting('#cut-mode');
  await page.locator('#cut-mode input[value="corners"]').check();
  const options = page.locator('#cut-options');
  if (!(await options.evaluate((d: HTMLDetailsElement) => d.open))) await page.locator('#cut-options summary').click();
  await page.locator('#cut-colors input[value="custom"]').check();
  await expect(page.locator('#cut-hex')).toBeVisible();
}

test.describe('on a phone, with a finger', () => {
  test.use(PHONE);

  test('every text field and select is 16 px at least: the tabs, the top bar’s name, a project card’s name, the searches and Idioma', async ({ app, page }) => {
    test.skip(!(await coarse(page)), 'this engine doesn’t report a touch screen as a coarse pointer');
    await pdfSelected(app);
    const piece = await page.evaluate(readFields);
    expect(Object.keys(piece)).toEqual(expect.arrayContaining(['pos-x', 'pos-y', 'width', 'height', 'scale', 'photo-size', 'dup-count', 'page']));
    expect(small(piece), 'Pieza').toEqual([]);

    await everyProjectField(app);
    const project = await page.evaluate(readFields);
    expect(Object.keys(project)).toEqual(expect.arrayContaining(['paper', 'paper-w', 'paper-h', 'margin', 'gap', 'grid-size', 'cut-margin', 'cut-hex']));
    expect(small(project), 'Proyecto').toEqual([]);
    await app.closePopover();

    await page.locator('#project-name').tap();
    await expect(page.locator('#project-name-input')).toBeFocused();
    expect(small(await page.evaluate(readFields)), 'the top bar’s name').toEqual([]);
    await page.keyboard.press('Escape');

    await page.locator('#projects-open').tap();
    await page.locator('#projects .project-card [data-act="rename"]').first().tap();
    await expect(page.locator('#projects .project-title-input')).toBeFocused();
    expect(small(await page.evaluate(readFields)), 'a project card’s name').toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('#projects')).not.toHaveAttribute('open');

    for (const [open, dialog, field] of [
      [() => page.keyboard.press('?'), '#shortcuts', '#shortcuts-search'],
      [() => page.locator('#palette-open').tap(), '#palette', '#palette-input'],
      [() => page.locator('#prefs-open').tap(), '#prefs', '#language'],
    ] as const) {
      await open();
      await expect(page.locator(dialog)).toHaveAttribute('open', '');
      await expect(page.locator(field)).toBeVisible();
      expect(small(await page.evaluate(readFields)), dialog).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator(dialog)).not.toHaveAttribute('open', '');
    }
  });

  test('a project card being renamed keeps its size and its neighbors’ places', async ({ app, page }) => {
    test.skip(!(await coarse(page)), 'this engine doesn’t report a touch screen as a coarse pointer');
    await app.addFiles(['small.jpg']);
    await page.locator('#projects-open').tap();
    const card = page.locator('#projects .project-card').first();
    const meta = card.locator('.project-meta');
    // The card's top and height, and where the line under the name is.
    const places = async () => [await card.boundingBox(), await meta.boundingBox()].flatMap((box) => [box!.y, box!.height]);
    const before = await places();
    await card.locator('[data-act="rename"]').tap();
    await expect(card.locator('.project-title-input')).toBeFocused();
    const moved = (await places()).map((v, i) => Math.abs(v - before[i]));
    expect(Math.max(...moved), 'px moved').toBeLessThan(0.5);
  });

  test('«Propiedades» opens with the focus on its tab, not in a field that would bring up the on-screen keyboard', async ({ app, page }) => {
    test.skip(!(await coarse(page)), 'this engine doesn’t report a touch screen as a coarse pointer');
    await app.addFiles(['small.jpg']);
    await app.clickPiece(app.pieces().first());
    await page.locator('#props-toggle').tap();
    await expect(page.locator('#props-panel')).toBeVisible();
    await expect(page.locator('#props-tab-piece')).toBeFocused();
    await expect(page.locator('#pos-x')).toBeVisible();
  });

  test('a double tap on a control is two taps, not the page zooming: every control is touch-action: manipulation, and the canvas keeps its own gestures', async ({ app, page }) => {
    /** The controls shown whose double tap the browser could take for a zoom, and the canvas's own touch-action. Runs in the page. */
    const readTouchActions = () => {
      // A label is a control when it is the tap target of its checkbox or radio (not one around a field).
      const selector = 'a[href], button, input, label:has(> input[type="checkbox"], > input[type="radio"]), select, summary, textarea, [role="button"], [role="menuitem"], [role="option"], [role="tab"]';
      const controls = [...document.querySelectorAll<HTMLElement>(selector)].filter(
        (el) => el.getClientRects().length && !el.closest('[hidden], dialog:not([open])')
      );
      const action = (el: Element | null) => (el ? getComputedStyle(el).touchAction : null);
      return {
        count: controls.length,
        zoomable: controls.filter((el) => !['manipulation', 'none', 'pan-x pan-y'].includes(action(el)!)).map((el) => `${el.id || el.className} ${action(el)}`),
        stage: action(document.querySelector('.stage')),
        piece: action(document.querySelector('#sheets .piece')),
      };
    };
    await app.addFiles(['small.jpg', 'square.webp']);
    await app.clickPiece(app.pieces().first());
    await page.locator('#props-toggle').tap();
    await expect(page.locator('#props-panel')).toBeVisible();
    const shown = await page.evaluate(readTouchActions);
    expect(shown.count, 'controls found').toBeGreaterThan(30);
    expect(shown.zoomable).toEqual([]);
    expect([shown.stage, shown.piece], 'the canvas: its own pan and pinch, the pieces’ drag').toEqual(['pan-x pan-y', 'none']);
    await app.closePopover();
    await page.locator('#pieces-dock').tap();
    await expect(page.locator('#pieces-panel')).toBeVisible();
    expect((await page.evaluate(readTouchActions)).zoomable, 'with the pieces’ list').toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('#projects-open').tap();
    await expect(page.locator('#projects')).toHaveAttribute('open', '');
    expect((await page.evaluate(readTouchActions)).zoomable, 'in a dialog').toEqual([]);
  });

  test('a finger’s size, 44 px: a project card’s actions, the dialogs’ buttons, the «No volver a mostrar» row (its box and text as they were) and the links at the foot of the site', async ({ app, page }) => {
    test.skip(!(await coarse(page)), 'this engine doesn’t report a touch screen as a coarse pointer');
    await app.addFiles(['small.jpg']);
    const { projects, advice } = await readTargets(app);
    expect(projects).toEqual({ duplicate: [44, 44], rename: [44, 44], delete: [44, 44], close: [44, 44], create: 44 });
    expect(advice).toEqual({ cancel: 44, go: 44, never: 44, box: [15, 15], text: '13px' });
    await page.goto('./es/cuantas-fotos-caben-en-una-hoja');
    expect(await page.evaluate(readFooterLinks)).toEqual([44]);
  });

  test('a tap anywhere on a switch’s row toggles it once: on its text, between the text and the switch, and at the row’s edge', async ({ app, page }) => {
    await app.openSetting('#allow-rotate');
    const toggle = page.locator('#allow-rotate');
    const row = page.locator('.switch-row:has(#allow-rotate)');
    const r = (await row.boundingBox())!;
    const s = (await toggle.boundingBox())!;
    let on = await toggle.isChecked();
    for (const spot of [
      { x: r.x + 8, y: r.y + r.height / 2 },
      { x: r.x + r.width * 0.6, y: r.y + r.height / 2 },
      { x: s.x - 6, y: r.y + 2 },
    ]) {
      await page.touchscreen.tap(spot.x, spot.y);
      on = !on;
      await expect(toggle, `after a tap at ${Math.round(spot.x - r.x)}, ${Math.round(spot.y - r.y)} px in the row`).toBeChecked({ checked: on });
    }
  });

  test('the calculator’s fields on the site are 16 px at least', async ({ page }) => {
    await page.goto('./es/cuantas-fotos-caben-en-una-hoja');
    await page.locator('#calc-photo').selectOption('custom');
    const fields = await page.evaluate(readFields);
    expect(Object.keys(fields)).toEqual(expect.arrayContaining(['calc-paper', 'calc-photo', 'calc-w', 'calc-h', 'calc-margin']));
    expect(small(fields)).toEqual([]);
  });

  for (const language of LANGUAGES) {
    test.describe(`in ${language}`, () => {
      test.use({ locale: LOCALES[language] });

      test('at 390 px with 16 px fields nothing overflows: both tabs keep every field and its value inside, no text is cut and nothing scrolls sideways', async ({ app, page }) => {
        test.skip(!(await coarse(page)), 'this engine doesn’t report a touch screen as a coarse pointer');
        expect(await page.evaluate(() => document.documentElement.lang)).toBe(language);
        const check = async (screen: string) => {
          const fields = await page.evaluate(readFields);
          expect(small(fields), `${screen}: fields under 16 px`).toEqual([]);
          expect(Object.entries(fields).filter(([, f]) => !f.fits || !f.inside).map(([id]) => id), `${screen}: fields whose value doesn’t fit, or out of the window`).toEqual([]);
          const layout = await page.evaluate(readLayout);
          expect(layout.clipped, `${screen}: clipped text`).toEqual([]);
          expect(layout.overlapping, `${screen}: controls on top of each other`).toEqual([]);
          expect(await horizontalOverflow(page), `${screen}: sideways scroll`).toBeLessThanOrEqual(0);
        };
        await pdfSelected(app);
        await check('Pieza');
        await everyProjectField(app);
        await check('Proyecto');
      });
    });
  }
});

test.describe('a phone with a notch', () => {
  /** The phone's safe areas, through Chromium's DevTools (as an iPhone gives them, in CSS px). */
  async function notch(page: Page, insets: { top: number; left: number; right: number; bottom: number }) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
  }

  /** The controls, panels and dialogs shown that reach into the safe areas `insets` keeps clear (px). Runs in the page. */
  const readUnsafe = (insets: { top: number; left: number; right: number }) =>
    [...document.querySelectorAll<HTMLElement>('.topbar :is(button, input, .brand-mark), .rail button, .panel :is(button, input, select), .dock-btn, dialog[open]')]
      .filter((el) => el.getClientRects().length && !el.closest('[hidden]'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.left < insets.left - 0.5 || r.right > innerWidth - insets.right + 0.5 || r.top < insets.top - 0.5)
      .map(({ el, r }) => `${el.id || el.className} ${Math.round(r.left)}–${Math.round(r.right)} × ${Math.round(r.top)}`);

  // A notch, and a Dynamic Island (wider sides), as iPhones report them in landscape.
  for (const [width, height, side] of [
    [844, 390, 47],
    [852, 393, 59],
  ]) {
    test.describe(`in landscape at ${width} px, ${side} px on each side`, () => {
      test.use({ viewport: { width, height }, hasTouch: true });

      test('the top bar’s controls, the rail, Propiedades and a dialog keep out of the sides of the notch', async ({ app, page, browserName }) => {
        test.skip(browserName !== 'chromium', 'the safe areas are emulated through Chromium’s DevTools');
        const insets = { top: 0, left: side, right: side, bottom: 21 };
        await notch(page, insets);
        await app.addFiles(['small.jpg']);
        await app.clickPiece(app.pieces().first());
        await expect(page.locator('#props-panel #pos-x')).toBeVisible();
        await expect.poll(() => page.evaluate(readUnsafe, insets)).toEqual([]);
        await page.locator('#projects-open').tap();
        await expect(page.locator('#projects')).toHaveAttribute('open', '');
        expect(await page.evaluate(readUnsafe, insets)).toEqual([]);
      });
    });
  }

  test.describe('in portrait, under a status bar', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('the top bar’s controls keep below it, and Propiedades and the dock beside the edges', async ({ app, page, browserName }) => {
      test.skip(browserName !== 'chromium', 'the safe areas are emulated through Chromium’s DevTools');
      // An app added to the home screen: its page starts under the status bar.
      const insets = { top: 47, left: 0, right: 0, bottom: 34 };
      await notch(page, insets);
      await app.addFiles(['small.jpg']);
      await expect.poll(() => page.evaluate(readUnsafe, insets)).toEqual([]);
      await page.locator('#props-toggle').tap();
      await expect(page.locator('#props-panel')).toBeVisible();
      expect(await page.evaluate(readUnsafe, insets)).toEqual([]);
    });
  });
});

test.describe('with a mouse', () => {
  test('the targets look as they did: a project card’s actions 32 px, the dialogs’ buttons 36 px, the «No volver a mostrar» row 40 px, the site’s links their line', async ({ app, page }) => {
    await app.addFiles(['small.jpg']);
    const { projects, advice } = await readTargets(app);
    expect(projects).toEqual({ duplicate: [32, 32], rename: [32, 32], delete: [32, 32], close: [36, 36], create: 36 });
    expect(advice).toEqual({ cancel: 36, go: 36, never: 40, box: [15, 15], text: '13px' });
    await page.goto('./es/cuantas-fotos-caben-en-una-hoja');
    expect((await page.evaluate(readFooterLinks)).every((h) => h < 30)).toBe(true);
  });

  test('the fields keep their sizes: 13.5 px, 14 px in the shortcuts’ search', async ({ app, page }) => {
    await pdfSelected(app);
    const piece = await page.evaluate(readFields);
    expect([piece['pos-x'].size, piece['scale'].size, piece['photo-size'].size, piece['page'].size]).toEqual([13.5, 13.5, 13.5, 13.5]);
    await app.openSheet();
    expect((await page.evaluate(readFields))['paper'].size).toBe(13.5);
    await page.locator('#help').click();
    await expect(page.locator('#shortcuts-search')).toBeVisible();
    expect((await page.evaluate(readFields))['shortcuts-search'].size).toBe(14);
  });
});
