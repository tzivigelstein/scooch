// Measurement fields out of range: the preview uses the clamped value, the
// field says so inline (accessibly), problem notices wait until the edit is
// confirmed, Esc goes back, and each confirmed edit is one undo step.
const { AxeBuilder } = require('@axe-core/playwright');
const { open, makeChecker, addFiles, norm } = require('../lib/sheets.cjs');

const PIECES = ['card00.png', 'card01.png', 'card02.png', 'card03.png', 'card04.png'];

const state = (p, id) =>
  p.evaluate((fieldId) => {
    const input = document.getElementById(fieldId);
    const limit = document.getElementById(`${fieldId}-limit`);
    const pill = document.getElementById('pill');
    return {
      value: input.value,
      invalid: input.getAttribute('aria-invalid'),
      describedBy: input.getAttribute('aria-describedby') ?? '',
      limit: limit ? limit.textContent : null,
      limitVisible: !!limit && limit.getBoundingClientRect().height > 0,
      pill: pill.hidden ? '' : document.getElementById('pill-text').textContent,
      focused: document.activeElement === input,
    };
  }, id);

(async () => {
  const { check, report } = makeChecker('Campos de medida fuera de rango');
  const errors = [];
  for (const colorScheme of ['light', 'dark']) {
    const s = await open({ colorScheme, viewport: { width: 1440, height: 900 } });
    const p = s.page;
    const k = p.keyboard;
    try {
      await addFiles(p, PIECES);
      await p.click('#arrange');
      await p.keyboard.press('Escape');
      const zoom = await p.evaluate(() => parseFloat(document.querySelector('.sheet-box').style.width) / 210);
      const undoBefore = await p.isDisabled('#undo');

      // Margin: 21312 while typing
      await p.locator('#margin').focus();
      await k.press('Control+a');
      await k.type('21312');
      let st = await state(p, 'margin');
      const inset = await p.evaluate(() => parseFloat(document.querySelector('.safe').style.inset));
      check(`${colorScheme}: margen 21312 → la guía muestra el margen de 50 mm (la vista previa usa el valor acotado)`, Math.abs(inset - 50 * zoom) < 0.01, `${inset} vs ${50 * zoom}`);
      check(`${colorScheme}: el campo dice «Máximo 50 mm», visible y accesible`, norm(st.limit) === 'Máximo 50 mm' && st.limitVisible && st.invalid === 'true' && st.describedBy.split(' ').includes('margin-limit'), JSON.stringify(st));
      check(`${colorScheme}: mientras se escribe no aparece el aviso de problemas`, st.pill === '' && st.focused, JSON.stringify(st));
      const axe = await new AxeBuilder({ page: p }).analyze();
      check(`${colorScheme}: axe sin violaciones con el aviso del campo a la vista`, axe.violations.length === 0, axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`).join(' | '));
      await k.press('Tab');
      await p.waitForTimeout(200);
      st = await state(p, 'margin');
      check(`${colorScheme}: al salir queda 50 y el aviso del campo se va`, st.value === '50' && st.limit === null && st.invalid === null, JSON.stringify(st));
      check(`${colorScheme}: recién entonces el aviso refleja el estado real`, /pasan? el margen/.test(norm(st.pill)), st.pill);
      await p.click('#undo');
      check(`${colorScheme}: un solo paso de deshacer vuelve al margen de 10`, (await p.inputValue('#margin')) === '10');

      // Esc: back to how it was, no undo step
      await p.locator('#margin').focus();
      await k.press('Control+a');
      await k.type('30');
      check(`${colorScheme}: 30 se ve en la guía mientras se escribe`, Math.abs((await p.evaluate(() => parseFloat(document.querySelector('.safe').style.inset))) - 30 * zoom) < 0.01);
      const undoMid = await p.isDisabled('#undo');
      await k.press('Escape');
      await p.waitForTimeout(150);
      check(`${colorScheme}: Esc vuelve a 10, deja la guía como estaba y el foco vuelve a la hoja`, (await p.inputValue('#margin')) === '10' && Math.abs((await p.evaluate(() => parseFloat(document.querySelector('.safe').style.inset))) - 10 * zoom) < 0.01 && (await p.evaluate(() => !document.activeElement.closest('.panel'))));
      check(`${colorScheme}: Esc no deja pasos de deshacer`, (await p.isDisabled('#undo')) === undoMid && undoMid === undoBefore);

      // Confirming the same value adds no undo step
      await p.locator('#gap').focus();
      await k.press('Control+a');
      await k.type('8');
      await k.press('Control+a');
      await k.type('5');
      await k.press('Enter');
      check(`${colorScheme}: confirmar el mismo valor no agrega pasos`, (await p.isDisabled('#undo')) === undoBefore);

      // X beyond the sheet
      const piece = p.locator('#sheets .piece').first();
      await piece.focus();
      await p.locator('#pos-x').focus();
      await k.press('Control+a');
      await k.type('500');
      st = await state(p, 'pos-x');
      const max = await p.evaluate(() => {
        const node = document.querySelector('#sheets .piece.is-selected');
        const zoomNow = parseFloat(document.querySelector('.sheet-box').style.width) / 210;
        return 210 - parseFloat(node.style.width) / zoomNow / 2;
      });
      check(`${colorScheme}: X 500 → el campo dice el máximo (centro en el borde)`, norm(st.limit) === `Máximo ${String(Math.round(max * 10) / 10).replace('.', ',')} mm` && st.invalid === 'true', JSON.stringify({ st, max }));
      check(`${colorScheme}: X 500 → sin aviso de «se sale» mientras se escribe`, st.pill === '', st.pill);
      await k.press('Enter');
      await p.waitForTimeout(150);
      st = await state(p, 'pos-x');
      check(`${colorScheme}: Enter deja el máximo y entonces avisa que se sale de la hoja`, st.limit === null && /se sale/.test(norm(st.pill)), JSON.stringify(st));
      errors.push(...s.errors);
    } catch (err) {
      check(`${colorScheme}: sin excepciones`, false, err.stack);
    }
    await s.browser.close();
  }
  check('sin errores de consola', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})();
