// The localStorage shapes that hold more than one value (src/core/storedprefs.js):
// every version ever written (tests/fixtures/storage) still reads as it
// should, what is written today has the shape of the newest fixture, and what
// can't be read takes its default.
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  COUNTED_MAX,
  RECENT_MAX,
  LANGUAGE_CHOICES,
  TIPS_MAX,
  VIEW_DEFAULTS,
  parseLanguagePref,
  parsePrintPrefs,
  parseRecents,
  parseSavings,
  parseSections,
  parseThemePref,
  parseTipPrefs,
  parseViewPrefs,
  resolveTheme,
  serializeLanguagePref,
  serializePrintPrefs,
  serializeRecents,
  serializeSavings,
  serializeSections,
  serializeThemePref,
  serializeTipPrefs,
  serializeViewPrefs,
  withRecent,
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
  'scooch:language-preference': { parse: parseLanguagePref, serialize: serializeLanguagePref },
  'scooch:palette-recents': { parse: parseRecents, serialize: serializeRecents },
  'scooch:usage-tips': { parse: parseTipPrefs, serialize: serializeTipPrefs },
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

describe('language', () => {
  test('nothing saved, or something that can’t be read: automatic', () => {
    for (const raw of [null, 'es', [], { language: 'klingon' }, { language: 'ES' }, { language: 7 }]) expect(parseLanguagePref(raw), JSON.stringify(raw)).toEqual({ language: 'auto' });
  });

  test('every choice of «Idioma» is kept as it was written', () => {
    for (const language of LANGUAGE_CHOICES) expect(parseLanguagePref(serializeLanguagePref({ language }))).toEqual({ language });
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

describe('the palette’s recent commands', () => {
  test('nothing saved, or something that can’t be read: none; ids only, each once, the newest first, at most 5', () => {
    for (const raw of [null, 'undo', [], { ids: 'undo' }, { ids: [7, null, ''] }]) expect(parseRecents(raw), JSON.stringify(raw)).toEqual({ ids: [] });
    expect(parseRecents({ v: 1, ids: ['undo', 3, 'redo', 'undo', 'print'] })).toEqual({ ids: ['undo', 'redo', 'print'] });
    expect(RECENT_MAX).toBe(5);
    expect(parseRecents({ v: 1, ids: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).ids).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('a command run goes first, once, and the oldest falls off past 5', () => {
    expect(withRecent([], 'undo')).toEqual(['undo']);
    expect(withRecent(['redo', 'undo', 'print'], 'undo')).toEqual(['undo', 'redo', 'print']);
    expect(withRecent(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
  });
});

describe('usage tips', () => {
  test('nothing saved, or something that can’t be read: tips on, nothing dismissed, known or counted', () => {
    const fresh = { on: true, dismissed: [], known: [], counts: {} };
    for (const raw of [null, 'off', [], { on: 'no', dismissed: 'undoKey', known: 7, counts: [] }]) expect(parseTipPrefs(raw), JSON.stringify(raw)).toEqual(fresh);
    expect(parseTipPrefs({ v: 1, on: false }).on).toBe(false);
  });

  test('topics are names, each once; counts are whole numbers above 0', () => {
    const read = parseTipPrefs({ v: 1, dismissed: ['zoom', 3, '', 'zoom', 'palette'], known: [null, 'undoKey'], counts: { undoKey: 4, redoKey: 0, zoomWheel: -1, removeKey: 2.5, rotateKey: '3', '': 9 } });
    expect(read).toEqual({ on: true, dismissed: ['zoom', 'palette'], known: ['undoKey'], counts: { undoKey: 4 } });
  });

  test('each list and the counts keep at most 50 entries, also when written', () => {
    const many = Array.from({ length: 60 }, (_, i) => `tip${i}`);
    const counts = Object.fromEntries(many.map((id) => [id, 1]));
    const read = parseTipPrefs({ v: 1, dismissed: many, known: many, counts });
    expect(TIPS_MAX).toBe(50);
    expect([read.dismissed.length, read.known.length, Object.keys(read.counts).length]).toEqual([50, 50, 50]);
    const written = serializeTipPrefs({ on: true, dismissed: many, known: many, counts });
    expect([written.dismissed.length, written.known.length, Object.keys(written.counts).length]).toEqual([50, 50, 50]);
  });
});
