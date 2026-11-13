// axe-core en los estados de varias hojas y proyectos (varias hojas, proyectos vacío y con proyectos, preferencias,
// papel personalizado con error, confirmaciones, pieza fuera de la hoja), claro y oscuro, 3 anchos.
const { AxeBuilder } = require('@axe-core/playwright');
const { open, helpers, addFiles, OUT, path, fs } = require('../lib/sheets.cjs');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const cards = (from, n) => Array.from({ length: n }, (_, i) => `card${String(from + i).padStart(2, '0')}.png`);

async function scan(page, label, results) {
  await page.waitForTimeout(120);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of r.violations) byImpact[v.impact] = (byImpact[v.impact] ?? 0) + v.nodes.length;
  results.push({ label, byImpact, violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(0, 2).join(' ')) })) });
}

(async () => {
  const results = [];
  for (const colorScheme of ['light', 'dark']) {
    for (const [w, hgt] of [[1440, 900], [1024, 768], [390, 844]]) {
      const tag = `${colorScheme} ${w}`;
      const s = await open({ colorScheme, viewport: { width: w, height: hgt } });
      const p = s.page;
      const h = helpers(p);
      await p.click('#projects-open');
      await p.waitForSelector('#projects[open]');
      await scan(p, `${tag} proyectos (vacío)`, results);
      await p.keyboard.press('Escape');
      await addFiles(p, cards(0, 12));
      await p.locator('.page').nth(1).locator('.piece').first().focus();
      await scan(p, `${tag} varias hojas (selección en la 2)`, results);
      if (w < 1100) {
        await p.click(w < 800 ? '#pieces-dock' : '#pieces-toggle');
        await scan(p, `${tag} lista agrupada por hoja`, results);
        await p.keyboard.press('Escape');
      }
      // Pieza sacada de la hoja (se ve recortada; marco y barra con ella) y aviso con la hoja
      await h.setMeasure('pos-x', 180);
      await h.closePopover();
      if (w < 800 && (await p.locator('#props-panel.is-open').count())) await p.click('#props-toggle');
      await p.locator('.page').nth(1).locator('.piece').first().focus();
      await scan(p, `${tag} pieza fuera de la hoja + aviso con la hoja`, results);
      await p.keyboard.press('Control+z');
      await p.locator('.page').nth(1).hover();
      await p.locator('.page').nth(1).locator('.page-remove').click();
      await p.waitForSelector('#confirm[open]');
      await scan(p, `${tag} confirmar quitar hoja`, results);
      await p.keyboard.press('Escape');
      await h.openSheet();
      await p.selectOption('#paper', 'custom');
      await p.fill('#paper-w', '5');
      await scan(p, `${tag} papel personalizado con error`, results);
      await p.fill('#paper-w', '216');
      await p.keyboard.press('Enter');
      await h.closePopover();
      if (w < 800 && (await p.locator('#props-panel.is-open').count())) await p.click('#props-toggle');
      await p.click('#prefs-open');
      await p.waitForSelector('#prefs[open]');
      await scan(p, `${tag} preferencias`, results);
      await p.keyboard.press('Escape');
      await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });
      await p.click('#projects-open');
      await p.waitForSelector('#projects[open]');
      await p.click('#project-new');
      await p.waitForFunction(() => !document.querySelector('#sheets .piece'));
      await p.click('#projects-open');
      await p.waitForSelector('#projects[open]');
      await p.waitForFunction(() => document.querySelectorAll('.project-card').length === 2);
      await scan(p, `${tag} proyectos (con 2)`, results);
      await p.locator('.project-card').nth(1).locator('[data-act="rename"]').click();
      await scan(p, `${tag} proyectos (cambiando un nombre)`, results);
      await p.keyboard.press('Escape');
      await p.locator('.project-card').nth(1).locator('[data-act="delete"]').click();
      await p.waitForSelector('#confirm[open]');
      await scan(p, `${tag} confirmar eliminar proyecto`, results);
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
      await p.click('#project-name');
      await scan(p, `${tag} nombre del proyecto en edición`, results);
      await p.keyboard.press('Escape');
      await s.browser.close();
    }
    {
      const s = await open({ colorScheme, init: [{ content: `Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })` }] });
      await scan(s.page, `${colorScheme} 1440 sin almacenamiento (aviso)`, results);
      await s.page.click('#projects-open');
      await s.page.waitForSelector('#projects[open]');
      await scan(s.page, `${colorScheme} 1440 proyectos sin almacenamiento`, results);
      await s.browser.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'sheets-and-projects-a11y.json'), JSON.stringify(results, null, 2));
  const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const r of results) {
    for (const k of Object.keys(totals)) totals[k] += r.byImpact[k] ?? 0;
    const flag = r.violations.length ? r.violations.map((v) => `${v.impact}:${v.id}`).join(', ') : 'sin violaciones';
    console.log(`${r.label.padEnd(56)} ${flag}`);
    for (const v of r.violations) for (const n of v.nodes) console.log(`     ${v.id}: ${n}`);
  }
  console.log(`\n${results.length} estados · totales: ${JSON.stringify(totals)}`);
  process.exit(Object.values(totals).some(Boolean) ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
