// Which interface language a browser gets on «Automático» (src/core/language.js):
// the first of its languages we have, Chinese only in simplified script, and
// English when none fits.
import { describe, expect, test } from 'vitest';
import { LANGUAGES, isLanguage, matchLanguage, resolveLanguage } from '../../src/core/language.js';

const ALL = ['es', 'en', 'zh-Hans', 'hi', 'fr'];

describe('the browser’s best match', () => {
  test.each([
    [['es-AR', 'en'], 'es'],
    [['es'], 'es'],
    [['ES-mx'], 'es'],
    [['es_419'], 'es'],
    [['en-US', 'es'], 'en'],
    [['en-IN', 'hi'], 'en'],
    [['fr-CA', 'en'], 'fr'],
    [['fr-FR'], 'fr'],
    [['hi-IN', 'en-IN'], 'hi'],
    [['hi'], 'hi'],
    [['zh'], 'zh-Hans'],
    [['zh-CN', 'zh'], 'zh-Hans'],
    [['zh-SG'], 'zh-Hans'],
    [['zh-Hans'], 'zh-Hans'],
    [['zh-Hans-HK'], 'zh-Hans'],
    // Traditional Chinese is skipped, and so is a bare «zh» after it.
    [['zh-TW'], 'en'],
    [['zh-HK', 'zh'], 'en'],
    [['zh-Hant'], 'en'],
    [['zh-Hant-CN'], 'en'],
    [['zh-MO', 'fr'], 'fr'],
    [['zh-TW', 'zh', 'es'], 'es'],
    // Hindi in Latin script isn't what this Hindi is.
    [['hi-Latn', 'es'], 'es'],
    // Nothing we have: English.
    [['de-DE', 'pt-BR'], 'en'],
    [['ar', 'fr'], 'fr'],
    [[], 'en'],
    [undefined, 'en'],
    [[42, null, 'fr'], 'fr'],
  ])('%j → %s', (tags, expected) => {
    expect(matchLanguage(tags, ALL)).toBe(expected);
  });

  test('only among the languages it is given; without English, the first of them', () => {
    expect(matchLanguage(['fr-CA', 'es'], ['es', 'en'])).toBe('es');
    expect(matchLanguage(['zh-CN'], ['es', 'en'])).toBe('en');
    expect(matchLanguage(['de'], ['es'])).toBe('es');
  });

  test('its source works on its own, as index.html inlines it', () => {
    const inlined = new Function(`return (${matchLanguage.toString()})`)();
    for (const tags of [['zh-TW', 'zh'], ['fr-CA'], ['hi-IN'], ['de']]) expect(inlined(tags, ALL)).toBe(matchLanguage(tags, ALL));
  });
});

describe('the language shown', () => {
  test('the chosen one, or the browser’s best match on «Automático» or anything else', () => {
    for (const language of LANGUAGES) {
      expect(isLanguage(language)).toBe(true);
      expect(resolveLanguage(language, ['de'])).toBe(language);
    }
    expect(resolveLanguage('auto', ['de'])).toBe(matchLanguage(['de'], LANGUAGES));
    expect(resolveLanguage('klingon', ['es'])).toBe('es');
    expect(isLanguage('auto')).toBe(false);
  });
});
