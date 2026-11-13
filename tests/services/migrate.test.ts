// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { LEGACY_STORAGE_KEYS, MIGRATED_STORAGE, STORAGE_NAMESPACE } from '../../src/config.ts';
import { createProject, emptyDoc, loadProject, memoryStorage } from '../../src/core/projectstore.js';
import type { ProjectRecord, ProjectStorage } from '../../src/core/types.ts';
import { migrateKeys, migrateProjects, type KeyStore } from '../../src/services/storage/migrate.ts';

const mapStore = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries));
  const store: KeyStore & { map: Map<string, string> } = {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
  };
  return store;
};

const MAPPING = { 'unit-preference': 'app:unit', 'last-project': 'app:last', 'grid-preferences': 'app:grid' };

describe('migrateKeys', () => {
  test('moves every legacy key that has a value and marks it done', () => {
    const store = mapStore({ 'unit-preference': 'cm', 'last-project': 'p1', other: 'x' });
    expect(migrateKeys(store, MAPPING, 'app:done')).toEqual(['unit-preference', 'last-project']);
    expect(Object.fromEntries(store.map)).toEqual({ 'app:unit': 'cm', 'app:last': 'p1', other: 'x', 'app:done': '1' });
  });

  test('a current key that already has a value keeps it (and the legacy one goes)', () => {
    const store = mapStore({ 'unit-preference': 'cm', 'app:unit': 'in' });
    expect(migrateKeys(store, MAPPING, 'app:done')).toEqual([]);
    expect(store.getItem('app:unit')).toBe('in');
    expect(store.getItem('unit-preference')).toBeNull();
  });

  test('a legacy key written after the move (by a tab still running the app from before the rename) is moved on the next start, or dropped when the current one has a value', () => {
    const store = mapStore({ 'unit-preference': 'cm' });
    migrateKeys(store, MAPPING, 'app:done');
    store.setItem('last-project', 'p9');
    store.setItem('unit-preference', 'in');
    expect(migrateKeys(store, MAPPING, 'app:done')).toEqual(['last-project']);
    expect(store.getItem('app:last')).toBe('p9');
    expect(store.getItem('app:unit')).toBe('cm');
    expect(store.getItem('last-project')).toBeNull();
    expect(store.getItem('unit-preference')).toBeNull();
  });

  test('a full storage keeps what was not moved and tries again later', () => {
    const store = mapStore({ 'unit-preference': 'cm', 'last-project': 'p1' });
    const setItem = store.setItem;
    store.setItem = (key, value) => {
      if (key === 'app:last') throw new DOMException('full', 'QuotaExceededError');
      setItem(key, value);
    };
    expect(() => migrateKeys(store, MAPPING, 'app:done')).toThrow('full');
    expect(store.getItem('app:unit')).toBe('cm');
    expect(store.getItem('last-project')).toBe('p1');
    expect(store.getItem('app:done')).toBeNull();
    store.setItem = setItem;
    expect(migrateKeys(store, MAPPING, 'app:done')).toEqual(['last-project']);
    expect(store.getItem('app:last')).toBe('p1');
  });
});

