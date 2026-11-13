// Data saved before the app was renamed (database «pliego», keys without a
// prefix, fixtures/legacy-pliego.json, made with the old app) moves to the
// «scooch» namespace on the first start: the projects open as they were and
// the preferences apply. Also with browsers that can't list databases, and
// without leaving an empty «pliego» database behind when there was none.
const { launch, makeChecker, BASE, FIX, path, fs } = require('../lib/base.cjs');

const LEGACY = JSON.parse(fs.readFileSync(path.join(FIX, 'legacy-pliego.json'), 'utf8'));
const SEED = new URL('__seed', BASE).href;

// Writes the legacy database and keys on the app's origin, before the app runs.
const seed = (legacy) =>
  (async () => {
    const decode = (v) => {
      if (v && typeof v === 'object' && '$blob' in v) return new Blob([Uint8Array.from(atob(v.$blob), (c) => c.charCodeAt(0))], { type: v.type });
      if (Array.isArray(v)) return v.map(decode);
      if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
      return v;
    };
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pliego', legacy.version);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('projects', { keyPath: 'id' });
        request.result.createObjectStore('files', { keyPath: ['project', 'key'] }).createIndex('project', 'project');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'files'], 'readwrite');
      for (const record of decode(legacy.projects)) tx.objectStore('projects').put(record);
      for (const row of decode(legacy.files)) tx.objectStore('files').put(row);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    for (const [key, value] of Object.entries(legacy.storage)) localStorage.setItem(key, value);
  })();

// What's saved now, read straight from the browser.
const saved = () =>
  (async () => {
    const names = (await (window.__databases ?? indexedDB.databases.bind(indexedDB))()).map((d) => d.name);
    const read = (name) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['projects', 'files']);
          const out = {};
          tx.objectStore('projects').getAll().onsuccess = (e) => (out.projects = e.target.result.map((r) => ({ id: r.id, name: r.name, thumb: r.thumb instanceof Blob })));
          tx.objectStore('files').getAllKeys().onsuccess = (e) => (out.files = e.target.result.length);
          tx.oncomplete = () => {
            db.close();
            resolve(out);
          };
        };
        request.onerror = () => reject(request.error);
      });
    return { names, scooch: names.includes('scooch') ? await read('scooch') : null, storage: { ...localStorage } };
  })();

