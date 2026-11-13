// Stored documents of older shapes open as they are: a version 3 project saved without a cut margin
// (and one that already had it), versions 2, 1 and 0, and one with unreadable optional settings; the
// next save writes the current version. One saved by a newer version is reported and left alone. A
// truly broken one is still shown as damaged.
const { open, makeChecker, addFiles, lib } = require('../lib/selection.cjs');

// Replaces the open project's stored document (in the «scooch» database) with `doc(stored)`.
const PATCH = async (change) => {
  const id = localStorage.getItem('scooch:last-project');
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('scooch', 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const record = await new Promise((res) => {
    const r = db.transaction('projects').objectStore('projects').get(id);
    r.onsuccess = () => res(r.result);
  });
  const doc = new Function('doc', `return (${change})(doc)`)(structuredClone(record.doc));
  await new Promise((res, rej) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put({ ...record, doc, version: doc.version, modified: Date.now() + 5000 });
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
  db.close();
};

const STORED = async () => {
  const id = localStorage.getItem('scooch:last-project');
  const db = await new Promise((res) => {
    const r = indexedDB.open('scooch', 1);
    r.onsuccess = () => res(r.result);
  });
  const record = await new Promise((res) => {
    const r = db.transaction('projects').objectStore('projects').get(id);
    r.onsuccess = () => res(r.result);
  });
  db.close();
  return record.doc;
};

(async () => {
  const { check, report } = makeChecker('Stored documents of older versions');
  const errors = [];
  const s = await open();
  const p = s.page;
  const L = lib(p);
  await addFiles(p, ['wide.png', 'tall.png']);
  const saved = () => p.waitForFunction(() => document.getElementById('project-status-text').textContent === 'Guardado', null, { timeout: 8000 });
  await saved();
  const reopen = async () => {
    await p.reload();
    await p.waitForFunction(() => !document.body.classList.contains('is-loading'));
    await p.waitForTimeout(300);
  };
  const edit = async () => {
    await L.piece((await L.ids())[0]).focus();
    await p.keyboard.press('ArrowRight');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(1300);
    await saved();
  };

  // Version 3 as written by the first stroke options: no margin.
  await p.evaluate(PATCH, `(doc) => ({ ...doc, version: 3, cuts: { mode: 'corners', length: 4, offset: 1.5, weight: 'medium', color: '#12a0ff', dash: 'solid' } })`);
  await reopen();
  check('a version 3 project without a cut margin opens with its pieces', (await p.locator('#sheets .piece').count()) === 2 && !(await L.pill()).warn, JSON.stringify(await L.pill()));
  await L.showTab('sheet');
  check('…with its cut lines as they were', (await p.isChecked('#cut-mode input[value="corners"]')) && (await p.locator('.cut-layer').count()) === 1);
  await edit();
  let doc = await p.evaluate(STORED);
  check('the next save writes version 4 with margin 0', doc.version === 4 && doc.cuts.margin === 0 && doc.cuts.weight === 'medium' && doc.cuts.color === '#12a0ff', JSON.stringify(doc.cuts));

  // Version 3 saved while the margin was already in it: kept.
  await p.evaluate(PATCH, `(doc) => ({ ...doc, version: 3, cuts: { ...doc.cuts, margin: 1.5 } })`);
  await reopen();
  check('a version 3 project that already had a margin opens', (await p.locator('#sheets .piece').count()) === 2);
  await edit();
  doc = await p.evaluate(STORED);
  check('…and keeps its margin', doc.version === 4 && doc.cuts.margin === 1.5, JSON.stringify(doc.cuts));

  // Version 1: no crop and no cut lines.
  await p.evaluate(PATCH, `(doc) => { const { cuts, ...rest } = doc; return { ...rest, version: 1, items: doc.items.map(({ crop, ...item }) => item) }; }`);
  await reopen();
  check('a version 1 project opens with its pieces, not as damaged', (await p.locator('#sheets .piece').count()) === 2 && !(await L.pill()).warn, JSON.stringify(await L.pill()));
  await edit();
  doc = await p.evaluate(STORED);
  check('…and is saved as version 4 with no cut lines and no crops', doc.version === 4 && doc.cuts.mode === 'none' && doc.cuts.margin === 0 && doc.items.every((item) => item.crop === null), JSON.stringify(doc.cuts));

  // Version 0: one sheet, no sheet ids on the pieces, papers by name.
  await p.evaluate(PATCH, `(doc) => { const { version, sheets, cuts, ...rest } = doc; return { ...rest, paper: 'Carta', items: doc.items.map(({ sheet, crop, ...item }) => item) }; }`);
  await reopen();
  check('a version 0 project (one sheet, «Carta») opens', (await p.locator('#sheets .piece').count()) === 2 && (await p.locator('#sheets .page').count()) === 1 && !(await L.pill()).warn, JSON.stringify(await L.pill()));
  await edit();
  doc = await p.evaluate(STORED);
  check('…and is saved as version 4 on Letter paper', doc.version === 4 && doc.paper === 'letter' && doc.sheets.length === 1, JSON.stringify({ paper: doc.paper, sheets: doc.sheets }));

  // Version 2: the stroke it printed with.
  await p.evaluate(PATCH, `(doc) => { const { mode, length, offset } = doc.cuts; return { ...doc, version: 2, cuts: { mode, length, offset } }; }`);
  await reopen();
  await edit();
  doc = await p.evaluate(STORED);
  check('a version 2 project opens with the dark gray thin stroke', doc.version === 4 && doc.cuts.color === '#333333' && doc.cuts.weight === 'thin' && doc.cuts.margin === 0, JSON.stringify(doc.cuts));

  // Unreadable optional settings: defaults and clamped numbers, not «damaged».
  await p.evaluate(PATCH, `(doc) => ({ ...doc, gap: 'x', cuts: { ...doc.cuts, color: 'red', margin: 99, dash: 'wavy' }, items: doc.items.map((item) => ({ ...item, crop: 'all' })) })`);
  await reopen();
  check('unreadable optional settings take their defaults: the project opens', (await p.locator('#sheets .piece').count()) === 2);
  // (A 20 mm cut margin may leave no room to nudge: any change saves.)
  await p.click('#add-sheet');
  await p.waitForTimeout(1300);
  await saved();
  doc = await p.evaluate(STORED);
  check('…saved repaired (gap 5, black, solid, margin 20, no crop)', doc.gap === 5 && doc.cuts.color === '#000000' && doc.cuts.dash === 'solid' && doc.cuts.margin === 20 && doc.items.every((item) => item.crop === null), JSON.stringify({ gap: doc.gap, cuts: doc.cuts }));

  // None of the older shapes shows as damaged in Proyectos.
  await p.keyboard.press('Control+o');
  await p.waitForSelector('#projects[open] .project-card');
  check('Proyectos lists it without the damaged badge', (await p.locator('.project-card [data-kind="damaged"]').count()) === 0);
  await p.keyboard.press('Escape');

  // Saved by a newer version of the app: reported, never offered for deletion, left as it is.
  await p.evaluate(PATCH, `(doc) => ({ ...doc, version: 5, somethingNew: { kept: true } })`);
  await reopen();
  const newer = await L.pill();
  check('a project saved by a newer version says so, with no delete button', /versión más nueva/.test(newer.text) && newer.action === '', JSON.stringify(newer));
  await p.keyboard.press('Control+o');
  await p.waitForSelector('#projects[open] .project-card');
  const badges = await p.locator('.project-card [data-kind="damaged"]').allTextContents();
  check('…and Proyectos lists it as a newer version, not as damaged', badges.length === 1 && badges[0] === 'Versión más nueva', JSON.stringify(badges));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1500);
  const stillThere = await p.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('scooch', 1);
      r.onsuccess = () => res(r.result);
    });
    const all = await new Promise((res) => {
      const r = db.transaction('projects').objectStore('projects').getAll();
      r.onsuccess = () => res(r.result);
    });
    db.close();
    return all.filter((record) => record.doc.version === 5).map((record) => !!record.doc.somethingNew?.kept);
  });
  check('…its stored document is untouched', stillThere.length === 1 && stillThere[0] === true, JSON.stringify(stillThere));
  // Back to the current version for what follows.
  await p.evaluate(async () => {
    const db = await new Promise((res) => {
      const r = indexedDB.open('scooch', 1);
      r.onsuccess = () => res(r.result);
    });
    const all = await new Promise((res) => {
      const r = db.transaction('projects').objectStore('projects').getAll();
      r.onsuccess = () => res(r.result);
    });
    const record = all.find((x) => x.doc.version === 5);
    const { somethingNew, ...doc } = record.doc;
    await new Promise((res) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put({ ...record, doc: { ...doc, version: 4 }, version: 4, modified: Date.now() + 9000 });
      tx.oncomplete = res;
    });
    localStorage.setItem('scooch:last-project', record.id);
    db.close();
  });
  await reopen();
  check('…and opens again once it is in a version this app reads', (await p.locator('#sheets .piece').count()) === 2);

  // What can't be interpreted is still damaged (and says so instead of opening).
  await p.evaluate(PATCH, `(doc) => ({ ...doc, items: doc.items.map((item) => ({ ...item, asset: 'a999' })) })`);
  await reopen();
  check('a project whose pieces point nowhere is still shown as damaged', /dañados/.test((await L.pill()).text), JSON.stringify(await L.pill()));
  errors.push(...s.errors.filter((e) => !/damaged|dañad|corrupt/i.test(e)));
  await s.browser.close();

  check('no console errors', errors.length === 0, errors.join(' | '));
  process.exit(report() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
