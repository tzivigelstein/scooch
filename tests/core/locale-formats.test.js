// Numbers in each interface language's locale (its catalogue's meta.numberLocale):
// a measurement as the fields show it reads back with either decimal
// separator, and sizes and dates come in the language's own form.
import { describe, expect, test } from 'vitest';
import { LANGUAGES } from '../../src/core/language.js';
import { formatBytes, relativeTime } from '../../src/core/humanize.js';
import { UNITS, formatLength, parseLength } from '../../src/core/units.js';
import { CATALOGUES } from '../../src/copy/all.ts';

const LOCALES = LANGUAGES.map((language) => [language, CATALOGUES[language].meta.numberLocale]);

describe.each(LOCALES)('%s', (language, locale) => {
  test('a measurement as shown reads back, in every unit, and both separators read as decimals', () => {
    for (const unit of UNITS)
      for (const mm of [0, 0.1, 2.5, 41.64, 215.9, 1189, 12.7, 25.4]) {
        const shown = formatLength(mm, unit, { locale, withUnit: false });
        expect(shown, `${mm} mm in ${unit}: Latin numerals, no thousands separator`).toMatch(/^-?\d+([.,]\d+)?$/);
        expect(parseLength(shown, unit), `«${shown}» ${unit}`).toBeCloseTo(parseLength(formatLength(mm, unit, { locale: 'en', withUnit: false }), unit), 9);
      }
    expect(parseLength('2,5', 'cm')).toBe(25);
    expect(parseLength('2.5', 'cm')).toBe(25);
  });
});

describe('sizes and dates in each language', () => {
  test.each([
    ['es', '2,3 MB', 'hace 5 minutos'],
    ['en', '2.3 MB', '5 minutes ago'],
    ['zh-Hans', '2.3 MB', '5分钟前'],
    ['hi', '2.3 MB', '5 मिनट पहले'],
    ['fr', '2,3 Mo', 'il y a 5 minutes'],
  ])('%s: «%s», «%s»', (language, size, when) => {
    const locale = CATALOGUES[language].meta.numberLocale;
    expect(formatBytes(2_340_000, { locale }).replace(/\s/g, ' ')).toBe(size);
    expect(relativeTime(0, 5 * 60_000, { locale })).toBe(when);
  });
});
