// D. Proyectos: guardado automático y restauración, exportar igual tras recargar, nombre,
// diálogo (nuevo, abrir, duplicar, renombrar, eliminar), alternar sin mezclar ni perder
// memoria, dos pestañas, sin almacenamiento, proyecto dañado y cuota excedida.
const { open, launch, makeChecker, helpers, norm, addFiles, pill, pdfInfo, download, heard, ready, BASE } = require('../lib/sheets.cjs');

const labels = (p) => p.evaluate(() => [...document.querySelectorAll('#sheets .page')].map((pg) => pg.dataset.sheet + ':' + [...pg.querySelectorAll('.piece')].map((n) => n.getAttribute('aria-label')).join(' | ')));
const status = (p) => p.textContent('#project-status-text');
const saved = (p) => p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });

const TRACK = () => {
  const live = new Set();
  const create = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  URL.createObjectURL = function (obj) {
    const url = create.call(this, obj);
    live.add(url);
    return url;
  };
  URL.revokeObjectURL = function (url) {
    live.delete(url);
    return revoke.call(this, url);
  };
  window.__urls = () => live.size;
  window.__persist = 0;
  if (navigator.storage?.persist) {
    const persist = navigator.storage.persist.bind(navigator.storage);
    navigator.storage.persist = () => {
      window.__persist++;
      return persist();
    };
  }
};