describe('the app keys', () => {
  test('every legacy key maps to one in the namespace, and none is left out', () => {
    const current = Object.values(LEGACY_STORAGE_KEYS);
    expect(new Set(current).size).toBe(current.length);
    for (const [legacy, key] of Object.entries(LEGACY_STORAGE_KEYS)) expect(key).toBe(`${STORAGE_NAMESPACE}:${legacy}`);
    expect(Object.keys(LEGACY_STORAGE_KEYS).sort()).toEqual(
      ['custom-paper', 'donate-dismissed', 'grid-preferences', 'last-project', 'panel-sections', 'piece-preferences', 'project-journal', 'single-key-shortcuts', 'unit-preference'].sort(),
    );
  });

  describe('first access to localStorage', () => {
    beforeEach(() => {
      localStorage.clear();
      vi.resetModules();
    });

    test('moves the legacy keys before reading anything', async () => {
      localStorage.setItem('unit-preference', 'in');
      localStorage.setItem('single-key-shortcuts', 'off');
      const { storageGet } = await import('../../src/services/storage/local.ts');
      expect(storageGet(LEGACY_STORAGE_KEYS['unit-preference'])).toBe('in');
      expect(storageGet(LEGACY_STORAGE_KEYS['single-key-shortcuts'])).toBe('off');
      expect(localStorage.getItem('unit-preference')).toBeNull();
      expect(localStorage.getItem(MIGRATED_STORAGE)).toBe('1');
    });

    test('the preferences store starts with the moved values', async () => {
      localStorage.setItem('unit-preference', 'cm');
      localStorage.setItem('grid-preferences', JSON.stringify({ show: true, size: 5, snap: false }));
      const { usePrefs } = await import('../../src/state/prefs.ts');
      const prefs = usePrefs.getState();
      expect(prefs.unit).toBe('cm');
      expect(prefs.grid).toEqual({ show: true, size: 5, snap: false });
    });
  });
});

const blob = (text: string) => new Blob([text]);
const file = (text: string) => ({ blob: blob(text), hash: `h-${text}` });

async function seeded(storage: ProjectStorage, names: string[]) {
  const records: ProjectRecord[] = [];
  for (const [i, name] of names.entries()) {
    const doc = emptyDoc();
    records.push(await createProject(storage, { id: `p${i}`, name, now: 1000 + i, doc }));
    await storage.write(records[i], { put: new Map([[`f${i}`, file(`bytes of ${name}`)]]) });
  }
  return records;
}

describe('migrateProjects', () => {
  test('copies records and binaries, then empties the legacy storage', async () => {
    const from = memoryStorage();
    const to = memoryStorage();
    const records = await seeded(from, ['Tarjetas', 'Fotos']);
    const legacyFiles = await Promise.all(records.map((record) => from.files(record.id)));
    expect(await migrateProjects(from, to)).toBe(2);
    expect(await from.list()).toEqual([]);
    expect((await to.list()).map((r) => r.name).sort()).toEqual(['Fotos', 'Tarjetas']);
    for (const [i, record] of records.entries()) {
      expect(await to.get(record.id)).toEqual(record);
      const files = await to.files(record.id);
      expect([...files.keys()]).toEqual([`f${i}`]);
      expect(files.get(`f${i}`)).toEqual(legacyFiles[i].get(`f${i}`));
    }
    // And they open like any other project.
    expect((await loadProject(to, 'p0')).record.name).toBe('Tarjetas');
  });

  test('a project already in the new storage is not overwritten', async () => {
    const from = memoryStorage();
    const to = memoryStorage();
    await seeded(from, ['Viejo']);
    const edited = { ...(await from.get('p0'))!, name: 'Editado después' };
    await to.write(edited, { create: true });
    expect(await migrateProjects(from, to)).toBe(0);
    expect((await to.get('p0'))!.name).toBe('Editado después');
    expect(await from.list()).toEqual([]);
  });

  test('a failure halfway keeps the legacy storage whole, and the next try finishes', async () => {
    let writes = 0;
    let broken = true;
    const from = memoryStorage();
    const to = memoryStorage({ fail: (op: string) => (op === 'write' && broken && ++writes === 2 ? new DOMException('full', 'QuotaExceededError') : null) });
    await seeded(from, ['Uno', 'Dos', 'Tres']);
    await expect(migrateProjects(from, to)).rejects.toThrow('full');
    expect((await from.list()).length).toBe(3);
    expect((await to.list()).length).toBe(1);
    broken = false;
    expect(await migrateProjects(from, to)).toBe(2);
    expect((await to.list()).map((r) => r.name).sort()).toEqual(['Dos', 'Tres', 'Uno']);
    expect(await from.list()).toEqual([]);
  });

  test('nothing to move', async () => {
    expect(await migrateProjects(memoryStorage(), memoryStorage())).toBe(0);
  });
});
