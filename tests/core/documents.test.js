// One stored document per format version (tests/fixtures/documents): every one
// still opens, and what it becomes is snapshotted. A format change without a
// new version (and its fixture and migration) makes these tests fail: the
// shape of a version that was ever written to storage is frozen.
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOC_VERSION, deserialize, migrate, repair, serialize, validate } from '../../src/core/projectdoc.js';

const DIR = join(import.meta.dirname, '../fixtures/documents');
const fixtures = readdirSync(DIR)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ name: file.replace(/\.json$/, ''), doc: JSON.parse(readFileSync(join(DIR, file), 'utf8')) }));

const keysOf = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : []);

describe('stored documents of every version', () => {
  test('there is a fixture for every version up to the current one', () => {
    const versions = new Set(fixtures.map(({ doc }) => doc.version ?? 0));
    for (let v = 0; v <= DOC_VERSION; v++) expect(versions.has(v), `fixture for version ${v}`).toBe(true);
    expect(Math.max(...versions)).toBe(DOC_VERSION);
  });

  for (const { name, doc } of fixtures) {
    test(`${name} opens and becomes the current version`, () => {
      const migrated = repair(migrate(doc));
      expect(validate(migrated)).toEqual([]);
      expect(deserialize(doc)).toEqual(migrated);
      expect(migrated.version).toBe(DOC_VERSION);
      expect(migrated).toMatchSnapshot();
    });
  }

  test('what is saved today has exactly the shape of the current version’s fixture', () => {
    const current = fixtures.find(({ name }) => name === `v${DOC_VERSION}`);
    const saved = serialize(deserialize(current.doc), new Map(Object.entries(current.doc.assets)));
    expect(keysOf(saved)).toEqual(keysOf(current.doc));
    expect(keysOf(saved.cuts)).toEqual(keysOf(current.doc.cuts));
    expect(saved.items.map(keysOf)).toEqual(current.doc.items.map(keysOf));
    expect(saved).toEqual(current.doc);
  });

  test('a version 3 document keeps a margin it already had, and gets 0 without one', () => {
    expect(deserialize(fixtures.find((f) => f.name === 'v3-with-margin').doc).cuts.margin).toBe(1.5);
    expect(deserialize(fixtures.find((f) => f.name === 'v3').doc).cuts.margin).toBe(0);
  });
});
