// How t() picks a plural, formats a number and joins a list in each language
// (src/copy/index.ts): with the language's own Intl rules, never by gluing
// pieces of words. The texts are Spanish's with the plural under test, so the
// rule shows and not the translation.
import { describe, expect, test } from 'vitest';
import es from '../../src/copy/es.ts';
import { textsFor, type Catalogue, type Plural } from '../../src/copy/index.ts';

const NNBSP = ' ';

/** Spanish's texts with `lang` rules and `count` as «pieces.count». */
const textsIn = (lang: string, count: Plural = { one: 'one {n}', other: 'other {n}' }) =>
  textsFor({ ...es, meta: { ...es.meta, lang, numberLocale: lang }, pieces: { ...es.pieces, count } } as Catalogue);

describe('plurals, by the language’s categories', () => {
  test.each([
    // Spanish and English: «one» is 1 only.
    ['es', [0, 1, 2, 1.5, 21], ['other 0', 'one 1', 'other 2', 'other 1,5', 'other 21']],
    ['en', [0, 1, 2, 1.5, 21], ['other 0', 'one 1', 'other 2', 'other 1.5', 'other 21']],
    // French and Hindi: «one» is 0 and 1 (in French, also what is between them).
    ['fr', [0, 1, 2, 1.5, 21], ['one 0', 'one 1', 'other 2', 'one 1,5', 'other 21']],
    ['hi', [0, 1, 2, 1.5, 21], ['one 0', 'one 1', 'other 2', 'other 1.5', 'other 21']],
  ])('%s', (lang, counts, expected) => {
    const { t } = textsIn(lang);
    expect(counts.map((n) => t('pieces.count', { n }))).toEqual(expected);
  });

  test('Chinese has «other» only', () => {
    const { t } = textsIn('zh-Hans', { other: '{n} 个' });
    expect([0, 1, 2].map((n) => t('pieces.count', { n }))).toEqual(['0 个', '1 个', '2 个']);
  });

  test('«zero», when a text has it, is for 0 in every language', () => {
    for (const lang of ['es', 'en', 'fr', 'hi', 'zh-Hans']) {
      const { t } = textsIn(lang, { zero: 'none', one: 'one {n}', other: 'other {n}' });
      expect(t('pieces.count', { n: 0 }), lang).toBe('none');
      expect(t('pieces.count', { n: 2 }), lang).toBe('other 2');
    }
  });
});

describe('numbers and lists, by the language’s locale', () => {
  test.each([
    ['es', ['41,6', '1189', '12.345', '0']],
    ['en', ['41.6', '1,189', '12,345', '0']],
    ['fr', ['41,6', `1${NNBSP}189`, `12${NNBSP}345`, '0']],
    ['hi', ['41.6', '1,189', '12,345', '0']],
    ['zh-Hans', ['41.6', '1,189', '12,345', '0']],
  ])('%s numbers: at most one decimal, Latin numerals, the locale’s separators', (lang, expected) => {
    const { formatNumber } = textsIn(lang);
    expect([41.64, 1189, 12345, 0.04].map(formatNumber)).toEqual(expected);
  });

  test.each([
    ['es', '1, 2 y 3'],
    ['en', '1, 2, and 3'],
    ['fr', '1, 2 et 3'],
    ['hi', '1, 2, और 3'],
    ['zh-Hans', '1、2和3'],
  ])('%s lists: «%s»', (lang, expected) => {
    expect(textsIn(lang).formatList([1, 2, 3])).toBe(expected);
  });
});
