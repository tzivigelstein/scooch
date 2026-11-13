// El HTML llega con los textos puestos (sin JS) y applyCopy en el navegador da lo mismo.
const { launch, makeChecker, BASE } = require('../lib/base.cjs');

const COLLECT = () => {
  const out = {};
  const attrs = { 'data-i18n-label': 'aria-label', 'data-i18n-tip': 'data-tip', 'data-i18n-note': 'data-tip-note', 'data-i18n-content': 'content' };
  document.querySelectorAll('[data-i18n],[data-i18n-label],[data-i18n-tip],[data-i18n-note],[data-i18n-content]').forEach((el, i) => {
    const id = `${i}:${el.tagName}#${el.id}`;
    if (el.dataset.i18n) out[`${id} text`] = el.textContent;
    for (const [src, dst] of Object.entries(attrs)) if (el.hasAttribute(src)) out[`${id} ${dst}`] = el.getAttribute(dst);
  });
  out.title = document.title;
  return out;
};

(async () => {
  const { check, report } = makeChecker('Textos del HTML');
  const browser = await launch();
  const ctx1 = await browser.newContext({ javaScriptEnabled: false });
  const p1 = await ctx1.newPage();
  await p1.goto(BASE);
  const bare = await p1.evaluate(COLLECT);
  const empty = Object.entries(bare).filter(([, v]) => !v || !String(v).trim());
  check('sin JS, todos los textos y atributos ya están puestos', empty.length === 0, empty.map(([k]) => k).join(', '));
  check('sin JS, el <title> es el de la app', /^Pliego/.test(bare.title), bare.title);
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(BASE);
  await p2.waitForSelector('#paper option', { state: 'attached' });
  await p2.waitForFunction(() => !document.body.classList.contains('is-loading'));
  const live = await p2.evaluate(COLLECT);
  // Lo que cambia a propósito al iniciar: el texto de la zona para soltar (según los atajos de una
  // tecla), el título de traer al frente, el total de piezas, el giro y el tooltip del nombre del proyecto.
  const dynamic = /#empty-text|#piece-front|#piece-total|#rotation-angle|#project-name /;
  const diffs = Object.keys(bare).filter((k) => !dynamic.test(k) && bare[k] !== live[k]);
  check('applyCopy en el navegador no cambia los textos estáticos', diffs.length === 0, diffs.map((k) => `${k}: «${bare[k]}» → «${live[k]}»`).join(' | '));
  await browser.close();
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
