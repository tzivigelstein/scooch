// Modal de donación al imprimir o descargar (reconstruida tras perderse /tmp).
const { open, makeChecker, helpers, BASE } = require('../lib/base.cjs');
const URL_OK = 'https://www.patreon.com/ejemplo';

// Espía de print() en el iframe de impresión.
const SPY = () => {
  window.__print = { calls: 0 };
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const w = desc.get.call(this);
      if (w && this.classList.contains('print-frame') && !w.__spied) {
        w.__spied = true;
        w.print = () => window.__print.calls++;
      }
      return w;
    },
  });
};

async function withPage(opts, fn, { url = `${BASE}?donar=${encodeURIComponent(URL_OK)}` } = {}) {
  const s = await open({ ...opts, init: [{ content: `(${SPY})()` }] });
  await s.context.route((u) => u.hostname.endsWith('patreon.com'), (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Patreon (prueba)</title>' }));
  await s.page.goto(url);
  await s.page.waitForSelector('#paper option', { state: 'attached' });
  await s.page.waitForFunction(() => !document.body.classList.contains('is-loading'));
  const h = helpers(s.page);
  await h.load('small.jpg', 'square.webp');
  try {
    await fn(s, h);
  } finally {
    await s.browser.close();
  }
  return s.errors;
}

(async () => {
  const { check, report } = makeChecker('Modal de donación');
  const errs = [];
  const isOpen = (p) => p.evaluate(() => document.getElementById('donate').open);

  // ---------- 1. Imprimir: aparece, «Seguir sin aportar» imprime; el segundo va directo
  errs.push(
    ...(await withPage({ launch: { channel: 'chromium' } }, async ({ page }, h) => {
      await page.click('#print');
      await page.waitForSelector('#donate[open]');
      check('Imprimir: aparece el modal (modal de verdad)', await page.evaluate(() => document.getElementById('donate').matches(':modal')));
      check('foco inicial en el título (no en el enlace a Patreon)', (await h.active()).id === 'donate-title');
      const cta = await page.evaluate(() => { const a = document.getElementById('donate-cta'); return { tag: a.tagName, href: a.href, target: a.target, rel: a.rel }; });
      check('el CTA es un <a> real a la URL, en otra pestaña, con noopener noreferrer', cta.tag === 'A' && cta.href === URL_OK && cta.target === '_blank' && /noopener/.test(cta.rel) && /noreferrer/.test(cta.rel), JSON.stringify(cta));
      const sizes = await page.evaluate(() => ['donate-cta', 'donate-skip', 'donate-close'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, Math.round(r.width), Math.round(r.height)]; }));
      check('«Seguir sin aportar» bien visible y del mismo alto táctil (≥ 40 px)', sizes.every(([, w, hgt]) => hgt >= 40 && w >= 40), JSON.stringify(sizes));
      const skipStyle = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('donate-skip')); return [cs.fontSize, cs.fontWeight]; });
      check('«Seguir sin aportar» no es un enlace gris diminuto', parseFloat(skipStyle[0]) >= 14 && Number(skipStyle[1]) >= 600, skipStyle.join(' '));
      const t0 = Date.now();
      await page.click('#donate-skip');
      await page.waitForFunction(() => window.__print.calls === 1, null, { timeout: 15000 });
      check('«Seguir sin aportar»: cierra y llama a print() del PDF', !(await isOpen(page)));
      check('el PDF ya estaba generándose (imprime enseguida al cerrar)', Date.now() - t0 < 3000, `${Date.now() - t0} ms`);
      check('el foco vuelve al botón Imprimir', (await h.active()).id === 'print');
      await page.click('#print');
      await page.waitForFunction(() => window.__print.calls === 2, null, { timeout: 15000 });
      check('segundo Imprimir de la sesión: sin modal', !(await isOpen(page)));
      const [d] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
      check('descargar en la misma sesión: sin modal', !!d && !(await isOpen(page)));
    }))
  );

  // ---------- 2. Descargar: Esc, X y fondo cierran y la descarga sigue
  for (const via of ['Esc', 'X', 'fondo']) {
    errs.push(
      ...(await withPage({}, async ({ page }) => {
        const dl = page.waitForEvent('download');
        await page.click('#export');
        await page.waitForSelector('#donate[open]');
        if (via === 'Esc') await page.keyboard.press('Escape');
        if (via === 'X') await page.click('#donate-close');
        if (via === 'fondo') await page.mouse.click(5, 5);
        const d = await dl;
        check(`Descargar con modal: cerrar con ${via} sigue con la descarga`, d.suggestedFilename() === 'pliego-a4.pdf' && !(await isOpen(page)));
      }))
    );
  }

  // ---------- 3. CTA: abre Patreon en otra pestaña y la descarga sigue
  errs.push(
    ...(await withPage({}, async ({ page, context }) => {
      const dl = page.waitForEvent('download');
      await page.click('#export');
      await page.waitForSelector('#donate[open]');
      const [tab] = await Promise.all([context.waitForEvent('page'), page.click('#donate-cta')]);
      const d = await dl;
      check('CTA: abre Patreon en otra pestaña', /patreon\.com/.test(tab.url()));
      check('CTA: la descarga sigue igual', d.suggestedFilename() === 'pliego-a4.pdf' && !(await isOpen(page)));
    }))
  );

  // ---------- 4. «No volver a mostrar en este dispositivo»
  errs.push(
    ...(await withPage({}, async ({ page }, h) => {
      await page.click('#export');
      await page.waitForSelector('#donate[open]');
      await page.check('#donate-never');
      await Promise.all([page.waitForEvent('download'), page.click('#donate-skip')]);
      check('la casilla se guarda en localStorage', (await page.evaluate(() => localStorage.getItem('scooch:donate-dismissed'))) === 'never');
      await page.reload();
      await page.waitForSelector('#paper option', { state: 'attached' });
      await page.waitForFunction(() => !document.body.classList.contains('is-loading'));
      if (!(await h.count())) await h.load('small.jpg');
      const [d] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
      check('después de recargar: sin modal', !!d && !(await isOpen(page)));
    }))
  );

  // ---------- 5. Sin URL de Patreon (o inválida): nunca aparece
  for (const [label, url] of [['sin URL', BASE], ['URL inválida', `${BASE}?donar=${encodeURIComponent('javascript:alert(1)')}`]]) {
    errs.push(
      ...(await withPage({}, async ({ page }) => {
        const [d] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
        check(`${label}: descargar va directo, sin modal`, !!d && !(await isOpen(page)));
      }, { url }))
    );
  }

  // ---------- 6. Textos del modal
  errs.push(
    ...(await withPage({}, async ({ page }) => {
      await page.click('#export');
      await page.waitForSelector('#donate[open]');
      check('título y cuerpo sin depender del género del nombre', (await page.textContent('#donate-title')) === '¿Te ahorró tiempo y papel?' && /Pliego es gratis/.test(await page.textContent('#donate-body')));
      check('beneficios: sin anuncios, sin marcas de agua, privado', (await page.locator('#donate-benefits li').count()) === 3);
      check('agradecimiento sin culpa', /Gracias por usar Pliego, con o sin aporte/.test(await page.textContent('#donate-thanks')));
      check('nombre accesible del modal: su título', (await page.getAttribute('#donate', 'aria-labelledby')) === 'donate-title');
      await Promise.all([page.waitForEvent('download'), page.keyboard.press('Escape')]);
    }))
  );

  check('sin errores de consola', errs.length === 0, errs.join(' | '));
  const failures = report();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
