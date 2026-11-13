// Capturas de los estados nuevos: 3 anchos × claro y oscuro, con detector de textos cortados.
const { open, helpers, addFiles, path, fs, OUT } = require('../lib/sheets.cjs');
const DIR = path.resolve(OUT, process.env.SHOTS || 'shots');
fs.mkdirSync(DIR, { recursive: true });
const SIZES = (process.env.SIZES || '1440x900,1024x768,390x844').split(',').map((s) => s.split('x').map(Number));
const cards = (from, n) => Array.from({ length: n }, (_, i) => `card${String(from + i).padStart(2, '0')}.png`);

// Textos recortados sin «…» y controles de una línea partidos en dos.
const OVERFLOW = () => {
  const out = [];
  function* ancestors(el) { for (let a = el; a && a !== document.body; a = a.parentElement) yield a; }
  const hiddenish = (el) => !!el.closest('[hidden], dialog:not([open]), .sr-only') || [...ancestors(el)].some((a) => { const cs = getComputedStyle(a); return cs.clipPath !== 'none' || cs.visibility === 'hidden' || cs.display === 'none'; });
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && !hiddenish(el); };
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + [...el.classList].join('.')) + ' «' + el.textContent.trim().slice(0, 50) + '»';
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') || el.matches('svg, img, input, select, .sheet, .piece, .stage, .canvas, .panel, .piece-list, dialog, .dialog-body, .grid-layer, .thumb, body, .workspace')) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const ellipsis = cs.textOverflow === 'ellipsis';
    if (!ellipsis && (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1) out.push('recortado ' + name(el) + ` ${el.scrollWidth}>${el.clientWidth}`);
  }
  for (const el of document.querySelectorAll('.btn, .chip-btn, .dock-btn, .pill-action, .seg > span, .text-btn, kbd, .off-badge, .piecebar-size, .paper-label, .section-toggle, .panel-title, .field-label, .tip-line, .foot-count, .dock-count, legend, th, .row-dims, .page-label, .add-sheet, .project-status, .group-head, .projects-note, .project-badge')) {
    if (!visible(el)) continue;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const tops = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim() || hiddenish(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 1) tops.push(r.top + r.height / 2);
    }
    tops.sort((a, b) => a - b);
    let lines = tops.length ? 1 : 0;
    for (let i = 1; i < tops.length; i++) if (tops[i] - tops[i - 1] > 6) lines++;
    if (lines > 1) out.push(`partido en ${lines} líneas ${name(el)}`);
  }
  return [...new Set(out)];
};

(async () => {
  const report = [];
  for (const colorScheme of ['light', 'dark']) {
    for (const [w, hgt] of SIZES) {
      const s = await open({ colorScheme, viewport: { width: w, height: hgt } });
      const p = s.page;
      const h = helpers(p);
      const shot = async (name) => {
        await p.waitForTimeout(150);
        await p.screenshot({ path: path.join(DIR, `${w}x${hgt}-${colorScheme}-${name}.png`) });
        const issues = await p.evaluate(OVERFLOW);
        if (issues.length) report.push(`${w}x${hgt} ${colorScheme} ${name}:\n   ` + issues.join('\n   '));
      };
      await p.click('#projects-open');
      await p.waitForSelector('#projects[open]');
      await shot('1-proyectos-vacio');
      await p.keyboard.press('Escape');
      await addFiles(p, [...cards(0, 12), 'twopage.pdf', 'big.png']);
      await p.click('#project-name');
      await p.fill('#project-name-input', 'Tarjetas de cumpleaños de la abuela Marta (versión final)');
      await p.keyboard.press('Enter');
      await p.locator('.page').nth(1).locator('.piece').first().focus();
      await p.evaluate(() => document.getElementById('stage').scrollBy(0, -120));
      await p.mouse.move(2, hgt - 2);
      await shot('2-varias-hojas');
      if (w < 1100) {
        await p.click(w < 800 ? '#pieces-dock' : '#pieces-toggle');
        await shot('3-lista-agrupada');
        await p.keyboard.press('Escape');
      }
      // Pieza arrastrada afuera por la derecha, con la grilla visible (el caso del error reportado)
      await p.keyboard.press('g');
      // La pieza de la hoja 1 que está más a la derecha (a su derecha no hay otra).
      const pid = await p.evaluate(() => [...document.querySelectorAll('.page')[0].querySelectorAll('.piece')].sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0].dataset.id);
      const piece = p.locator(`#sheets .piece[data-id="${pid}"]`);
      await piece.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const b = await piece.boundingBox();
      const sh = await p.locator('.page').nth(0).locator('.sheet').boundingBox();
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await p.mouse.down();
      for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width / 2 + ((sh.x + sh.width + 200 - b.x - b.width / 2) * i) / 12, b.y + b.height / 2);
      await shot('3b-arrastrando-afuera');
      await p.mouse.up();
      await shot('3c-soltada-afuera');
      if (!(await p.evaluate(() => /volvió a su lugar/.test(document.getElementById('live-polite').textContent)))) await p.keyboard.press('Control+z');
      await p.keyboard.press('g');
      await p.locator('.page').nth(0).locator('.page-remove').focus();
      await p.keyboard.press('Enter');
      await p.waitForSelector('#confirm[open]');
      await shot('4-confirmar-quitar-hoja');
      await p.keyboard.press('Escape');
      await p.locator('#sheets .piece').first().focus();
      await p.keyboard.press('Escape');
      await p.evaluate(() => document.getElementById('stage').scrollTo(0, 99999));
      await p.mouse.move(2, hgt - 2);
      await shot('5-final-agregar-hoja');
      await h.openSheet();
      await p.selectOption('#paper', 'custom');
      await p.fill('#paper-w', '5');
      await shot('6-papel-personalizado-error');
      await p.fill('#paper-w', '210');
      await p.keyboard.press('Enter');
      await h.closePopover();
      if (w < 800 && (await p.locator('#props-panel.is-open').count())) await p.click('#props-toggle');
      await p.waitForTimeout(150);
      await p.click('#prefs-open');
      await p.waitForSelector('#prefs[open]');
      await shot('7-preferencias');
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });
      await p.click('#projects-open');
      await p.waitForSelector('#projects[open]');
      await p.click('#project-new');
      await p.waitForFunction(() => !document.querySelector('#sheets .piece') && document.getElementById('project-status-text').textContent === 'Guardado');
      await addFiles(p, ['small.jpg', 'square.webp', 'tall.png']);
      await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });
      await p.click('#projects-open');
      await p.waitForSelector('#projects[open]');
      await p.click('#project-new');
      await p.waitForFunction(() => !document.querySelector('#sheets .piece'));
      await p.click('#projects-open');
      await p.waitForSelector('#projects[open]');
      await p.waitForFunction(() => document.querySelectorAll('.project-card').length === 3);
      await p.mouse.move(2, 2);
      await shot('8-proyectos');
      await p.keyboard.press('Escape');
      await s.browser.close();
    }
  }
  fs.writeFileSync(path.join(DIR, 'report.txt'), report.join('\n') || 'sin problemas');
  console.log(report.join('\n') || 'sin textos cortados ni partidos');
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
