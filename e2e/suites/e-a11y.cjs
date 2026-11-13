// Accesibilidad de lo nuevo: axe (0 violaciones) en selección múltiple, panel de grupo, alinear y
// distribuir, rechazo con acción, lista multiselección, Preferencias y atajos (claro/oscuro, 1440,
// 1024, 390 y 2560), y un recorrido solo con teclado.
const { AxeBuilder } = require('@axe-core/playwright');
const { open, makeChecker, addFiles, cards, tiles, lib, norm } = require('../lib/selection.cjs');
const { check, report } = makeChecker('A/B + retoques: axe y teclado');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
let states = 0;

async function scan(page, label) {
  await page.waitForTimeout(150);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  states++;
  for (const v of r.violations) totals[v.impact] += v.nodes.length;
  check(`axe: ${label}`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`).join(' | '));
}

const heard = (p, re, ms = 2500) =>
  p.waitForFunction(([s, f]) => new RegExp(s, f).test(document.getElementById('live-polite').textContent + ' ' + document.getElementById('live-assertive').textContent), [re.source, re.flags], { timeout: ms }).then(() => true, () => false);

async function axeStates() {
  for (const colorScheme of ['light', 'dark']) {
    for (const [w, h] of [[1440, 900], [1024, 768], [390, 844], [2560, 1440]]) {
      const tag = `${colorScheme} ${w}`;
      const s = await open({ colorScheme, viewport: { width: w, height: h } });
      const p = s.page;
      const L = lib(p);
      await addFiles(p, cards(0, 4));
      const ids = await L.ids();
      const openProps = async () => { if (w < 800 && !(await p.locator('#props-panel.is-open').count())) await p.click('#props-toggle'); };
      const closeProps = async () => { if (w < 800 && (await p.locator('#props-panel.is-open').count())) await p.click('#props-panel [data-close-panel]'); };
      // Una pieza: alinear al área útil, distribuir deshabilitado
      await L.selectIds([ids[0]]);
      await openProps();
      await scan(p, `${tag} una pieza: alinear al área útil`);
      await closeProps();
      // Varias: panel de grupo, marcos, barra «N piezas»
      await L.selectIds(ids.slice(0, 3));
      await scan(p, `${tag} selección múltiple (marcos y barra)`);
      await openProps();
      await scan(p, `${tag} panel de grupo`);
      await p.click('#distribute-mode input[value="even"]', { force: true });
      await L.selectIds(ids.slice(0, 2));
      await openProps();
      await scan(p, `${tag} distribuir deshabilitado (explicado)`);
      await p.click('#distribute-mode input[value="gap"]', { force: true });
      await closeProps();
      // Rechazo con acción
      const g = await L.geom();
      const [a, b] = g.pieces;
      await L.selectIds([a.id, b.id]);
      await openProps();
      // Las dos primeras quedan en la misma fila: alinearlas en el otro eje las encimaría.
      await p.click(Math.abs(a.y - b.y) < 1 ? '[data-align="left"]' : '[data-align="top"]');
      await closeProps();
      await p.waitForSelector('#pill:not([hidden])');
      await scan(p, `${tag} rechazo con «Permitir superposición»`);
      // Lista con varias seleccionadas
      if (w < 1100) await p.click(w < 800 ? '#pieces-dock' : '#pieces-toggle');
      await scan(p, `${tag} lista con selección múltiple`);
      await p.keyboard.press('Escape');
      if (w < 1100 && (await p.locator('#pieces-panel.is-open').count())) await p.keyboard.press('Escape');
      // Diálogos
      await p.click('#prefs-open');
      await p.waitForSelector('#prefs[open]');
      await scan(p, `${tag} Preferencias`);
      await p.keyboard.press('Escape');
      if (await p.isVisible('#help')) await p.click('#help');
      else await p.keyboard.press('Shift+Slash');
      await p.waitForSelector('#shortcuts[open]');
      await scan(p, `${tag} atajos con el enlace a Preferencias`);
      await p.keyboard.press('Escape');
      check(`${tag} sin scroll horizontal`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await s.browser.close();
    }
  }
}

async function keyboardWalk() {
  const s = await open();
  const p = s.page;
  const L = lib(p);
  const k = p.keyboard;
  await addFiles(p, tiles(50, 4));
  const ids = await L.ids();
  const act = () => p.evaluate(() => ({ id: document.activeElement.id, piece: document.activeElement.classList.contains('piece') ? Number(document.activeElement.dataset.id) : null, cls: document.activeElement.className, label: document.activeElement.getAttribute('aria-label') }));
  // A la hoja con el salto, Tab entre piezas
  await p.focus('#skip');
  await k.press('Enter');
  check('saltar a la hoja: foco en una pieza', (await act()).piece !== null);
  const first = (await act()).piece;
  await k.press('Shift+Space');
  check('Shift+Espacio: queda fijada y se anuncia cómo seguir', (await L.selectedIds()).length === 1 && (await heard(p, /agrégala con Shift\+Espacio/)));
  await k.press('Shift+Tab');
  const second = (await act()).piece;
  check('Shift+Tab a otra pieza: la selección no cambia', second !== null && second !== first && (await L.selectedIds()).length === 1);
  await k.press('Shift+Space');
  check('Shift+Espacio: 2 seleccionadas y se anuncia', JSON.stringify(await L.selectedIds()) === JSON.stringify([first, second].sort((a, b) => a - b)) && (await heard(p, /2 piezas seleccionadas/)));
  // Alinear con el atajo
  await k.press('Alt+Shift+ArrowUp');
  check('Alt+Shift+↑: alinea arriba (o explica por qué no)', (await heard(p, /Se alinearon 2 piezas arriba|ya estaban alineadas|No se puede alinear/)));
  // Barra de acciones del grupo
  await k.press('Enter');
  check('Enter: a la barra de acciones del grupo', (await act()).label === 'Girar 90° a la izquierda' && (await p.getAttribute('#piecebar', 'aria-label')) === 'Acciones de 2 piezas');
  await k.press('Escape'); // el primero cierra el tooltip del botón enfocado (WCAG 1.4.13)
  await k.press('Escape');
  check('Esc: vuelve a la pieza', (await act()).piece !== null);
  // M: the Pieza tab (the group's fields follow it); align and distribute with Tab and Enter
  await k.press('m');
  check('M: focus on the Pieza tab', (await act()).id === 'props-tab-piece');
  await k.press('Tab');
  check('Tab: X of the group', (await act()).id === 'pos-x');
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    await k.press('Tab');
    found = (await act()).label === 'Alinear a la izquierda';
  }
  check('Tab llega a «Alinear a la izquierda» (con su atajo en el nombre de teclas)', found && (await p.evaluate(() => document.activeElement.getAttribute('aria-keyshortcuts'))) === 'Alt+Shift+ArrowLeft');
  await k.press('Enter');
  check('Enter: alinea a la izquierda (o explica)', await heard(p, /Se alinearon 2 piezas a la izquierda|ya estaban alineadas|No se puede alinear/));
  // Duplicar ×N por teclado
  found = false;
  for (let i = 0; i < 20 && !found; i++) {
    await k.press('Tab');
    found = (await act()).id === 'dup-count';
  }
  check('Tab llega al campo de copias', found);
  await k.press('Control+a');
  await k.type('3');
  await k.press('Enter');
  check('3 + Enter: 6 copias nuevas, con aviso', (await L.ids()).length === 10 && /^Se agregaron 6 copias/.test((await L.pill()).text), (await L.pill()).text);
  // Seleccionar iguales con I y Ctrl+A, Esc
  await L.piece(first).focus();
  await k.press('i');
  check('I: las piezas del mismo archivo (la original y sus 3 copias)', (await L.selectedIds()).length === 4, JSON.stringify(await L.selectedIds()));
  await k.press('Control+a');
  check('Ctrl+A: todas las de la hoja', (await L.selectedIds()).length >= 4 && (await heard(p, /Se seleccionaron las \d+ piezas de la hoja/)));
  await k.press('Escape');
  check('Esc: ninguna', (await L.selectedIds()).length === 0 && (await heard(p, /Ninguna pieza seleccionada/)));
  // Atajos → enlace a Preferencias → volver
  await L.piece(ids[0]).focus();
  await k.press('Shift+Slash');
  await p.waitForSelector('#shortcuts[open]');
  check('la nota es una sola frase con el enlace', norm(await p.textContent('#shortcuts-note')) === 'Los atajos de 1 tecla se activan en Preferencias' && (await p.evaluate(() => document.querySelector('#shortcuts-note button')?.textContent)) === 'Preferencias');
  found = false;
  for (let i = 0; i < 4 && !found; i++) {
    await k.press('Tab');
    found = (await act()).id === 'shortcuts-prefs';
  }
  check('Tab llega al enlace «Preferencias»', found);
  await k.press('Enter');
  await p.waitForSelector('#prefs[open]');
  check('Enter abre Preferencias', await p.evaluate(() => document.getElementById('prefs').open && !document.getElementById('shortcuts').open));
  // Preferencias: grupos con título, ayuda asociada
  const groups = await p.evaluate(() => [...document.querySelectorAll('#prefs [role="group"]')].map((g) => document.getElementById(g.getAttribute('aria-labelledby'))?.textContent));
  check('Preferencias: dos grupos con título (Unidades, Teclado)', JSON.stringify(groups) === JSON.stringify(['Unidades', 'Teclado']), JSON.stringify(groups));
  check('ayuda de unidades asociada a cada opción', await p.evaluate(() => [...document.querySelectorAll('#prefs input[name="unit"]')].every((r) => r.getAttribute('aria-describedby') === 'units-hint')));
  await k.press('Escape');
  await p.waitForTimeout(100);
  check('al cerrar, el foco vuelve a la pieza', (await act()).piece === ids[0]);
  errors.push(...s.errors);
  await s.browser.close();
}

const errors = [];
(async () => {
  try {
    await keyboardWalk();
    await axeStates();
  } catch (err) {
    check('sin excepciones', false, err.stack);
  }
  check('sin errores de consola', errors.length === 0, errors.join(' | '));
  console.log(`${states} estados · totales: ${JSON.stringify(totals)}`);
  process.exit(report() ? 1 : 0);
})();
