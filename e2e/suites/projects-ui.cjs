// Renaming a project in place: the card keeps its size and thumbnail; the top
// bar the same way.
const { open, makeChecker, addFiles, norm, OUT, path } = require('../lib/sheets.cjs');

const rect = (loc) => loc.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const sameRect = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.5);
const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

(async () => {
  const { check, report } = makeChecker('Proyectos: cambiar el nombre en el lugar');
  const errors = [];
  for (const [colorScheme, width, height] of [['light', 1440, 900], ['dark', 1440, 900], ['light', 390, 844], ['dark', 390, 844]]) {
    const tag = `${colorScheme} ${width}`;
    const s = await open({ colorScheme, viewport: { width, height } });
    const p = s.page;
    const k = p.keyboard;
    try {
      await addFiles(p, ['card00.png', 'card01.png']);
      await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });
      await p.click('#projects-open');
      await p.waitForSelector('#projects[open] .project-card img');
      const card = p.locator('.project-card.is-current');
      const before = await rect(card);
      await card.locator('[data-act="rename"]').click();
      const input = card.locator('.project-title-input');
      await input.waitFor();
      const during = await rect(card);
      const badge = await rect(card.locator('.project-badge'));
      const field = await rect(input);
      const thumbVisible = await card.locator('.project-thumb img').isVisible();
      const selection = await input.evaluate((el) => [el.selectionStart, el.selectionEnd, el.value.length, document.activeElement === el]);
      check(`${tag}: al cambiar el nombre la tarjeta mide lo mismo y conserva la miniatura`, sameRect(before, during) && thumbVisible, JSON.stringify({ before, during, thumbVisible }));
      check(`${tag}: el distintivo «Abierto» no tapa el campo`, !intersects(badge, field), JSON.stringify({ badge, field }));
      check(`${tag}: el texto queda elegido y el campo tiene nombre accesible`, selection[0] === 0 && selection[1] === selection[2] && selection[3] && (await input.getAttribute('aria-label')) === 'Nombre del proyecto', JSON.stringify(selection));
      await p.screenshot({ path: path.join(OUT, `projects-rename-${colorScheme}-${width}.png`) });
      await k.type('Tarjetas');
      await k.press('Enter');
      await p.waitForFunction(() => document.querySelector('.project-card.is-current .project-title')?.textContent === 'Tarjetas');
      const after = await rect(card);
      check(`${tag}: Enter guarda, la tarjeta sigue igual y el foco vuelve al lápiz`, sameRect(before, after) && (await p.evaluate(() => document.activeElement.dataset.act)) === 'rename', JSON.stringify(after));
      await k.press('Enter');
      await input.waitFor();
      await k.type('nada');
      await k.press('Escape');
      await p.waitForTimeout(150);
      check(`${tag}: Esc cancela, sin cerrar el diálogo`, norm(await card.locator('.project-title').textContent()) === 'Tarjetas' && (await p.evaluate(() => document.getElementById('projects').open && document.activeElement.dataset.act === 'rename')));
      await k.press('Enter');
      await input.waitFor();
      await k.press('Backspace');
      await k.press('Enter');
      await p.waitForTimeout(150);
      check(`${tag}: vacío conserva el nombre anterior`, norm(await card.locator('.project-title').textContent()) === 'Tarjetas');
      await k.press('Enter');
      await input.waitFor();
      await k.type('Tarjetas 2');
      await p.click('#projects-title');
      await p.waitForFunction(() => document.querySelector('.project-card.is-current .project-title')?.textContent === 'Tarjetas 2');
      check(`${tag}: al salir del campo se guarda`, true);

      errors.push(...s.errors);
    } catch (err) {
      check(`${tag}: sin excepciones`, false, err.stack);
    }
    await s.browser.close();
  }

  // The top bar edits the name the same way.
  {
    const s = await open({ viewport: { width: 1440, height: 900 } });
    const p = s.page;
    const k = p.keyboard;
    await p.click('#project-name');
    const st = await p.evaluate(() => {
      const el = document.getElementById('project-name-input');
      return { focused: document.activeElement === el, all: el.selectionStart === 0 && el.selectionEnd === el.value.length, name: el.getAttribute('aria-label') };
    });
    check('barra: texto elegido y nombre accesible', st.focused && st.all && st.name === 'Nombre del proyecto', JSON.stringify(st));
    await k.type('Hojas');
    await k.press('Escape');
    check('barra: Esc cancela y el foco vuelve al nombre', norm(await p.textContent('#project-name-text')) === 'Sin título' && (await p.evaluate(() => document.activeElement.id)) === 'project-name');
    await k.press('Enter');
    await k.press('Backspace');
    await k.press('Enter');
    check('barra: vacío conserva el nombre', norm(await p.textContent('#project-name-text')) === 'Sin título');
    await k.press('Enter');
    await k.type('Hojas');
    await k.press('Enter');
    await p.waitForFunction(() => document.getElementById('project-name-text').textContent === 'Hojas');
    check('barra: Enter guarda y el foco vuelve al nombre', (await p.evaluate(() => document.activeElement.id)) === 'project-name');
    errors.push(...s.errors);
    await s.browser.close();
  }
  check('sin errores de consola', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})();
