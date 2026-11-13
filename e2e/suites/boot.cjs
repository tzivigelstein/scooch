// What shows before the app mounts: the right background from the first paint
// (light and dark), the fallback heading visually hidden, a calm boot shell on
// slow loads, the no-JavaScript message, and nothing unstyled meanwhile.
const { launch, makeChecker, BASE } = require('../lib/base.cjs');

const TOKENS = { light: { bg: [255, 255, 255], text: 'rgb(14, 16, 20)' }, dark: { bg: [21, 23, 28], text: 'rgb(238, 240, 243)' } };

// The color of a tiny screenshot's first pixel, decoded in the page.
async function cornerColor(page) {
  const png = await page.screenshot({ clip: { x: 2, y: 2, width: 4, height: 4 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  }, png.toString('base64'));
}

const near = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

const STATE = () => {
  const h1 = document.querySelector('h1');
  const r = h1?.getBoundingClientRect();
  const boot = document.querySelector('.boot');
  const bootStyle = boot && getComputedStyle(boot);
  const name = document.querySelector('.boot-name');
  return {
    bg: getComputedStyle(document.body).backgroundColor,
    color: getComputedStyle(document.body).color,
    font: getComputedStyle(document.body).fontFamily,
    h1: r ? { w: r.width, h: r.height, clip: getComputedStyle(h1).clipPath } : null,
    boot: boot ? { opacity: Number(bootStyle.opacity), display: bootStyle.display, name: name?.textContent, nameFont: name && getComputedStyle(name).fontFamily } : null,
    mounted: !!document.querySelector('#paper'),
  };
};

(async () => {
  const { check, report } = makeChecker('Arranque: antes de que la app se monte');
  const browser = await launch();
  try {
    for (const scheme of ['light', 'dark']) {
      const token = TOKENS[scheme];
      // Without JavaScript: styled message, hidden heading, no boot shell.
      {
        const ctx = await browser.newContext({ javaScriptEnabled: false, colorScheme: scheme, viewport: { width: 1024, height: 768 } });
        const page = await ctx.newPage();
        await page.goto(BASE);
        const st = await page.evaluate(STATE);
        const message = await page.evaluate(() => {
          const p = document.querySelector('.noscript');
          const r = p?.getBoundingClientRect();
          return p ? { text: p.textContent, visible: r.width > 0 && r.height > 0, font: getComputedStyle(p).fontFamily } : null;
        });
        check(`${scheme}, sin JS: fondo y texto de la app`, near(await cornerColor(page), token.bg) && st.color === token.text, JSON.stringify(st));
        check(`${scheme}, sin JS: el encabezado de respaldo no ocupa lugar visible`, st.h1 && st.h1.w <= 1 && st.h1.h <= 1 && st.h1.clip !== 'none', JSON.stringify(st.h1));
        check(`${scheme}, sin JS: mensaje visible con la tipografía de la app`, message?.visible && /activa JavaScript/.test(message.text) && /^"Inter Variable", system-ui/.test(message.font), JSON.stringify(message));
        check(`${scheme}, sin JS: sin pantalla de carga`, st.boot?.display === 'none', JSON.stringify(st.boot));
        await ctx.close();
      }
      // Slow load (the app's script arrives late): correct background from the
      // first paint, the boot shell fades in after a moment, then the app.
      {
        const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1024, height: 768 } });
        const page = await ctx.newPage();
        let release;
        const held = new Promise((resolve) => (release = resolve));
        await page.route(/\/(assets\/index-[\w-]+\.js|src\/main\.tsx)(\?.*)?$/, async (route) => {
          await held;
          await route.continue();
        });
        await page.goto(BASE, { waitUntil: 'commit' });
        await page.waitForSelector('.boot', { state: 'attached' });
        const first = await page.evaluate(STATE);
        const firstColor = await cornerColor(page);
        check(`${scheme}, carga lenta: el primer cuadro ya tiene el fondo de la app`, near(firstColor, token.bg) && first.color === token.text, JSON.stringify({ firstColor, first }));
        check(`${scheme}, carga lenta: al principio no se ve nada más (sin parpadeo en cargas rápidas)`, first.boot && first.boot.opacity < 0.5, JSON.stringify(first.boot));
        await page.waitForTimeout(700);
        const later = await page.evaluate(STATE);
        check(`${scheme}, carga lenta: después aparece la marca con el nombre de la app`, later.boot?.opacity === 1 && later.boot.name === 'Scooch' && /Inter|system-ui/.test(later.boot.nameFont), JSON.stringify(later.boot));
        check(`${scheme}, carga lenta: el encabezado de respaldo sigue oculto a la vista`, later.h1 && later.h1.w <= 1 && later.h1.h <= 1, JSON.stringify(later.h1));
        release();
        await page.waitForFunction(() => document.querySelector('#paper') && !document.querySelector('.boot'));
        const mounted = await page.evaluate(STATE);
        check(`${scheme}: la app reemplaza la pantalla de carga, con el mismo fondo`, mounted.mounted && !mounted.boot && near(await cornerColor(page), token.bg) && mounted.bg === `rgb(${token.bg.join(', ')})`, JSON.stringify(mounted));
        await ctx.close();
      }
    }
  } catch (err) {
    check('sin excepciones', false, err.stack);
  }
  await browser.close();
  process.exit(report() ? 1 : 0);
})();