(async () => {
  const { check, report } = makeChecker('D. Proyectos');
  const allErrors = [];

  // ---------- 1. Guardado automático, restauración y exportar igual
  {
    const s = await open({ init: [{ content: `(${TRACK})()` }] });
    const p = s.page;
    const h = helpers(p);
    const requests = [];
    p.on('request', (r) => requests.push(r.url()));
    check('primera vez: proyecto «Sin título», guardado', norm(await p.textContent('#project-name-text')) === 'Sin título' && (await status(p)) === 'Guardado');
    check('nombre en la barra con nombre accesible', (await p.getAttribute('#project-name', 'aria-label')) === 'Sin título: cambiar el nombre' && (await p.getAttribute('#project-name', 'aria-describedby')) === 'project-status-text');
    await addFiles(p, ['card00.png', 'twopage.pdf', 'exif6.jpg', 'rotated.pdf']);
    await saved(p);
    check('archivos agregados: se guardan enseguida', (await status(p)) === 'Guardado');
    await p.locator('#sheets .piece').first().focus();
    await p.keyboard.press('ArrowDown');
    check('después de un cambio: «Guardando…»', (await status(p)) === 'Guardando…');
    await p.waitForTimeout(600);
    check('…sigue esperando (~1 s desde el último cambio)', (await status(p)) === 'Guardando…');
    await saved(p);
    check('~1 s después: «Guardado»', (await status(p)) === 'Guardado');
    await p.keyboard.press('Control+z');
    await saved(p);
    await p.locator('.piece[aria-label^="twopage.pdf"]').focus();
    await h.openMeasures();
    await p.selectOption('#page', '2');
    await p.waitForFunction(() => document.getElementById('page').value === '2' && !document.getElementById('page').disabled);
    await p.keyboard.press('Shift+PageDown');
    await h.openSheet();
    await p.selectOption('#paper', 'custom');
    await p.fill('#paper-w', '300');
    await p.fill('#paper-h', '250');
    await p.keyboard.press('Enter');
    await p.fill('#margin', '8');
    await p.keyboard.press('Enter');
    await p.fill('#gap', '3');
    await p.keyboard.press('Enter');
    await p.click('#allow-rotate');
    await p.click('#project-name');
    await p.fill('#project-name-input', 'Tarjetas  de prueba ');
    await p.keyboard.press('Enter');
    check('cambiar el nombre en el lugar (Enter) y lo anuncia', norm(await p.textContent('#project-name-text')) === 'Tarjetas de prueba' && (await heard(p, /Ahora se llama «Tarjetas de prueba»/)) && (await p.evaluate(() => document.activeElement.id)) === 'project-name');
    await p.keyboard.press('Enter');
    await p.fill('#project-name-input', 'otro');
    await p.keyboard.press('Escape');
    check('Esc cancela el cambio de nombre', norm(await p.textContent('#project-name-text')) === 'Tarjetas de prueba' && (await p.isVisible('#project-name')));
    await saved(p);
    const before = await labels(p);
    const pdfBefore = await pdfInfo((await download(p)).file);
    const settingsOf = async () => ({ paper: norm(await p.textContent('#paper-label')), margin: await p.inputValue('#margin'), gap: await p.inputValue('#gap'), rotate: await p.isChecked('#allow-rotate'), landscape: await p.isChecked('#landscape') });
    const settingsBefore = await settingsOf();
    await p.waitForTimeout(1300);
    requests.length = 0;
    await p.reload();
    await ready(p);
    const after = await labels(p);
    check('restaura piezas, hojas y posiciones', JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after));
    check('restaura el nombre', norm(await p.textContent('#project-name-text')) === 'Tarjetas de prueba');
    const settingsAfter = await settingsOf();
    check('restaura papel, orientación, margen, separación y «Girar si conviene»', JSON.stringify(settingsAfter) === JSON.stringify(settingsBefore), JSON.stringify(settingsAfter));
    check('el PDF en la página 2 se restaura sin cargar pdf.js', after.join(' ').includes('twopage.pdf (página 2)') && !requests.some((u) => /pdfjs-dist|pdf\.worker/.test(u)), requests.filter((u) => /pdf/.test(u)).join(' '));
    const exif = await p.evaluate(async () => {
      const img = document.querySelector('.piece[aria-label^="exif6.jpg"] img');
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return { size: [img.naturalWidth, img.naturalHeight], top: [...ctx.getImageData(c.width / 2, 40, 1, 1).data].slice(0, 3) };
    });
    check('imagen con EXIF: vista previa restaurada con la orientación', exif.size[1] > exif.size[0] && exif.top[0] > 150 && exif.top[1] < 80, JSON.stringify(exif));
    check('deshacer empieza vacío al abrir', await p.isDisabled('#undo'));
    const pdfAfter = await pdfInfo((await download(p)).file);
    check('exportar tras restaurar da el mismo PDF (páginas, contenido e imágenes)', JSON.stringify(pdfAfter.pages) === JSON.stringify(pdfBefore.pages), JSON.stringify([pdfBefore.pages.map((x) => x.content), pdfAfter.pages.map((x) => x.content)]));
    check('…y el mismo título', pdfAfter.title === pdfBefore.title, pdfAfter.title);
    await p.locator('.piece[aria-label^="twopage.pdf"]').focus();
    await h.openMeasures();
    await p.selectOption('#page', '1');
    await p.waitForFunction(() => document.getElementById('page').value === '1' && !document.getElementById('page').disabled);
    check('cambiar de página tras restaurar: carga pdf.js y funciona', requests.some((u) => /pdfjs-dist/.test(u)) && (await labels(p)).join(' ').includes('twopage.pdf (página 1)'));
    check('se pidió almacenamiento persistente (a lo sumo una vez por sesión)', (await p.evaluate(() => window.__persist)) <= 1);
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 1b. Cerrar o recargar justo después de un cambio (antes del guardado automático)
  {
    const s = await open();
    const p = s.page;
    await addFiles(p, ['card10.png']);
    await saved(p);
    await p.locator('#sheets .piece').first().focus();
    for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowRight');
    const moved = await p.locator('#sheets .piece').first().getAttribute('aria-label');
    await p.reload(); // enseguida: el guardado de ~1 s todavía no salió
    await ready(p);
    check('recargar enseguida después de mover: se conserva (diario de último momento)', (await p.locator('#sheets .piece').first().getAttribute('aria-label')) === moved, await p.locator('#sheets .piece').first().getAttribute('aria-label'));
    check('…y queda guardado de verdad', await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado').then(() => true, () => false));
    await addFiles(p, ['card11.png']);
    await p.reload(); // enseguida después de agregar
    await ready(p);
    check('recargar enseguida después de agregar: el archivo nuevo está', (await p.locator('#sheets .piece').count()) === 2);
    check('sin errores de consola', s.errors.length === 0, s.errors.join(' | '));
    await s.browser.close();
  }

  // ---------- 2. Diálogo de proyectos, nuevo, duplicar, renombrar, eliminar, alternar
  {
    const s = await open({ init: [{ content: `(${TRACK})()` }] });
    const p = s.page;
    const h = helpers(p);
    const cards = () => p.evaluate(() => [...document.querySelectorAll('.project-card')].map((c) => ({ id: c.dataset.id, name: c.querySelector('.project-title').textContent, meta: c.querySelector('.project-meta').textContent.replace(/ /g, ' '), current: c.classList.contains('is-current'), thumb: !!c.querySelector('.project-thumb img') })));
    await addFiles(p, ['card01.png', 'card02.png']);
    await p.click('#project-name');
    await p.fill('#project-name-input', 'Proyecto A');
    await p.keyboard.press('Enter');
    await saved(p);
    await p.waitForTimeout(300);
    const aLabels = await labels(p);
    await p.locator('#sheets .piece').first().focus();
    await p.keyboard.press('Control+o');
    await p.waitForSelector('#projects[open]');
    let list = await cards();
    check('Ctrl+O abre «Proyectos» con el foco en «Nuevo proyecto»', (await p.evaluate(() => document.activeElement.id)) === 'project-new');
    check('lista: el abierto, con miniatura, fecha relativa, hojas y piezas', list.length === 1 && list[0].current && list[0].thumb && list[0].meta === 'ahora · 1 hoja · 2 piezas', JSON.stringify(list));
    check('estado vacío: explica que puedes empezar otro sin perder este', (await p.isVisible('#projects-empty')) && /queda guardado/.test(await p.textContent('#projects-empty')));
    check('espacio usado', /^Usas .+ en este navegador$/.test(norm(await p.textContent('#projects-usage'))), norm(await p.textContent('#projects-usage')));
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => !document.getElementById('projects').open);
    await p.waitForFunction(() => document.getElementById('project-name-text').textContent === 'Sin título');
    check('«Nuevo proyecto»: en blanco, «Sin título», y lo anuncia', (await h.count()) === 0 && (await heard(p, /Se creó un proyecto nuevo\. «Proyecto A» quedó guardado\./)));
    check('el foco va a la hoja (zona para soltar)', (await p.evaluate(() => document.activeElement.id)) === 'empty');
    check('«Quitar todas» sigue aparte (deshabilitado sin piezas)', await p.isDisabled('#clear'));
    await saved(p);
    await addFiles(p, ['card03.png', 'card04.png', 'card05.png']);
    await p.click('#project-name');
    await p.fill('#project-name-input', 'Proyecto B');
    await p.keyboard.press('Enter');
    await saved(p);
    await p.click('#projects-open');
    await p.waitForSelector('#projects[open]');
    list = await cards();
    check('dos proyectos, del más reciente al más viejo', list.map((c) => c.name).join(',') === 'Proyecto B,Proyecto A' && list[0].current && !(await p.isVisible('#projects-empty')), JSON.stringify(list));
    await p.locator('.project-card').first().locator('.project-open').focus();
    await p.keyboard.press('ArrowDown');
    check('↓ pasa a la tarjeta siguiente', (await p.evaluate(() => document.activeElement.closest('.project-card')?.querySelector('.project-title').textContent)) === 'Proyecto A');
    await p.keyboard.press('Home');
    check('Inicio vuelve a la primera', (await p.evaluate(() => document.activeElement.closest('.project-card')?.querySelector('.project-title').textContent)) === 'Proyecto B');
    await p.keyboard.press('End');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.getElementById('project-name-text').textContent === 'Proyecto A');
    await p.waitForTimeout(200);
    check('abrir A: sus piezas, no las de B', JSON.stringify(await labels(p)) === JSON.stringify(aLabels));
    check('abrir A: deshacer empieza vacío', await p.isDisabled('#undo'));
    check('abrir A: lo anuncia', await heard(p, /Se abrió «Proyecto A»/));
    await p.click('#projects-open');
    await p.waitForSelector('#projects[open]');
    await p.locator('.project-card', { hasText: 'Proyecto A' }).locator('[data-act="duplicate"]').click();
    await p.waitForFunction(() => document.querySelectorAll('.project-card').length === 3);
    list = await cards();
    check('duplicar: «Proyecto A (copia)» con el foco en ella', list.some((c) => c.name === 'Proyecto A (copia)') && (await p.evaluate(() => document.activeElement.closest('.project-card')?.querySelector('.project-title').textContent)) === 'Proyecto A (copia)', JSON.stringify(list.map((c) => c.name)));
    await p.locator('.project-card', { hasText: 'Proyecto A (copia)' }).locator('[data-act="rename"]').click();
    await p.fill('.project-title-input', 'Proyecto C');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => [...document.querySelectorAll('.project-title')].some((t) => t.textContent === 'Proyecto C'));
    check('renombrar desde la tarjeta y el foco vuelve a «Cambiar el nombre»', (await p.evaluate(() => document.activeElement.dataset.act)) === 'rename');
    await p.keyboard.press('Enter');
    await p.fill('.project-title-input', 'nada');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(150);
    check('Esc cancela el cambio de nombre (y no cierra el diálogo)', (await p.evaluate(() => document.getElementById('projects').open)) && (await cards()).some((c) => c.name === 'Proyecto C') && !(await cards()).some((c) => c.name === 'nada'));
    await p.locator('.project-card', { hasText: 'Proyecto C' }).locator('.project-open').click();
    await p.waitForFunction(() => document.getElementById('project-name-text').textContent === 'Proyecto C');
    check('la copia tiene las piezas de A', JSON.stringify((await labels(p)).map((l) => l.replace(/^\d+:/, ''))) === JSON.stringify(aLabels.map((l) => l.replace(/^\d+:/, ''))));
    await p.click('#projects-open');
    await p.waitForSelector('#projects[open]');
    await p.locator('.project-card', { hasText: 'Proyecto B' }).locator('[data-act="delete"]').click();
    await p.waitForSelector('#confirm[open]');
    check('eliminar: confirmación explícita, irreversible, foco en «Cancelar»', norm(await p.textContent('#confirm-title')) === '¿Eliminar «Proyecto B»?' && /No se puede deshacer/.test(await p.textContent('#confirm-body')) && (await p.evaluate(() => document.activeElement.id)) === 'confirm-cancel');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);
    check('Esc cancela: sigue B y el diálogo de proyectos abierto', (await cards()).some((c) => c.name === 'Proyecto B') && (await p.evaluate(() => document.getElementById('projects').open)));
    const undoBefore = await p.isDisabled('#undo');
    await p.locator('.project-card', { hasText: 'Proyecto B' }).locator('[data-act="delete"]').click();
    await p.waitForSelector('#confirm[open]');
    await p.click('#confirm-ok');
    await p.waitForFunction(() => ![...document.querySelectorAll('.project-title')].some((t) => t.textContent === 'Proyecto B'));
    check('eliminar B: desaparece y lo anuncia', await heard(p, /Se eliminó «Proyecto B»/));
    check('eliminar no entra en el deshacer', (await p.isDisabled('#undo')) === undoBefore);
    await p.locator('.project-card.is-current').locator('[data-act="delete"]').click();
    await p.waitForSelector('#confirm[open]');
    await p.click('#confirm-ok');
    await p.waitForFunction(() => document.getElementById('project-name-text').textContent === 'Proyecto A');
    check('eliminar el abierto: pasa al que queda (A)', JSON.stringify(await labels(p)) === JSON.stringify(aLabels));
    await p.keyboard.press('Escape');
    await p.keyboard.press('Control+o');
    await p.waitForSelector('#projects[open]');
    await p.click('#project-new');
    await p.waitForFunction(() => document.getElementById('project-name-text').textContent === 'Sin título' && !document.querySelector('#sheets .piece'));
    await saved(p);
    await addFiles(p, ['twopage.pdf', 'card06.png']);
    await saved(p);
    const ids = await p.evaluate(async () => {
      const req = indexedDB.open('pliego');
      return new Promise((resolve) => (req.onsuccess = () => (req.result.transaction('projects').objectStore('projects').getAllKeys().onsuccess = (e) => resolve(e.target.result))));
    });
    const openById = async (id) => {
      await p.keyboard.press('Control+o');
      await p.waitForSelector('#projects[open]');
      const card = p.locator(`.project-card[data-id="${id}"] .project-open`);
      if (await card.evaluate((el) => el.closest('.project-card').classList.contains('is-current'))) {
        await p.keyboard.press('Escape');
        return;
      }
      await card.click();
      await p.waitForFunction((i) => localStorage.getItem('last-project') === i && !document.getElementById('projects').open, id);
      await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado');
    };
    const [x, y] = ids;
    await openById(x);
    const xLabels = await labels(p);
    await openById(y);
    const yLabels = await labels(p);
    const baseline = await p.evaluate(() => window.__urls());
    let mixed = false;
    for (let i = 0; i < 5; i++) {
      await openById(x);
      if (JSON.stringify(await labels(p)) !== JSON.stringify(xLabels)) mixed = true;
      await openById(y);
      if (JSON.stringify(await labels(p)) !== JSON.stringify(yLabels)) mixed = true;
    }
    const end = await p.evaluate(() => window.__urls());
    check('alternar 10 veces: cada proyecto con lo suyo', !mixed && JSON.stringify(xLabels) !== JSON.stringify(yLabels));
    check('alternar 10 veces: sin acumular URL de objeto (se liberan al cerrar)', end <= baseline, `${baseline} → ${end}`);
    allErrors.push(...s.errors);
    await s.browser.close();
  }

  // ---------- 3. Dos pestañas
  {
    const browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    const tab = async () => {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(e.message));
      await p.goto(BASE);
      await ready(p);
      return p;
    };
    const a = await tab();
    await addFiles(a, ['card07.png']);
    await saved(a);
    await a.locator('#sheets .piece').first().focus();
    await a.keyboard.press('ArrowRight');
    const b = await tab();
    await b.waitForTimeout(300);
    check('dos pestañas: la nueva abre lo último (la vieja guardó lo pendiente antes)', /a 11\smm del borde izquierdo/.test(await b.locator('#sheets .piece').first().getAttribute('aria-label')), await b.locator('#sheets .piece').first().getAttribute('aria-label'));
    const pa = await pill(a);
    check('la vieja avisa y deja de guardar', pa.text === 'Este proyecto se abrió en otra pestaña. Aquí ya no se guardan los cambios.' && pa.action === 'Editar aquí' && (await status(a)) === 'Sin guardar');
    await a.locator('#sheets .piece').first().focus();
    await a.keyboard.press('ArrowRight');
    await a.waitForTimeout(1500);
    await b.locator('#sheets .piece').first().focus();
    await b.keyboard.press('ArrowDown');
    await saved(b);
    const stored = await b.evaluate(async () => {
      const id = localStorage.getItem('last-project');
      const req = indexedDB.open('pliego');
      return new Promise((resolve) => (req.onsuccess = () => (req.result.transaction('projects').objectStore('projects').get(id).onsuccess = (e) => resolve(e.target.result.doc.items[0]))));
    });
    check('lo editado en la vieja no pisa lo guardado por la nueva', stored.x === 11 && stored.y === 11, JSON.stringify(stored));
    await a.click('#project-retry');
    await a.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado');
    check('«Editar aquí»: la vieja recarga lo último y vuelve a guardar', /a 11\smm del borde izquierdo y 11\smm del superior/.test(await a.locator('#sheets .piece').first().getAttribute('aria-label')));
    check('…y ahora la otra es la que avisa', (await pill(b)).text === 'Este proyecto se abrió en otra pestaña. Aquí ya no se guardan los cambios.' && (await status(b)) === 'Sin guardar');
    check('dos pestañas: sin errores', errors.length === 0, errors.join(' | '));
    await browser.close();
  }

  // ---------- 4. Sin almacenamiento (p. ej. modo privado)
  {
    const s = await open({ init: [{ content: `Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })` }] });
    const p = s.page;
    const n = await pill(p);
    check('sin IndexedDB: la app funciona y lo avisa una vez', n.text === 'Este navegador no permite guardar proyectos (por ejemplo, en una ventana privada). Lo que hagas se pierde al cerrar la pestaña.' && (await status(p)) === 'Sin guardar');
    await addFiles(p, ['card08.png']);
    const d = await download(p);
    check('sin IndexedDB: agregar y descargar siguen', d.name === 'pliego-a4.pdf');
    await p.keyboard.press('Control+o');
    await p.waitForSelector('#projects[open]');
    check('el diálogo lo explica y no lista nada', (await p.isVisible('#projects-unavailable')) && (await p.locator('.project-card').count()) === 0);
    await p.keyboard.press('Escape');
    check('sin errores de consola', s.errors.length === 0, s.errors.join(' | '));
    await s.browser.close();
  }

  // ---------- 5. Cuota excedida y proyecto dañado
  {
    const s = await open({
      init: [
        {
          content: `(() => {
            const put = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...args) {
              if (window.__full && this.name === 'files') throw new DOMException('lleno', 'QuotaExceededError');
              return put.apply(this, args);
            };
          })()`,
        },
      ],
    });
    const p = s.page;
    await p.evaluate(() => (window.__full = true));
    await addFiles(p, ['card09.png']);
    await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'No se guardó', null, { timeout: 8000 });
    const n = await pill(p);
    check('cuota excedida: «No se guardó» con «Reintentar» y aviso con «Ver proyectos»', (await p.isVisible('#project-retry')) && n.text === 'No hay espacio para guardar el proyecto. Elimina proyectos que no uses y vuelve a intentarlo.' && n.action === 'Ver proyectos');
    check('el error se anuncia', await heard(p, /No hay espacio para guardar el proyecto/));
    await p.evaluate(() => (window.__full = false));
    await p.click('#project-retry');
    await saved(p);
    check('«Reintentar» guarda y lo anuncia', await heard(p, /Se guardó el proyecto/));
    await p.evaluate(async () => {
      const id = localStorage.getItem('last-project');
      const req = indexedDB.open('pliego');
      await new Promise((resolve) => {
        req.onsuccess = () => {
          const tx = req.result.transaction('projects', 'readwrite');
          const store = tx.objectStore('projects');
          store.get(id).onsuccess = (e) => {
            const r = e.target.result;
            r.doc.sheets = 'roto';
            store.put(r);
          };
          tx.oncomplete = () => resolve();
        };
      });
    });
    await p.reload();
    await ready(p);
    const n2 = await pill(p);
    check('proyecto dañado: la app abre igual (uno nuevo) y ofrece eliminarlo', n2.text === 'No se pudo abrir «Sin título» porque sus datos están dañados' && n2.action === 'Eliminar' && (await p.locator('#sheets .piece').count()) === 0, JSON.stringify(n2));
    await p.keyboard.press('Control+o');
    await p.waitForSelector('#projects[open]');
    const damaged = p.locator('.project-card.is-damaged');
    check('en la lista: marcado «Dañado», sin abrir, con Eliminar', (await damaged.count()) === 1 && (await damaged.locator('.project-open').isDisabled()) && (await damaged.locator('[data-act="delete"]').isEnabled()) && norm(await damaged.locator('.project-badge').textContent()) === 'Dañado');
    await damaged.locator('[data-act="delete"]').click();
    await p.waitForSelector('#confirm[open]');
    await p.click('#confirm-ok');
    await p.waitForFunction(() => !document.querySelector('.project-card.is-damaged'));
    check('se puede eliminar el dañado', (await p.locator('.project-card').count()) === 1);
    check('sin errores de consola (salvo los del guardado forzado a fallar)', s.errors.filter((e) => !/QuotaExceeded|lleno|guardar/.test(e)).length === 0, s.errors.join(' | '));
    await s.browser.close();
  }

  check('sin errores de consola', allErrors.length === 0, allErrors.join(' | '));
  const failures = report();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
