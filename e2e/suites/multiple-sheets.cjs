// Varias hojas: acomodar, agregar y duplicar, arrastrar y teclado entre hojas, quitar
// hojas, deshacer/rehacer, PDF de N páginas, impresión por iframe y rendimiento.
const { open, makeChecker, helpers, norm, addFiles, pill, sheets, pdfInfo, download, heard, OUT, path, fs } = require('../lib/sheets.cjs');

const cards = (from, n) => Array.from({ length: n }, (_, i) => `card${String(from + i).padStart(2, '0')}.png`);
const EPS = 0.05;
const overlapsIn = (pieces) => {
  const bad = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      if (a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS) bad.push([a.name, b.name]);
    }
  return bad;
};
const outside = (pieces, W, H, m) => pieces.filter((p) => p.x < m - EPS || p.y < m - EPS || p.x + p.w > W - m + EPS || p.y + p.h > H - m + EPS);
const allValid = (list, W = 210, H = 297, m = 10) => list.every((sh) => !overlapsIn(sh.pieces).length && !outside(sh.pieces, W, H, m).length);
const counts = (list) => list.map((sh) => sh.pieces.length);

const SPY = () => {
  window.__print = { calls: [], blobs: [] };
  const create = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const url = create.call(this, obj);
    if (obj instanceof Blob && obj.type === 'application/pdf') window.__print.blobs.push({ url, blob: obj });
    return url;
  };
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    configurable: true,
    get() {
      const w = desc.get.call(this);
      if (w && this.classList.contains('print-frame') && !w.__spied) {
        w.__spied = true;
        const frame = this;
        w.print = () => window.__print.calls.push({ src: frame.src, type: frame.contentDocument?.contentType ?? null });
      }
      return w;
    },
  });
};

