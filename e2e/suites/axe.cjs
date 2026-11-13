// axe-core en cada estado relevante de la v2/v3, claro y oscuro (los estados nuevos: ../e-axe.js).
const { AxeBuilder } = require('@axe-core/playwright');
const { open, helpers, BASE, OUT, path, fs } = require('../lib/base.cjs');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

async function scan(page, label, results) {
  await page.waitForTimeout(80);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of r.violations) byImpact[v.impact] = (byImpact[v.impact] ?? 0) + v.nodes.length;
  results.push({ label, byImpact, violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(0, 2).join(' ')) })) });
}

(async () => {
  const results = [];
  for (const colorScheme of ['light', 'dark']) {
    {
      const s = await open({ colorScheme });
      const h = helpers(s.page);
      const p = s.page;
      await scan(p, `${colorScheme} 1440 vacío`, results);
      await h.load('big.png', 'small.jpg', 'square.webp', 'twopage.pdf');
      await p.mouse.click(700, 860);
      await scan(p, `${colorScheme} 1440 con piezas, sin selección`, results);
      await h.pieceByName('small.jpg').focus();
      await scan(p, `${colorScheme} 1440 con selección (barra de pieza)`, results);
      await p.locator('.page-label').first().focus();
      await scan(p, `${colorScheme} 1440 sheet title button focused (Hoja tab, tooltip)`, results);
      await h.pieceByName('small.jpg').focus();
      await h.setMeasure('scale', 400);
      await h.setMeasure('pos-x', -5);
      await p.click('#fill-details summary');
      await scan(p, `${colorScheme} 1440 con avisos, distintivos y «Rellenar» abierto`, results);
      await p.keyboard.press('Control+z');
      await p.keyboard.press('Control+z');
      await h.showTab('sheet');
      await p.click('[aria-controls="section-arrange"]');
      await p.click('#grid-show');
      await scan(p, `${colorScheme} 1440 sección plegada + grilla visible`, results);
      await h.pieceByName('small.jpg').focus();
      await p.keyboard.press('Enter');
      await scan(p, `${colorScheme} 1440 tooltip visible`, results);
      await p.keyboard.press('Escape');
      await p.keyboard.press('Shift+Slash');
      await scan(p, `${colorScheme} 1440 diálogo de atajos`, results);
      await p.keyboard.press('Escape');
      await s.browser.close();
    }
    {
      const s = await open({ colorScheme });
      await s.page.goto(`${BASE}?donar=${encodeURIComponent('https://www.patreon.com/ejemplo')}`);
      await s.page.waitForSelector('#paper option', { state: 'attached' });
      await s.page.waitForFunction(() => !document.body.classList.contains('is-loading'));
      const h = helpers(s.page);
      await h.load('small.jpg');
      await s.page.click('#export');
      await s.page.waitForSelector('#donate[open]');
      await scan(s.page, `${colorScheme} 1440 modal de donación`, results);
      await s.page.setViewportSize({ width: 390, height: 844 });
      await scan(s.page, `${colorScheme} 390 modal de donación`, results);
      await s.browser.close();
    }
    {
      const s = await open({ colorScheme, viewport: { width: 1024, height: 768 } });
      const h = helpers(s.page);
      await h.load('small.jpg', 'square.webp');
      await s.page.click('#pieces-toggle');
      await scan(s.page, `${colorScheme} 1024 panel de piezas superpuesto`, results);
      await s.browser.close();
    }
    {
      const s = await open({ colorScheme, viewport: { width: 390, height: 844 } });
      const h = helpers(s.page);
      await scan(s.page, `${colorScheme} 390 vacío`, results);
      await h.load('small.jpg', 'square.webp');
      await s.page.locator('#sheets .piece').first().focus();
      await scan(s.page, `${colorScheme} 390 con selección`, results);
      await s.page.click('#props-toggle');
      await scan(s.page, `${colorScheme} 390 propiedades (hoja inferior)`, results);
      await s.browser.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(results, null, 2));
  const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const r of results) {
    for (const k of Object.keys(totals)) totals[k] += r.byImpact[k] ?? 0;
    const flag = r.violations.length ? r.violations.map((v) => `${v.impact}:${v.id}`).join(', ') : 'sin violaciones';
    console.log(`${r.label.padEnd(58)} ${flag}`);
    for (const v of r.violations) for (const n of v.nodes) console.log(`     ${v.id}: ${n}`);
  }
  console.log(`\n${results.length} estados · totales: ${JSON.stringify(totals)}`);
  process.exit(Object.values(totals).some(Boolean) ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
