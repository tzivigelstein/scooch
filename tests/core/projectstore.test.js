import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  NAME_MAX,
  newProjectId,
  cleanName,
  emptyDoc,
  createProject,
  saveProject,
  loadProject,
  duplicateProject,
  renameProject,
  deleteProject,
  listProjects,
  pickProject,
  recoverJournal,
  memoryStorage,
} from '../../src/core/projectstore.js';
import { ProjectError, fileKeys } from '../../src/core/projectdoc.js';
import { relativeTime, formatBytes } from '../../src/core/humanize.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A stored journal of one format version (tests/fixtures/journal). */
const journalFixture = (version) => JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/journal', `${version}.json`), 'utf8')).journal;

const blob = (text) => new Blob([text]);

/** Documento con una imagen (con bytes derivados) y una página de PDF. */
function docWith(items = 2) {
  const doc = emptyDoc({ paper: 'folio' });
  doc.sheets = [{ id: 1 }, { id: 2 }];
  doc.assets = {
    a1: { kind: 'image', name: 'foto.jpg', src: 1, px: [100, 50], format: 'jpg', dpi: 300, w: 8.5, h: 4.2, derived: true },
    a2: { kind: 'pdf', name: 'plano.pdf', src: 2, page: 3, pages: 4, pageRotation: 0, view: [0, 0, 100, 100], px: [10, 10], w: 35, h: 35 },
  };
  doc.items = [
    { id: 1, asset: 'a1', sheet: 1, x: 10, y: 10, scale: 100, r: 0 },
    { id: 2, asset: 'a2', sheet: 2, x: 10, y: 10, scale: 100, r: 90 },
  ].slice(0, items);
  if (items < 2) delete doc.assets.a2;
  return doc;
}

const blobsFor = (doc) => new Map(fileKeys(doc).map((key) => [key, blob(key)]));

async function saved(storage, id = 'p1', now = 1000) {
  const record = await createProject(storage, { id, name: 'Sin título', now });
  const doc = docWith();
  const result = await saveProject(storage, { record, doc, blobs: blobsFor(doc), now: now + 1 });
  return { ...result, doc };
}

describe('nombres e ids', () => {
  test('cleanName', () => {
    assert.equal(cleanName('  Tarjetas   de  visita ', 'Sin título'), 'Tarjetas de visita');
    assert.equal(cleanName('   ', 'Sin título'), 'Sin título');
    assert.equal(cleanName(null, 'X'), 'X');
    assert.equal(cleanName('a'.repeat(200), 'X').length, NAME_MAX);
  });

  test('newProjectId: distinto con otro tiempo o azar', () => {
    assert.match(newProjectId(1, () => 0.5), /^p[0-9a-z]+$/);
    assert.notEqual(newProjectId(1, () => 0.1), newProjectId(1, () => 0.2));
    assert.notEqual(newProjectId(1, () => 0.1), newProjectId(2, () => 0.1));
  });
});

describe('guardar y abrir', () => {
  test('crear, guardar con archivos y abrir de nuevo', async () => {
    const storage = memoryStorage();
    const { record, stored, doc } = await saved(storage);
    assert.deepEqual([...stored].sort(), ['bytes:1', 'preview:a1', 'preview:a2', 'src:1', 'src:2']);
    assert.deepEqual(record.counts, { sheets: 2, pieces: 2 });
    assert.equal(record.modified, 1001);
    const loaded = await loadProject(storage, 'p1');
    assert.deepEqual(loaded.doc, doc);
    assert.equal(loaded.record.name, 'Sin título');
    assert.equal(await loaded.files.get('src:2').text(), 'src:2');
  });

  test('solo escribe lo que falta y borra lo que ya no se usa', async () => {
    const writes = [];
    const base = memoryStorage();
    const storage = { ...base, write: (record, change) => (writes.push(change), base.write(record, change)) };
    const { record, stored } = await saved(storage);
    const smaller = docWith(1);
    // Sin blobs en memoria para lo que ya está guardado: no hacen falta.
    const result = await saveProject(storage, { record, doc: smaller, blobs: new Map(), stored, now: 5000 });
    const last = writes.at(-1);
    assert.equal(last.put.size, 0);
    assert.deepEqual(last.remove.sort(), ['preview:a2', 'src:2']);
    assert.deepEqual([...result.stored].sort(), ['bytes:1', 'preview:a1', 'src:1']);
    const files = await storage.files('p1');
    assert.deepEqual([...files.keys()].sort(), ['bytes:1', 'preview:a1', 'src:1']);
  });

  test('si falta un binario en memoria, no guarda a medias', async () => {
    const storage = memoryStorage();
    const record = await createProject(storage, { id: 'p1', name: 'X', now: 1 });
    const doc = docWith();
    const blobs = blobsFor(doc);
    blobs.delete('src:2');
    await assert.rejects(saveProject(storage, { record, doc, blobs, now: 2 }), ProjectError);
    assert.deepEqual((await storage.get('p1')).doc.items, []);
  });

  test('una falla del almacenamiento (p. ej. cuota) llega a quien guarda', async () => {
    const quota = Object.assign(new Error('lleno'), { name: 'QuotaExceededError' });
    let full = false;
    const storage = memoryStorage({ fail: (op) => (full && op === 'write' ? quota : null) });
    const record = await createProject(storage, { id: 'p1', name: 'X', now: 1 });
    full = true;
    const doc = docWith();
    await assert.rejects(saveProject(storage, { record, doc, blobs: blobsFor(doc), now: 2 }), /lleno/);
    full = false;
    await saveProject(storage, { record, doc, blobs: blobsFor(doc), now: 3 }); // reintentar funciona
    assert.equal((await storage.get('p1')).doc.items.length, 2);
  });

  test('proyecto dañado o con archivos faltantes → ProjectError «corrupt»; inexistente → «missing»', async () => {
    const storage = memoryStorage();
    await saved(storage);
    const record = await storage.get('p1');
    await storage.write({ ...record, id: 'roto', doc: { ...record.doc, sheets: 'nada' } });
    await assert.rejects(loadProject(storage, 'roto'), (err) => err.code === 'corrupt');
    await storage.write({ ...record, id: 'sinarchivos' }, { put: new Map([['src:1', blob('x')]]) });
    await assert.rejects(loadProject(storage, 'sinarchivos'), (err) => err.code === 'corrupt' && /preview:a1/.test(err.message));
    await assert.rejects(loadProject(storage, 'nada'), (err) => err.code === 'missing');
    const list = await listProjects(storage);
    assert.deepEqual(
      list.map((r) => [r.id, r.damaged]).sort(),
      [
        ['p1', false],
        ['roto', true],
        ['sinarchivos', false],
      ]
    );
  });
});

