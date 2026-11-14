// The localStorage shapes that hold more than one value (src/core/storedprefs.js):
// every version ever written (tests/fixtures/storage) still reads as it
// should, what is written today has the shape of the newest fixture, and what
// can't be read takes its default.
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  COUNTED_MAX,
  VIEW_DEFAULTS,
  parsePrintPrefs,
  parseSavings,
  parseSections,
  parseThemePref,
  parseViewPrefs,
  resolveTheme,
  serializePrintPrefs,
  serializeSavings,
  serializeSections,
  serializeThemePref,
  serializeViewPrefs,
} from '../../src/core/storedprefs.js';

const DIR = join(import.meta.dirname, '../fixtures/storage');
const fixtures = readdirSync(DIR)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ name: file.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(DIR, file), 'utf8')) }));

/** How each key is read and written. */
const SHAPES = {
  'scooch:panel-sections': { parse: parseSections, serialize: serializeSections },
  'scooch:view-preferences': { parse: parseViewPrefs, serialize: serializeViewPrefs },
  'scooch:print-preferences': { parse: parsePrintPrefs, serialize: serializePrintPrefs },
  'scooch:savings': { parse: parseSavings, serialize: serializeSavings },
  'scooch:theme-preference': { parse: parseThemePref, serialize: serializeThemePref },
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

describe('printing preferences and savings', () => {
  test('both on unless turned off; a total that can’t be read is 0', () => {
    expect(parsePrintPrefs(null)).toEqual({ tip: true, summary: true });
    expect(parsePrintPrefs({ tip: 'no' })).toEqual({ tip: true, summary: true });
    const none = { sheets: 0, turn: 0, counted: [], pending: null, milestone: null };
    expect(parseSavings({ sheets: -3, turn: 1.5 })).toEqual(none);
    expect(parseSavings('34')).toEqual(none);
  });

  test('the PDFs counted are only read from version 2 on, keys only, and only the last ones are kept', () => {
    expect(parseSavings({ v: 1, sheets: 3, turn: 0, counted: ['a'] }).counted).toEqual([]);
    expect(parseSavings({ v: 2, sheets: 3, turn: 0, counted: ['a', 7, '', null, 'b'] }).counted).toEqual(['a', 'b']);
    expect(parseSavings({ v: 3, sheets: 3, turn: 0, counted: ['a', 7, '', null, 'b'] }).counted).toEqual(['a', 'b']);
    const many = Array.from({ length: COUNTED_MAX + 5 }, (_, i) => `k${i}`);
    expect(parseSavings({ v: 2, sheets: 3, turn: 0, counted: many }).counted).toEqual(many.slice(5));
    expect(serializeSavings({ sheets: 3, turn: 0, counted: many, pending: null, milestone: null }).counted).toEqual(many.slice(5));
  });

  test('the pending print and the milestone not shown yet are only read from version 3, and only when they make sense', () => {
    const pending = { key: 'k1', sheets: 5 };
    expect(parseSavings({ v: 2, sheets: 3, turn: 0, counted: [], pending, milestone: 10 })).toMatchObject({ pending: null, milestone: null });
    expect(parseSavings({ v: 3, sheets: 3, turn: 0, counted: [], pending, milestone: 10 })).toMatchObject({ pending, milestone: 10 });
    for (const bad of [{ key: '', sheets: 5 }, { key: 'k1', sheets: 0 }, { key: 'k1', sheets: 2.5 }, { sheets: 5 }, 'k1', []])
      expect(parseSavings({ v: 3, sheets: 3, turn: 0, counted: [], pending: bad }).pending, JSON.stringify(bad)).toBeNull();
    for (const bad of [7, '10', 0, -10])
      expect(parseSavings({ v: 3, sheets: 3, turn: 0, counted: [], milestone: bad }).milestone, `${JSON.stringify(bad)} isn’t a milestone`).toBeNull();
  });
});

describe('theme', () => {
  test('nothing saved, or something that can’t be read: automatic', () => {
    for (const raw of [null, 'dark', [], { theme: 'sepia' }, { theme: true }]) expect(parseThemePref(raw), JSON.stringify(raw)).toEqual({ theme: 'auto' });
  });

  test.each([
    ['auto', false, 'light'],
    ['auto', true, 'dark'],
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
  ])('%s with a dark system %s shows the %s theme', (theme, systemDark, shown) => {
    expect(resolveTheme(theme, systemDark)).toBe(shown);
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