(async () => {
  const { check, report } = makeChecker('Varias hojas');
  const allErrors = [];

  // ---------- 1. Acomodar 20 piezas iguales → 3 hojas 9 + 9 + 2
  {
    const s = await open({ launch: { channel: 'chromium' }, init: [{ content: `(${SPY})()` }] });
    const p = s.page;
    const h = helpers(p);
    await addFiles(p, cards(0, 20));
    let list = await sheets(p);
    check('agregar 20: sin superposiciones ni fuera del margen, en hojas nuevas', allValid(list) && list.length === 3, JSON.stringify(counts(list)));
    check('una sola parada de Tab en la lista y grupos por hoja', (await p.locator('#piece-list [role="group"]').count()) === 3 && (await p.locator('#piece-list [tabindex="0"]').count()) === 1);
    check('encabezados de la lista: «Hoja 1» y contador', norm(await p.locator('#piece-list .group-head').first().textContent()) === 'Hoja 19 piezas' && (await p.getAttribute('#piece-list [role="group"]', 'aria-labelledby')) === (await p.locator('#piece-list .group-head').first().getAttribute('id')));
    check('cada hoja: role="group" con nombre «Hoja N de 3»', list.map((sh) => sh.group).join(' | ') === 'Hoja 1 de 3, 9 piezas | Hoja 2 de 3, 9 piezas | Hoja 3 de 3, 2 piezas', list.map((sh) => sh.group).join(' | '));
    check('etiquetas visibles «Hoja 2 de 3»', list.map((sh) => sh.label).join(',') === 'Hoja 1 de 3,Hoja 2 de 3,Hoja 3 de 3');
    for (let i = 0; i < 3; i++) {
      await p.locator('.page').nth(0).locator('.piece').first().focus();
      await p.keyboard.press('Shift+PageDown');
    }
    list = await sheets(p);
    check('desordenado (Shift+Av Pág): 6 en la hoja 1', counts(list)[0] === 6, JSON.stringify(counts(list)));
    const messy = JSON.stringify(list);
    await p.click('#arrange');
    list = await sheets(p);
    check('acomodar 20 iguales → 3 hojas 9 + 9 + 2', JSON.stringify(counts(list)) === '[9,9,2]', JSON.stringify(counts(list)));
    check('cero superposiciones y todo dentro del margen en cada hoja', allValid(list));
    check('aviso «Se acomodaron 20 piezas en 3 hojas»', (await pill(p)).text === 'Se acomodaron 20 piezas en 3 hojas', (await pill(p)).text);
    check('sin hojas vacías al final', list.every((sh) => sh.pieces.length > 0));
    const arranged = JSON.stringify(list);
    await p.click('#arrange');
    check('acomodar dos veces: mismo resultado', JSON.stringify(await sheets(p)) === arranged);
    await p.keyboard.press('Control+z');
    check('…sin paso de deshacer extra (Ctrl+Z vuelve al desorden)', JSON.stringify(await sheets(p)) === messy);
    await p.keyboard.press('Control+Shift+z');
    check('rehacer: acomodado', JSON.stringify(await sheets(p)) === arranged);

    // Vaciar la hoja 2 (sus piezas a la 1 o a hojas nuevas) → hoja vacía en el medio
    for (let i = 0; i < 9; i++) {
      const node = p.locator('.page').nth(1).locator('.piece').first();
      if (!(await node.count())) break;
      await node.focus();
      await p.keyboard.press('Shift+PageUp');
    }
    list = await sheets(p);
    const nonEmpty = list.filter((sh) => sh.pieces.length);
    check('hay una hoja vacía en el medio', list.some((sh, i) => !sh.pieces.length && i < list.length - 1), JSON.stringify(counts(list)));
    const d = await download(p);
    const info = await pdfInfo(d.file);
    check('PDF: una página por hoja con piezas (salteando las vacías)', info.pages.length === nonEmpty.length, `${info.pages.length} vs ${JSON.stringify(counts(list))}`);
    check('PDF: en orden (piezas por página)', JSON.stringify(info.pages.map((pg) => pg.xobjects)) === JSON.stringify(nonEmpty.map((sh) => new Set(sh.pieces.map((pc) => pc.name)).size)), JSON.stringify(info.pages.map((pg) => pg.xobjects)));
    check('PDF: todas A4', info.pages.every((pg) => pg.w === 210 && pg.h === 297));
    await p.click('#print');
    await p.waitForFunction(() => window.__print.calls.length === 1, null, { timeout: 20000 });
    const call = await p.evaluate(() => window.__print.calls[0]);
    check('Imprimir: print() en el iframe con el PDF', call.type === 'application/pdf', JSON.stringify(call));
    const b64 = await p.evaluate(async () => {
      const blob = window.__print.blobs.at(-1).blob;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let str = '';
      for (const b of bytes) str += String.fromCharCode(b);
      return btoa(str);
    });
    const printed = await pdfInfo(Buffer.from(b64, 'base64'));
    check('Imprimir: el mismo PDF (mismas páginas y contenido)', JSON.stringify(printed.pages) === JSON.stringify(info.pages));
    check('consejo de impresión sin cambios', /^En el diálogo de impresión, elige «Tamaño real» o «100 %» y el papel A4$/.test((await pill(p)).text), (await pill(p)).text);

    list = await sheets(p);
    const emptyIndex = list.findIndex((sh) => !sh.pieces.length);
    await p.locator('.page').nth(emptyIndex).locator('.page-remove').focus();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(100);
    check('quitar una hoja vacía: sin confirmación', !(await p.evaluate(() => document.getElementById('confirm').open)) && (await sheets(p)).length === list.length - 1);
    check('…lo anuncia y el foco va a la hoja que ocupa su lugar', (await heard(p, /Se quitó la hoja \d/)) && (await p.evaluate(() => document.activeElement.classList.contains('sheet'))));
    const withPieces = (await sheets(p)).length;
    await p.locator('.page').nth(0).locator('.page-remove').focus();
    await p.keyboard.press('Enter');
    await p.waitForSelector('#confirm[open]');
    check('con piezas: pide confirmación', norm(await p.textContent('#confirm-title')) === '¿Quitar la hoja 1?' && /^Se quita con sus \d+ piezas\. Puedes deshacerlo\.$/.test(norm(await p.textContent('#confirm-body'))), norm(await p.textContent('#confirm-body')));
    check('foco en «Quitar hoja»', (await p.evaluate(() => document.activeElement.id)) === 'confirm-ok' && norm(await p.textContent('#confirm-ok')) === 'Quitar hoja');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    check('Esc cancela y el foco vuelve al botón', (await sheets(p)).length === withPieces && (await p.evaluate(() => document.activeElement.classList.contains('page-remove'))));
    const before = await h.count();
    const onFirst = (await sheets(p))[0].pieces.length;
    await p.keyboard.press('Enter');
    await p.waitForSelector('#confirm[open]');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(150);
    check('confirmar quita la hoja con sus piezas', (await sheets(p)).length === withPieces - 1 && (await h.count()) === before - onFirst);
    await p.keyboard.press('Control+z');
    check('deshacer: vuelve la hoja con sus piezas', (await sheets(p)).length === withPieces && (await h.count()) === 20);
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 2. Agregar archivos rellena huecos y abre hoja nueva; duplicar; reducir a 1; rellenar; avisos
  {
    const s = await open();
    const p = s.page;
    const h = helpers(p);
    await addFiles(p, cards(0, 5));
    let list = await sheets(p);
    check('5 en una hoja', JSON.stringify(counts(list)) === '[5]');
    check('con una sola hoja, sin botón para quitarla', !(await p.locator('.page-remove').first().isVisible()));
    await p.click('#add-sheet');
    check('«Agregar hoja»: hoja 2 vacía y lo anuncia', JSON.stringify(counts(await sheets(p))) === '[5,0]' && (await heard(p, /Se agregó la hoja 2/)));
    check('la hoja nueva es la actual (marcada)', await p.locator('.page').nth(1).evaluate((el) => el.classList.contains('is-current')));
    await p.keyboard.press('Control+z');
    check('deshacer «Agregar hoja»', JSON.stringify(counts(await sheets(p))) === '[5]');
    const before = JSON.stringify((await sheets(p))[0].pieces);
    await addFiles(p, cards(5, 7));
    list = await sheets(p);
    check('agregar 7 con 5: rellena la hoja actual (9) y sigue en una nueva (3)', JSON.stringify(counts(list)) === '[9,3]', JSON.stringify(counts(list)));
    check('no movió lo que ya estaba', JSON.stringify(list[0].pieces.slice(0, 5)) === before);
    check('sin superposiciones ni fuera del margen', allValid(list));
    check('anuncio: hojas nuevas', await heard(p, /Se agregaron 7 archivos\. Los que no entraban en las hojas que había van en 1 hoja nueva\./), norm(await p.textContent('#live-polite')));
    await p.click('#arrange');
    const n = await pill(p);
    check('acomodar: «Reducir al NN % para usar 1 hoja»', n.text === 'Se acomodaron 12 piezas en 2 hojas' && /^Reducir al [\d,]+ % para usar 1 hoja$/.test(n.action), `${n.text} [${n.action}]`);
    await p.click('#pill-action');
    list = await sheets(p);
    check('reducir: todas en 1 hoja, sin superposiciones', list.length === 1 && list[0].pieces.length === 12 && allValid(list), JSON.stringify(counts(list)));
    await p.keyboard.press('Control+z');
    check('deshacer reducir: vuelven las 2 hojas', JSON.stringify(counts(await sheets(p))) === '[9,3]');
    await p.locator('.page').nth(0).locator('.piece').first().focus();
    const s1 = JSON.stringify((await sheets(p)).map((sh) => sh.pieces.map((pc) => [pc.x, pc.y])));
    await p.keyboard.press('d');
    list = await sheets(p);
    check('duplicar con la hoja llena: la copia va a la siguiente', JSON.stringify(counts(list)) === '[9,4]' && allValid(list), JSON.stringify(counts(list)));
    check('…y nada se movió', JSON.stringify(list.map((sh) => sh.pieces.slice(0, sh === list[1] ? 3 : 9).map((pc) => [pc.x, pc.y]))) === s1);
    check('…con foco en la copia, que se ve', (await heard(p, /Se duplicó la pieza en la hoja 2/)) && (await p.evaluate(() => document.activeElement.closest('.page')?.dataset.sheet)) === list[1].id);
    await h.openMeasures();
    await p.click('#fill-details summary');
    check('«Rellenar con copias» aclara la hoja', norm(await p.textContent('#fill-warning')) === 'Reemplaza las piezas de la hoja 2 por copias de esta. Las demás hojas no cambian. Puedes deshacerlo.' && /en la hoja 2$/.test(norm(await p.textContent('#fill-summary'))), norm(await p.textContent('#fill-summary')));
    await p.click('#fill');
    list = await sheets(p);
    check('rellenar: la hoja 1 no cambia', list[0].pieces.length === 9 && JSON.stringify(list[0].pieces.map((pc) => [pc.x, pc.y])) === JSON.stringify(JSON.parse(s1)[0]));
    check('rellenar: la hoja 2 llena de copias', list[1].pieces.length >= 8 && new Set(list[1].pieces.map((pc) => pc.name)).size === 1 && /Se rellenó la hoja 2 con/.test((await pill(p)).text), `${list[1].pieces.length} ${(await pill(p)).text}`);
    await p.locator('.page').nth(1).locator('.piece').first().focus();
    await h.setMeasure('pos-x', -20);
    await h.closePopover();
    check('aviso con la hoja: «Hoja 2: 1 pieza se sale…»', (await pill(p)).text === 'Hoja 2: 1 pieza se sale de la hoja y se corta al imprimir', (await pill(p)).text);
    await p.keyboard.press('Control+z');
    await h.openSheet();
    await p.selectOption('#paper', 'A5');
    const sizes = await p.evaluate(() => [...document.querySelectorAll('.sheet-box')].map((b) => b.style.width + 'x' + b.style.height));
    check('cambiar el papel cambia todas las hojas', new Set(sizes).size === 1 && sizes.length >= 2, sizes.join(' '));
    await p.keyboard.press('Control+z');
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 3. Arrastre entre hojas y teclado entre hojas
  {
    const s = await open();
    const p = s.page;
    await addFiles(p, cards(0, 12));
    const piece = p.locator('.page').nth(0).locator('.piece').first();
    const id = await piece.getAttribute('data-id');
    const box = await piece.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 5 });
    await p.mouse.move(box.x + box.width / 2, 885, { steps: 10 });
    // Held near the bottom edge until sheet 2 shows (past the last sheet there is room to scroll on:
    // the place to drop onto a new sheet).
    for (let i = 0; i < 200 && (await p.locator('.page').nth(1).locator('.sheet').boundingBox()).y > 300; i++) await p.waitForTimeout(16);
    check('scroll automático al arrastrar cerca del borde', (await p.evaluate(() => document.getElementById('stage').scrollTop)) > 200);
    const s2 = await p.locator('.page').nth(1).locator('.sheet').boundingBox();
    await p.mouse.move(s2.x + s2.width * 0.7, Math.min(860, s2.y + s2.height * 0.7), { steps: 8 });
    check('la hoja de destino se marca durante el arrastre', await p.locator('.page').nth(1).evaluate((el) => el.classList.contains('is-drop-target')));
    await p.mouse.up();
    await p.waitForTimeout(200);
    let list = await sheets(p);
    check('al soltar en otra hoja pasa a pertenecerle', list[1].pieces.some((pc) => pc.id === id) && JSON.stringify(counts(list)) === '[8,4]', JSON.stringify(counts(list)));
    check('sin superposiciones en la hoja de destino', list.every((sh) => !overlapsIn(sh.pieces).length));
    check('lo anuncia y la pieza conserva el foco', (await heard(p, /Se movió a la hoja 2 de 2/)) && (await p.evaluate(() => document.activeElement.dataset.id)) === id);
    check('hoja actual: la de la pieza seleccionada', await p.locator('.page').nth(1).evaluate((el) => el.classList.contains('is-current')));
    await p.keyboard.press('Control+z');
    check('deshacer el arrastre: vuelve a la hoja 1', JSON.stringify(counts(await sheets(p))) === '[9,3]');
    await p.evaluate(() => document.getElementById('stage').scrollTo(0, 0));
    const p1 = p.locator('.page').nth(0).locator('.piece').first();
    const b1 = await p1.boundingBox();
    await p.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2);
    await p.mouse.down();
    await p.mouse.move(b1.x + b1.width / 2, 885, { steps: 8 });
    await p.waitForTimeout(1600);
    const target = await p.locator('.page').nth(1).locator('.piece').first().boundingBox();
    await p.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
    const blocked = await p.evaluate(() => document.getElementById('frame').classList.contains('is-blocked'));
    await p.mouse.up();
    await p.waitForTimeout(200);
    list = await sheets(p);
    check('soltada encima de otra en la hoja 2: marca y la corre a un lugar libre (o vuelve)', blocked && list.every((sh) => !overlapsIn(sh.pieces).length), JSON.stringify({ blocked, counts: counts(list) }));
    await p.keyboard.press('Control+z');

    await p.locator('.page').nth(0).locator('.piece').nth(2).focus();
    await p.keyboard.press('PageDown');
    let a = await p.evaluate(() => ({ sheet: document.activeElement.closest('.page')?.dataset.sheet, piece: document.activeElement.classList.contains('piece') }));
    list = await sheets(p);
    check('Av Pág: foco a la primera pieza de la hoja 2', a.piece && a.sheet === list[1].id);
    await p.keyboard.press('PageDown');
    check('Av Pág en la última hoja: lo anuncia', await heard(p, /Es la última hoja/));
    await p.keyboard.press('PageUp');
    a = await p.evaluate(() => document.activeElement.closest('.page')?.dataset.sheet);
    check('Re Pág: vuelve a la hoja 1', a === list[0].id);
    const moving = await p.evaluate(() => document.activeElement.dataset.id);
    await p.keyboard.press('Shift+PageDown');
    list = await sheets(p);
    check('Shift+Av Pág: la pieza pasa a la hoja 2, a un hueco libre', list[1].pieces.some((pc) => pc.id === moving) && allValid(list) && JSON.stringify(counts(list)) === '[8,4]', JSON.stringify(counts(list)));
    check('…lo anuncia y sigue con foco', (await heard(p, /Se movió a la hoja 2 de 2/)) && (await p.evaluate(() => document.activeElement.dataset.id)) === moving);
    await p.keyboard.press('Shift+PageDown');
    list = await sheets(p);
    check('Shift+Av Pág desde la última: hoja nueva', list.length === 3 && list[2].pieces.some((pc) => pc.id === moving), JSON.stringify(counts(list)));
    await p.keyboard.press('Shift+PageUp');
    await p.keyboard.press('Shift+PageUp');
    list = await sheets(p);
    check('Shift+Re Pág ×2: vuelve a la hoja 1 (su hueco quedó libre)', list[0].pieces.some((pc) => pc.id === moving) && allValid(list), JSON.stringify(counts(list)));
    await p.keyboard.press('Shift+PageUp');
    check('Shift+Re Pág en la primera: lo anuncia', await heard(p, /Es la primera hoja/));
    for (let i = 0; i < 4; i++) await p.keyboard.press('Control+z');
    check('deshacer de a un paso cada mudanza', JSON.stringify(counts(await sheets(p))) === '[9,3]', JSON.stringify(counts(await sheets(p))));
    for (let i = 0; i < 4; i++) await p.keyboard.press('Control+Shift+z');
    check('rehacer de a un paso', (await sheets(p))[0].pieces.some((pc) => pc.id === moving));
    await p.keyboard.press('Shift+Slash');
    const rows = norm(await p.textContent('#shortcuts-rows'));
    check('atajos documentados: Re Pág / Av Pág y con Shift', /Re Pág o Av Pág/.test(rows) && /Shift\+Re Pág/.test(rows) && /Mover la pieza a la hoja anterior o a la siguiente/.test(rows), rows.slice(0, 80));
    await p.keyboard.press('Escape');
    await p.locator('#sheets .piece').first().focus();
    await p.keyboard.press('Escape');
    await p.evaluate(() => document.getElementById('stage').scrollTo(0, 99999));
    await p.waitForTimeout(200);
    check('sin selección, la hoja actual es la que más se ve', await p.locator('.page').last().evaluate((el) => el.classList.contains('is-current')));
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 4. Rendimiento: 150 piezas en 10 hojas
  {
    const s = await open({ viewport: { width: 1440, height: 900 } });
    const p = s.page;
    const tiles = Array.from({ length: 150 }, (_, i) => `tile${String(i).padStart(3, '0')}.png`);
    const t0 = Date.now();
    await addFiles(p, tiles);
    const loadMs = Date.now() - t0;
    await p.click('#arrange');
    const list = await sheets(p);
    check('150 piezas en 10 hojas', list.length === 10 && (await p.locator('#sheets .piece').count()) === 150, `${list.length} hojas · ${JSON.stringify(counts(list))} · carga ${loadMs} ms`);
    check('acomodadas sin superposiciones', allValid(list));
    const drag = await p.evaluate(async () => {
      const longs = [];
      const obs = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      obs.observe({ entryTypes: ['longtask'] });
      const node = document.querySelectorAll('.page')[4].querySelector('.piece');
      node.scrollIntoView({ block: 'center' });
      await new Promise((res) => requestAnimationFrame(res));
      const r = node.getBoundingClientRect();
      const opts = (x, y) => ({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 });
      node.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + 5, r.top + 5)));
      const times = [];
      const frames = [];
      let last = performance.now();
      for (let i = 1; i <= 120; i++) {
        const t = performance.now();
        node.dispatchEvent(new PointerEvent('pointermove', opts(r.left + 5 + i * 2, r.top + 5 + i * 3)));
        times.push(performance.now() - t);
        await new Promise((res) => requestAnimationFrame(res));
        const now = performance.now();
        frames.push(now - last);
        last = now;
      }
      const moved = document.getElementById('drag-layer').contains(node);
      const t = performance.now();
      node.dispatchEvent(new PointerEvent('pointerup', opts(r.left + 245, r.top + 365)));
      const up = performance.now() - t;
      await new Promise((res) => setTimeout(res, 100));
      obs.disconnect();
      times.sort((a, b) => a - b);
      frames.sort((a, b) => a - b);
      return { moved, median: times[60], p95: times[114], max: times.at(-1), frameP95: frames[114], up, longs };
    });
    check('arrastre con 150 piezas: el gesto realmente arrastra (capa de arrastre)', drag.moved, JSON.stringify(drag));
    check('arrastre: cada movimiento < 1 ms (p95); cuadros p95 < 34 ms', drag.p95 < 1 && drag.frameP95 < 34, JSON.stringify(drag));
    check('arrastre: soltar (con render completo) < 50 ms y sin tareas largas', drag.up < 50 && drag.longs.filter((x) => x > 50).length === 0, JSON.stringify({ up: drag.up, longs: drag.longs }));
    const scroll = await p.evaluate(async () => {
      const stage = document.getElementById('stage');
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      stage.scrollTop = 0;
      const longs = [];
      const obs = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      obs.observe({ entryTypes: ['longtask'] });
      const gaps = [];
      let last = performance.now();
      for (let i = 0; i < 90; i++) {
        stage.scrollTop += 80;
        await new Promise((res) => requestAnimationFrame(res));
        const now = performance.now();
        gaps.push(now - last);
        last = now;
      }
      obs.disconnect();
      gaps.sort((a, b) => a - b);
      return { median: gaps[45], p95: gaps[85], max: gaps.at(-1), longs, current: document.querySelector('.page.is-current')?.querySelector('.page-label').textContent };
    });
    check('scroll con 10 hojas: cuadros de ~16 ms (p95 < 34 ms), sin tareas largas', scroll.p95 < 34 && scroll.longs.filter((x) => x > 50).length === 0, JSON.stringify(scroll));
    check('al hacer scroll (sin selección) se marca la hoja actual', /^Hoja (9|10) de 10$/.test(scroll.current), scroll.current);
    const sel = await p.evaluate(async () => {
      const nodes = document.querySelectorAll('#sheets .piece');
      const times = [];
      for (let i = 0; i < 10; i++) {
        const t = performance.now();
        nodes[i * 13].focus();
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      return { median: times[5], max: times.at(-1) };
    });
    check('seleccionar una pieza (render completo) con 150: < 30 ms', sel.median < 30, JSON.stringify(sel));
    // Zooming with Ctrl + wheel (one turn a frame, in and out): no long tasks, frames ~16 ms.
    const zoom = await p.evaluate(async () => {
      const stage = document.getElementById('stage');
      const r = stage.getBoundingClientRect();
      const longs = [];
      const obs = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      obs.observe({ entryTypes: ['longtask'] });
      const gaps = [];
      let last = performance.now();
      for (let i = 0; i < 40; i++) {
        const deltaY = i < 20 ? -40 : 40;
        stage.dispatchEvent(new WheelEvent('wheel', { deltaY, ctrlKey: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
        await new Promise((res) => requestAnimationFrame(res));
        const now = performance.now();
        gaps.push(now - last);
        last = now;
      }
      await new Promise((res) => setTimeout(res, 100));
      obs.disconnect();
      gaps.sort((a, b) => a - b);
      return { median: gaps[20], p95: gaps[37], max: gaps.at(-1), longs };
    });
    check('zoom con 150 piezas: cuadros p95 < 34 ms, sin tareas largas', zoom.p95 < 34 && zoom.longs.filter((x) => x > 50).length === 0, JSON.stringify(zoom));
    // Dragging at 200 % and out of the sheets (the new-sheet placeholders): still < 1 ms a move.
    await p.click('#zoom-level');
    await p.click('#zoom-menu-level-200');
    const dragZoomed = await p.evaluate(async () => {
      const longs = [];
      const obs = new PerformanceObserver((l) => longs.push(...l.getEntries().map((e) => e.duration)));
      obs.observe({ entryTypes: ['longtask'] });
      const node = document.querySelectorAll('.page')[4].querySelector('.piece');
      node.scrollIntoView({ block: 'center', inline: 'center' });
      await new Promise((res) => requestAnimationFrame(res));
      const r = node.getBoundingClientRect();
      const sheet = node.closest('.sheet').getBoundingClientRect();
      const opts = (x, y) => ({ bubbles: true, cancelable: true, pointerId: 8, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: 1 });
      node.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + 5, r.top + 5)));
      const times = [];
      // Inside the sheet, then out past its left edge (outside every sheet).
      const to = (i) => (i < 60 ? [r.left + 5 + i * 2, r.top + 5 + i] : [r.left + 5 - (i - 60) * ((r.left - sheet.left + 400) / 60), r.top + 65]);
      for (let i = 1; i <= 120; i++) {
        const [x, y] = to(i);
        const t = performance.now();
        node.dispatchEvent(new PointerEvent('pointermove', opts(x, y)));
        times.push(performance.now() - t);
        await new Promise((res) => requestAnimationFrame(res));
      }
      const outside = !document.getElementById('new-sheet-end').hidden;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      node.dispatchEvent(new PointerEvent('pointerup', opts(r.left, r.top)));
      await new Promise((res) => setTimeout(res, 100));
      obs.disconnect();
      times.sort((a, b) => a - b);
      return { median: times[60], p95: times[114], max: times.at(-1), outside, longs };
    });
    check('arrastre a 200 % y fuera de las hojas (con los lugares para una hoja nueva): < 1 ms (p95), sin tareas largas', dragZoomed.outside && dragZoomed.p95 < 1 && dragZoomed.longs.filter((x) => x > 50).length === 0, JSON.stringify(dragZoomed));
    fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify({ loadMs, drag, scroll, sel, zoom, dragZoomed }, null, 2));
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  check('sin errores de consola', allErrors.length === 0, allErrors.join(' | '));
  const failures = report();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
