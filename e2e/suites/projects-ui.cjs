// Renaming a project in place (the card keeps its size and thumbnail; the top
// bar the same way), tooltips inside dialogs, and every icon-only button with
// an accessible name and a tooltip.
const { open, makeChecker, addFiles, norm, OUT, path } = require('../lib/sheets.cjs');

const DONATE = 'https://www.patreon.com/ejemplo';

const rect = (loc) => loc.evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const sameRect = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.5);
const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Buttons whose only content is an icon: they need a name and a tooltip.
const ICON_ONLY = () =>
  [...document.querySelectorAll('button')]
    .filter((b) => {
      if (b.closest('[hidden], dialog:not([open])') || !b.getClientRects().length) return false;
      const copy = b.cloneNode(true);
      copy.querySelectorAll('.sr-only, svg').forEach((n) => n.remove());
      return !copy.textContent.trim();
    })
    .map((b) => ({ id: b.id || `${b.className} ${b.dataset.act ?? b.dataset.action ?? b.dataset.align ?? b.dataset.distribute ?? ''}`.trim(), name: b.getAttribute('aria-label') ?? '', tip: b.dataset.tip ?? '' }));

(async () => {
  const { check, report } = makeChecker('Proyectos: cambiar el nombre en el lugar, tooltips y botones de ícono');
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

      // Tooltips inside the dialog: on hover and right away with the keyboard, above the dialog.
      const tool = card.locator('[data-act="duplicate"]');
      await tool.hover();
      await p.waitForSelector('#projects #tooltip:not([hidden])');
      const onTop = await p.evaluate(() => {
        const tip = document.getElementById('tooltip');
        const r = tip.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { text: tip.textContent, top: tip.contains(hit), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 };
      });
      check(`${tag}: las acciones de la tarjeta tienen tooltip, visible encima del diálogo`, onTop.text === 'Duplicar' && onTop.top && onTop.inside, JSON.stringify(onTop));
      await p.mouse.move(2, 2);
      await p.locator('#projects-close').focus();
      await k.press('Shift+Tab');
      await k.press('Tab');
      check(`${tag}: con el teclado, el tooltip aparece enseguida (cerrar)`, (await p.evaluate(() => document.querySelector('#projects #tooltip:not([hidden])')?.textContent)) === 'Cerrar');

      // Every icon-only button, in the main window and in each dialog.
      const missing = [];
      const audit = async (where) => {
        for (const b of await p.evaluate(ICON_ONLY)) if (!b.name.trim() || !b.tip.trim()) missing.push(`${where}: ${b.id} (${b.name ? '' : 'sin nombre '}${b.tip ? '' : 'sin tooltip'})`);
      };
      await audit('proyectos');
      await k.press('Escape');
      await k.press('Escape');
      await p.locator('#sheets .piece').first().click();
      await audit('principal');
      // (On narrow screens the shortcuts button hides: «?» opens it everywhere.)
      await p.locator('#sheets .piece').first().focus();
      await k.press('?');
      await p.waitForSelector('#shortcuts[open] #shortcuts-rows tr');
      await audit('atajos');
      await p.click('#shortcuts-prefs');
      await p.waitForSelector('#prefs[open] #single-keys');
      await audit('preferencias');
      await k.press('Escape');
      await p.click('#add-sheet');
      await p.locator('#sheets .piece').first().click();
      await k.press('Shift+PageDown');
      await p.evaluate(() => document.querySelectorAll('.page-remove')[1].click());
      if (await p.locator('#confirm[open]').count()) {
        await audit('confirmación');
        await k.press('Escape');
      }
      await p.goto(`${s.page.url().split('?')[0]}?donar=${encodeURIComponent(DONATE)}`);
      await p.waitForFunction(() => !document.body.classList.contains('is-loading'));
      await p.click('#export');
      await p.waitForSelector('#donate[open] #donate-close');
      await audit('donación');
      await k.press('Escape');
      check(`${tag}: todos los botones de solo ícono tienen nombre accesible y tooltip`, missing.length === 0, missing.join(' · '));
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
