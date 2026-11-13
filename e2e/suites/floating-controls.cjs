// What floats over the canvas keeps its place, with classic scrollbars, at 1440, 1024, 390 and 2560
// px, light and dark: at the fitted zoom, 200 % and 400 % (both scrollbars) the zoom control stays off
// the stage's scrollbars, the notice, the panel buttons, the piece's toolbar and the first sheet's
// heading; the notice stays off the scrollbars; the zoom menu opens inside the window, off the
// control. axe in those states; screenshots in e2e/out/floating-controls/.
const { AxeBuilder } = require('@axe-core/playwright');
const { open, makeChecker, addFiles, lib, cards, OUT, path, fs } = require('../lib/selection.cjs');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const SHOTS = path.join(OUT, 'floating-controls');
fs.mkdirSync(SHOTS, { recursive: true });

// What floats over the stage against its scrollbars and the other floating things (window px).
const CHROME = () => {
  const rect = (el) => {
    if (!el || el.hidden || getComputedStyle(el).visibility === 'hidden' || getComputedStyle(el).display === 'none') return null;
    const b = el.getBoundingClientRect();
    return b.width && b.height ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
  };
  const stage = document.getElementById('stage');
  const s = stage.getBoundingClientRect();
  const right = stage.offsetWidth - stage.clientWidth;
  const bottom = stage.offsetHeight - stage.clientHeight;
  return {
    zoom: rect(document.querySelector('.zoom-control')),
    pill: rect(document.getElementById('pill')),
    bar: rect(document.getElementById('piecebar')),
    dock: [...document.querySelectorAll('.dock-btn')].map(rect).filter(Boolean),
    menu: rect(document.getElementById('zoom-menu')),
    gutters: [right ? { x: s.left + stage.clientWidth, y: s.top, w: right, h: s.height } : null, bottom ? { x: s.left, y: s.top + stage.clientHeight, w: s.width, h: bottom } : null].filter(Boolean),
    bars: { right, bottom },
    pct: Math.round(parseFloat(document.querySelector('#sheets .sheet-box').style.width) / 210 / (96 / 25.4) * 100),
    wide: stage.classList.contains('is-wide'),
    viewport: { w: innerWidth, h: innerHeight },
  };
};
const hit = (a, b) => !!a && !!b && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

(async () => {
  const { check, report } = makeChecker('Floating controls over the canvas');
  const errors = [];
  const results = [];
  for (const colorScheme of ['light', 'dark']) {
    for (const [w, h] of [[1440, 900], [1024, 768], [390, 844], [2560, 1440]]) {
      const tag = `${colorScheme} ${w}`;
      // Classic scrollbars (the headless shell hides them by default), as on Windows and Linux.
      const s = await open({ colorScheme, viewport: { width: w, height: h }, launch: { ignoreDefaultArgs: ['--hide-scrollbars'] } });
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

      // The zoom control at the fitted zoom, 200 % and 400 %, with a notice showing (an overlap).
      await L.piece(ids[1]).focus();
      await L.setMeasure('pos-x', '20');
      await L.setMeasure('pos-y', '20');
      await closeProps();
      await p.keyboard.press('Escape');
      for (const level of ['fit', 'level-200', 'level-400']) {
        if (level === 'level-200') {
          await p.click('#zoom-level');
          await p.click('#zoom-menu-level-200');
        } else if (level === 'level-400') {
          await p.click('#zoom-in');
          await p.click('#zoom-in');
        }
        await p.waitForTimeout(150);
        const c = await p.evaluate(CHROME);
        const problems = [];
        if (!c.zoom) problems.push('no zoom control');
        for (const g of c.gutters) if (hit(c.zoom, g)) problems.push('over a scrollbar');
        if (hit(c.zoom, c.pill)) problems.push('over the notice');
        if (c.pill) for (const g of c.gutters) if (hit(c.pill, g)) problems.push('the notice over a scrollbar');
        for (const d of c.dock) if (hit(c.zoom, d)) problems.push('over the panel buttons');
        if (level === 'fit') {
          const head = await p.evaluate(() => {
            document.getElementById('stage').scrollTop = 0;
            const b = document.querySelector('#sheets .page-head').getBoundingClientRect();
            return { x: b.x, y: b.y, w: b.width, h: b.height };
          });
          if (hit(c.zoom, head)) problems.push('over the first sheet’s heading');
        }
        if ((level === 'level-400' || c.wide) && !(c.bars.right && c.bars.bottom)) problems.push('(not both scrollbars to check)');
        check(`${tag} ${level}: the zoom control is off the scrollbars, the notice and the panel buttons`, problems.length === 0, `${problems.join(', ')} ${JSON.stringify(c)}`);
        await shot(`zoom-${level}`);
      }
      await scan('zoom control at 400 % with a notice');
      // With a piece selected (the toolbar, docked at the bottom on narrow screens).
      await L.piece(ids[0]).focus();
      await p.waitForTimeout(200);
      let c = await p.evaluate(CHROME);
      check(`${tag}: the zoom control is off the piece’s toolbar`, !hit(c.zoom, c.bar), JSON.stringify(c));
      await p.keyboard.press('Escape');
      await p.keyboard.press('Control+z');

      // The menu, inside the window.
      await p.click('#zoom-level');
      await p.waitForSelector('#zoom-menu');
      c = await p.evaluate(CHROME);
      check(`${tag}: the zoom menu opens inside the window, off the control`, c.menu && c.menu.x >= 0 && c.menu.y >= 0 && c.menu.x + c.menu.w <= c.viewport.w && c.menu.y + c.menu.h <= c.viewport.h && !hit(c.menu, c.zoom), JSON.stringify(c));
      await scan('zoom menu');
      await shot('zoom-menu');
      await p.click('#zoom-menu-fit');

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