describe('duplicar, renombrar, eliminar y listar', () => {
  test('duplicar copia el documento y los archivos; los dos quedan independientes', async () => {
    const storage = memoryStorage();
    await saved(storage);
    const copy = await duplicateProject(storage, 'p1', { newId: 'p2', name: 'Sin título (copia)', now: 9000 });
    assert.equal(copy.name, 'Sin título (copia)');
    assert.equal(copy.created, 9000);
    const a = await loadProject(storage, 'p1');
    const b = await loadProject(storage, 'p2');
    assert.deepEqual(b.doc, a.doc);
    assert.deepEqual([...b.files.keys()].sort(), [...a.files.keys()].sort());
    await deleteProject(storage, 'p1');
    assert.equal(await storage.get('p1'), null);
    assert.equal((await storage.files('p1')).size, 0, 'se borran sus archivos');
    assert.equal((await loadProject(storage, 'p2')).files.size, 5, 'la copia sigue entera');
  });

  test('renombrar cambia el nombre y la fecha', async () => {
    const storage = memoryStorage();
    await saved(storage);
    const record = await renameProject(storage, 'p1', 'Tarjetas', 7777);
    assert.equal(record.name, 'Tarjetas');
    assert.equal((await storage.get('p1')).modified, 7777);
    await assert.rejects(renameProject(storage, 'no', 'x', 1), (err) => err.code === 'missing');
  });

  test('lista del más reciente al más viejo y qué abrir al empezar', async () => {
    const storage = memoryStorage();
    await createProject(storage, { id: 'a', name: 'A', now: 10 });
    await createProject(storage, { id: 'b', name: 'B', now: 30 });
    await createProject(storage, { id: 'c', name: 'C', now: 20 });
    const list = await listProjects(storage);
    assert.deepEqual(list.map((r) => r.id), ['b', 'c', 'a']);
    assert.equal(pickProject(list, 'c'), 'c', 'el último abierto');
    assert.equal(pickProject(list, 'borrado'), 'b', 'si ya no existe, el más reciente');
    assert.equal(pickProject([], 'x'), null);
    assert.equal(pickProject([{ id: 'r', damaged: true }, ...list], 'r'), 'b', 'nunca uno dañado');
    assert.equal(pickProject([{ id: 'n', damaged: false, newer: true }, ...list], 'n'), 'b', 'nor one a newer version saved');
  });

  test('a project saved by a newer version is listed as newer, not damaged, and left as it is', async () => {
    const storage = memoryStorage();
    await saved(storage);
    const record = await storage.get('p1');
    await storage.write({ ...record, id: 'future', version: 99, doc: { ...record.doc, version: 99, somethingNew: true } });
    const list = await listProjects(storage);
    const future = list.find((r) => r.id === 'future');
    assert.equal(future.damaged, false);
    assert.equal(future.newer, true);
    assert.equal(list.find((r) => r.id === 'p1').newer, false);
    await assert.rejects(loadProject(storage, 'future'), (err) => err.code === 'newer');
    assert.equal((await storage.get('future')).doc.somethingNew, true, 'untouched');
  });
});

