// axe, at 1440, 1024, 390 and 2560 px, light and dark, in the states of the canvas tools and the
// properties tabs: crop mode, the photo size select, the cut line options with the color picker, the
// piece's and the sheet's context menus, the zoom menu, the Pieza tab with a group, the Hoja tab
// focused with H and the new-sheet placeholder mid-drag. Screenshots of them (1440, 1024 and 390) in
// e2e/out/tool-states/.
const { AxeBuilder } = require('@axe-core/playwright');
const { open, makeChecker, addFiles, lib, cards, OUT, path, fs } = require('../lib/selection.cjs');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const SHOTS = path.join(OUT, 'tool-states');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const { check, report } = makeChecker('Canvas tools and properties tabs: axe and screenshots');
  const errors = [];
  const results = [];
  for (const colorScheme of ['light', 'dark']) {
    for (const [w, h] of [[1440, 900], [1024, 768], [390, 844], [2560, 1440]]) {
      const tag = `${colorScheme} ${w}`;
      const s = await open({ colorScheme, viewport: { width: w, height: h } });
      const p = s.page;
      const L = lib(p);
      const narrow = w < 800;
      const scan = async (label) => {
        await p.waitForTimeout(120);
        const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
        const bad = r.violations.map((v) => `${v.impact}:${v.id} ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`);
        results.push({ label: `${tag} ${label}`, bad });
      };
      const shot = async (name) => {
        if (w === 2560) return;
        await p.waitForTimeout(150);
        await p.screenshot({ path: path.join(SHOTS, `${w}x${h}-${colorScheme}-${name}.png`) });
      };
      const props = async (tab) => {
        if (narrow && !(await p.locator('#props-panel').isVisible())) await p.click('#props-toggle');
        await p.click(`#props-tab-${tab}`);
      };
      const closeProps = async () => {
        if (narrow && (await p.locator('#props-panel.is-open').count())) {
          await p.locator(`#props-tab-piece`).focus();
          await p.keyboard.press('Escape');
        }
      };

      await addFiles(p, cards(0, 12));
      const ids = await L.ids();

      // The zoom menu.
      await p.click('#zoom-level');
      await p.waitForSelector('#zoom-menu');
      await scan('zoom menu');
      await shot('zoom-menu');
      await p.click('#zoom-menu-fit');

      // Pieza with a group (on one sheet) and the tabs.
      await p.keyboard.press('Escape');
      await L.piece(ids[0]).click({ force: true });
      for (const id of [ids[2], ids[3]]) await L.piece(id).click({ modifiers: ['Control'], force: true });
      await props('piece');
      await scan('Pieza tab with a group');
      await shot('pieza-grupo');
      await p.locator('#sheets .piece.is-selected').first().focus();
      await p.keyboard.press('h');
      await scan('Hoja tab focused with H');
      await closeProps();

      // The photo size select.
      await p.keyboard.press('Escape');
      await L.piece(ids[4]).focus();
      await props('piece');
      await p.locator('#photo-size').focus();
      await scan('photo size select');
      await shot('tamano');
      await p.selectOption('#photo-size', '10x15');
      await closeProps();

      // Crop mode.
      await L.piece(ids[4]).focus();
      await p.keyboard.press('k');
      await p.waitForSelector('#crop-frame');
      await scan('crop mode');
      await shot('recorte');
      await p.keyboard.press('Escape');
      await p.keyboard.press('Control+z');

      // The cut lines with every option and the color picker.
      await p.keyboard.press('Escape');
      await props('sheet');
      await p.click('#cut-mode input[value="corners"]', { force: true });
      await p.evaluate(() => (document.getElementById('cut-options').open = true));
      await p.click('#cut-colors input[value="custom"]', { force: true });
      await p.locator('#cut-options').scrollIntoViewIfNeeded();
      await scan('cut line options with the color picker');
      await shot('lineas-de-corte');
      await closeProps();

      // Context menus.
      await L.piece(ids[5]).focus();
      await p.waitForTimeout(150);
      await p.keyboard.press('Shift+F10');
      await p.waitForSelector('#context-menu');
      await scan('piece context menu');
      await shot('menu-pieza');
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
      await p.locator('.page .sheet').first().focus();
      await p.waitForTimeout(150);
      await p.keyboard.press('Shift+F10');
      await p.waitForSelector('#context-menu');
      await scan('sheet context menu');
      await p.keyboard.press('Escape');

      // The new-sheet placeholder, mid-drag.
      const last = (await L.geom()).pieces.filter((x) => x.sheetIndex === 1)[0].id;
      await L.piece(last).evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const b = await L.piece(last).boundingBox();
      const stage = await p.locator('#stage').boundingBox();
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await p.mouse.down();
      await p.mouse.move(b.x + b.width / 2 + 5, b.y + b.height / 2 + 5, { steps: 2 });
      for (let i = 0; i < 300; i++) {
        const bottom = await p.evaluate(() => [...document.querySelectorAll('#sheets .sheet-box')].at(-1).getBoundingClientRect().bottom);
        if (bottom < stage.y + stage.height - 200) break;
        await p.mouse.move(b.x + b.width / 2, stage.y + stage.height - 6);
        await p.waitForTimeout(16);
      }
      const bottom = await p.evaluate(() => [...document.querySelectorAll('#sheets .sheet-box')].at(-1).getBoundingClientRect().bottom);
      await p.mouse.move(b.x + b.width / 2, bottom + 100, { steps: 5 });
      check(`${tag}: the new-sheet placeholder shows mid-drag`, await p.evaluate(() => !document.getElementById('new-sheet-end').hidden));
      await scan('new-sheet placeholder');
      await shot('hoja-nueva');
      await p.keyboard.press('Escape');
      await p.mouse.up();

      errors.push(...s.errors);
      await s.browser.close();
    }
  }
  for (const r of results) check(`axe: ${r.label}`, r.bad.length === 0, r.bad.join(' | '));
  check('no console errors', errors.length === 0, errors.join(' | '));
  console.log(`\n${results.length} estados`);
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