async function start({ legacy = LEGACY, hideDatabases = false } = {}) {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
  // Browsers without indexedDB.databases(): the app has to find out by opening.
  if (hideDatabases)
    await context.addInitScript(() => {
      window.__databases = IDBFactory.prototype.databases && indexedDB.databases.bind(indexedDB);
      delete IDBFactory.prototype.databases;
    });
  await context.route(SEED, (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>seed</title>' }));
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  if (legacy) {
    await page.goto(SEED);
    await page.evaluate(`(${seed.toString()})(${JSON.stringify(legacy)})`);
  }
  await page.goto(BASE);
  await page.waitForFunction(() => !document.body.classList.contains('is-loading'), null, { timeout: 20000 });
  return { browser, page, errors };
}

const readSaved = (page) => page.evaluate(`(${saved.toString()})()`);

(async () => {
  const { check, report } = makeChecker('Datos guardados con el nombre anterior');
  const errors = [];
  const legacyIds = LEGACY.projects.map((r) => r.id).sort();

  for (const hideDatabases of [false, true]) {
    const tag = hideDatabases ? 'sin indexedDB.databases()' : 'con indexedDB.databases()';
    const { browser, page: p, errors: pageErrors } = await start({ hideDatabases });
    try {
      await p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado');
      const doc = await p.evaluate(() => ({
        name: document.getElementById('project-name-text').textContent,
        pieces: [...document.querySelectorAll('#sheets .piece')].map((n) => ({ name: n.getAttribute('aria-label').split(',')[0], loaded: n.querySelector('img').naturalWidth > 0 })),
        unit: document.getElementById('margin-unit').textContent,
        grid: document.getElementById('grid-show').checked && document.querySelector('#grid-chips input:checked')?.value,
        overlap: document.getElementById('allow-overlap').checked,
        arrange: document.querySelector('button[aria-controls="section-arrange"]').getAttribute('aria-expanded'),
      }));
      check(`${tag}: se abre el último proyecto, con sus piezas`, doc.name === 'Tarjetas viejas' && doc.pieces.map((q) => q.name).join() === 'card00.png,card01.png,rotated.pdf' && doc.pieces.every((q) => q.loaded), JSON.stringify(doc));
      check(`${tag}: las preferencias siguen (centímetros, grilla de 5 mm, superponer, sección plegada)`, /centímetros/.test(doc.unit) && doc.grid === '5' && doc.overlap && doc.arrange === 'false', JSON.stringify(doc));
      await p.click('#prefs-open');
      await p.waitForSelector('#prefs[open] #single-keys');
      check(`${tag}: «Atajos de 1 tecla» sigue apagado`, await p.evaluate(() => !document.getElementById('single-keys').checked && document.querySelector('#prefs input[name="unit"]:checked').value === 'cm'));
      await p.keyboard.press('Escape');
      await p.click('#projects-open');
      await p.waitForSelector('#projects[open] .project-card img');
      const cards = await p.evaluate(() => [...document.querySelectorAll('.project-card')].map((c) => `${c.querySelector('.project-title').textContent}${c.classList.contains('is-current') ? '*' : ''}`).sort());
      check(`${tag}: los dos proyectos están en «Proyectos»`, cards.join() === 'Segundo,Tarjetas viejas*', cards.join());
      await p.locator('.project-card', { hasText: 'Segundo' }).locator('[data-act="open"]').click();
      await p.waitForFunction(() => document.getElementById('project-name-text').textContent === 'Segundo');
      await p.waitForFunction(() => [...document.querySelectorAll('#sheets .piece img')].every((i) => i.naturalWidth > 0) && document.querySelectorAll('#sheets .piece').length === 1);
      check(`${tag}: el otro proyecto también abre`, true);
      await p.selectOption('#paper', 'custom');
      check(`${tag}: el papel personalizado se recuerda`, (await p.evaluate(() => [document.getElementById('paper-w').value, document.getElementById('paper-h').value].join('×'))) === '12,3×17');

      const now = await readSaved(p);
      const moved = Object.entries(LEGACY.storage).every(([k, v]) => now.storage[`scooch:${k}`] === v || k === 'last-project');
      check(`${tag}: la base «pliego» ya no está; «scooch» tiene los proyectos y sus archivos`, !now.names.includes('pliego') && now.scooch.projects.map((r) => r.id).sort().join() === legacyIds.join() && now.scooch.projects.every((r) => r.thumb) && now.scooch.files >= LEGACY.files.length, JSON.stringify(now));
      check(`${tag}: las claves pasan a «scooch:…» y las viejas se borran`, moved && Object.keys(LEGACY.storage).every((k) => !(k in now.storage)) && now.storage['scooch:migrated'] === '1', JSON.stringify(now.storage));

      // Starting again moves nothing twice.
      await p.evaluate(() => localStorage.setItem('unit-preference', 'in'));
      await p.reload();
      await p.waitForFunction(() => !document.body.classList.contains('is-loading'));
      const again = await readSaved(p);
      check(`${tag}: al volver a abrir no se duplica nada ni se vuelve a mover`, again.scooch.projects.length === LEGACY.projects.length && again.storage['scooch:unit-preference'] === 'cm' && again.storage['unit-preference'] === 'in' && (await p.textContent('#project-name-text')) === 'Segundo', JSON.stringify(again));
      // The donation dialog stays dismissed.
      await p.goto(`${BASE}?donar=${encodeURIComponent('https://www.patreon.com/ejemplo')}`);
      await p.waitForFunction(() => !document.body.classList.contains('is-loading'));
      const [download] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
      check(`${tag}: «No volver a mostrar» de la donación se respeta`, !!download && !(await p.evaluate(() => document.getElementById('donate').open)));
    } catch (err) {
      check(`${tag}: sin excepciones`, false, err.stack);
    }
    errors.push(...pageErrors);
    await browser.close();

    // Nothing saved before: no «pliego» database gets created.
    {
      const { browser: b, page, errors: e } = await start({ legacy: null, hideDatabases });
      await page.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado');
      const fresh = await readSaved(page);
      check(`${tag}, sin datos anteriores: no queda una base «pliego» vacía`, !fresh.names.includes('pliego') && fresh.names.includes('scooch') && fresh.scooch.projects.length === 1, JSON.stringify(fresh));
      errors.push(...e);
      await b.close();
    }
  }
  check('sin errores de consola', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})();