describe('recoverJournal', () => {
  test('usa el diario si es de ese proyecto y más nuevo; descarta lo que no tiene archivos', async () => {
    const storage = memoryStorage();
    const { record } = await saved(storage);
    const { files } = await loadProject(storage, 'p1');
    const doc = docWith();
    doc.items[0].x = 99;
    // Una pieza agregada a último momento, sin archivos guardados todavía.
    doc.assets.a3 = { kind: 'image', name: 'nueva.png', src: 3, px: [10, 10], format: 'png', dpi: 300, w: 1, h: 1 };
    doc.items.push({ id: 3, asset: 'a3', sheet: 1, x: 0, y: 0, scale: 100, r: 0 });
    const journal = { id: 'p1', at: record.modified + 10, name: 'Otro nombre', doc };
    const out = recoverJournal(record, files, journal);
    assert.equal(out.name, 'Otro nombre');
    assert.equal(out.doc.items.length, 2, 'sin la pieza sin archivos');
    assert.equal(out.doc.items[0].x, 99, 'con el cambio de último momento');
    assert.deepEqual(Object.keys(out.doc.assets).sort(), ['a1', 'a2']);
  });

  test('no lo usa si es viejo, de otro proyecto o está roto', async () => {
    const storage = memoryStorage();
    const { record, doc } = await saved(storage);
    const { files } = await loadProject(storage, 'p1');
    assert.equal(recoverJournal(record, files, null), null);
    assert.equal(recoverJournal(record, files, { id: 'p1', at: record.modified - 1, doc }), null, 'más viejo que lo guardado');
    assert.equal(recoverJournal(record, files, { id: 'p2', at: record.modified + 1, doc }), null, 'de otro proyecto');
    assert.equal(recoverJournal(record, files, { id: 'p1', at: record.modified + 1, doc: { ...doc, sheets: 'x' } }), null, 'roto');
  });
});

describe('recoverJournal: the stored versions', () => {
  test('version 2 (one key per project) is used while the stored record is still the one it started from, whatever the clock says', async () => {
    const storage = memoryStorage();
    const { record } = await saved(storage); // modified: 1001
    const { files } = await loadProject(storage, 'p1');
    const journal = journalFixture('v2');
    assert.equal(journal.base, record.modified);
    const out = recoverJournal(record, files, journal);
    assert.equal(out.name, 'Antes de cerrar');
    assert.equal(out.doc.items[0].x, 99);
    // Saved since (the last save went through, or another tab saved it): stale.
    assert.equal(recoverJournal({ ...record, modified: 900 }, files, journal), null, 'an older save, by the clock');
    assert.equal(recoverJournal({ ...record, modified: 2000 }, files, journal), null);
  });

  test('version 1 (one key for every tab) is used when it is later than the save, by the clock', async () => {
    const storage = memoryStorage();
    const { record } = await saved(storage);
    const { files } = await loadProject(storage, 'p1');
    const journal = journalFixture('v1');
    const out = recoverJournal(record, files, journal, { allowOverlap: true });
    assert.equal(out.doc.items[0].x, 99);
    assert.equal(out.doc.allowOverlap, true, 'migrated like any document of its version');
    assert.equal(recoverJournal({ ...record, modified: journal.at + 1 }, files, journal), null);
  });
});

describe('humanize', () => {
  const now = Date.UTC(2026, 10, 12, 15, 0, 0);
  test('relativeTime', () => {
    assert.equal(relativeTime(now - 10_000, now), 'ahora');
    assert.equal(relativeTime(now - 5 * 60_000, now), 'hace 5 minutos');
    assert.equal(relativeTime(now - 60_000, now), 'hace 1 minuto');
    assert.equal(relativeTime(now - 3 * 3600_000, now), 'hace 3 horas');
    assert.equal(relativeTime(now - 26 * 3600_000, now), 'ayer');
    assert.equal(relativeTime(now - 4 * 86400_000, now), 'hace 4 días');
    assert.match(relativeTime(Date.UTC(2026, 9, 1, 12), now), /^1 oct\.?$/);
    assert.match(relativeTime(Date.UTC(2025, 9, 1, 12), now), /1 oct\.? 2025/);
    assert.equal(relativeTime(now + 5000, now), 'ahora', 'un reloj adelantado no da fechas futuras');
  });

  test('formatBytes', () => {
    const nb = (s) => s.replace(/ /g, ' ');
    assert.equal(nb(formatBytes(820)), '820 B');
    assert.equal(nb(formatBytes(3_240_000)), '3,2 MB');
    assert.equal(nb(formatBytes(1_500_000_000)), '1,5 GB');
    assert.equal(nb(formatBytes(250_000_000)), '250 MB');
    assert.equal(nb(formatBytes(-5)), '0 B');
  });
});
