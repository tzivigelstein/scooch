// The localStorage shapes that hold more than one value (src/core/storedprefs.js):
// every version ever written (tests/fixtures/storage) still reads as it
// should, what is written today has the shape of the newest fixture, and what
// can't be read takes its default.
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { VIEW_DEFAULTS, parseSections, parseViewPrefs, serializeSections, serializeViewPrefs } from '../../src/core/storedprefs.js';

const DIR = join(import.meta.dirname, '../fixtures/storage');
const fixtures = readdirSync(DIR)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ name: file.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(DIR, file), 'utf8')) }));

/** How each key is read and written. */
const SHAPES = {
  'scooch:panel-sections': { parse: parseSections, serialize: serializeSections },
  'scooch:view-preferences': { parse: parseViewPrefs, serialize: serializeViewPrefs },
};

describe('stored preferences of every version', () => {
  for (const fixture of fixtures) {
    test(`${fixture.name} reads as it was written`, () => {
      expect(SHAPES[fixture.key], `a reader for ${fixture.key}`).toBeDefined();
      expect(SHAPES[fixture.key].parse(fixture.value)).toEqual(fixture.reads);
    });
  }

  test('what is written today has exactly the shape of each key’s newest fixture', () => {
    for (const key of Object.keys(SHAPES)) {
      const newest = fixtures.filter((f) => f.key === key).at(-1);
      expect(SHAPES[key].serialize(SHAPES[key].parse(newest.value)), key).toEqual(newest.value);
    }
  });
});

describe('view preferences', () => {
  test('nothing saved, or something that can’t be read: fit the sheet, against the selection, with the gap', () => {
    for (const raw of [null, 'fit', [], { zoomMode: 'zoom', zoomPct: 'big', alignTo: 7, distribute: null }]) expect(parseViewPrefs(raw), JSON.stringify(raw)).toEqual(VIEW_DEFAULTS);
  });

  test('a manual zoom outside 10–800 % is brought inside', () => {
    expect(parseViewPrefs({ v: 1, zoomMode: 'manual', zoomPct: 5000 }).zoomPct).toBe(800);
    expect(parseViewPrefs({ v: 1, zoomMode: 'manual', zoomPct: 2 }).zoomPct).toBe(10);
    expect(parseViewPrefs({ v: 1, zoomMode: 'manual', zoomPct: -3 }).zoomPct).toBe(100);
  });

  test('the percentage is written with two decimals at most', () => {
    expect(serializeViewPrefs({ zoomMode: 'manual', zoomPct: 123.456789, alignTo: 'selection', distribute: 'gap' }).zoomPct).toBe(123.46);
  });
});

describe('panel sections', () => {
  test('cutOptions is only read from version 2', () => {
    expect(parseSections({ cutOptions: true }).cutOptions).toBe(false);
    expect(parseSections({ v: 2, cutOptions: true }).cutOptions).toBe(true);
  });

  test('closed «Más opciones» isn’t written, only the sections that were toggled', () => {
    expect(serializeSections({ sections: { grid: true }, cutOptions: false })).toEqual({ v: 2, grid: true });
  });
});
