// Every language's texts (src/copy/<language>.ts) against Spanish's, the
// source of the keys: the same keys, each text with the same parameters and
// links, and each plural with exactly the forms its language has. A key added
// to es.ts and missing elsewhere fails here, by name.
import { describe, expect, test } from 'vitest';
import { LANGUAGES } from '../../src/core/language.js';
import { CATALOGUES } from '../../src/copy/all.ts';
import es from '../../src/copy/es.ts';
import type { Catalogue } from '../../src/copy/index.ts';

type Tree = { [key: string]: string | Tree };

const isPlural = (node: unknown): node is Record<string, string> =>
  !!node && typeof node === 'object' && typeof (node as Tree).other === 'string' && Object.values(node as Tree).every((v) => typeof v === 'string') && Object.keys(node as Tree).every((k) => ['zero', 'one', 'two', 'few', 'many', 'other'].includes(k));

/** Every text by its key; a plural as one entry with its forms. */
function leaves(tree: Tree, spanish: Tree = tree, prefix = ''): Map<string, string | Record<string, string>> {
  const out = new Map<string, string | Record<string, string>>();
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key}`;
    // A plural is what Spanish has as one ({ one, other }); elsewhere it may have other forms.
    if (typeof value === 'string' || isPlural(spanish?.[key] as Tree) || isPlural(value)) out.set(path, value as string | Record<string, string>);
    else for (const [k, v] of leaves(value, (spanish?.[key] ?? {}) as Tree, `${path}.`)) out.set(k, v);
  }
  return out;
}

const forms = (value: string | Record<string, string>) => (typeof value === 'string' ? [value] : Object.values(value));
const params = (value: string | Record<string, string>) => [...new Set(forms(value).flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
const links = (value: string | Record<string, string>) => forms(value).map((text) => (text.match(/<\/?link>/g) ?? []).join(''));

/** The plural categories a language uses for whole numbers (what counts of pieces and sheets are). */
const integerCategories = (lang: string) => {
  const rules = new Intl.PluralRules(lang);
  return [...new Set(Array.from({ length: 1001 }, (_, n) => rules.select(n)))].sort();
};

const SPANISH = leaves(es as unknown as Tree);

/** Words a text may share with Spanish in another language: key names, a paper's name, technical terms, a few that French spells the same. */
const SHARED_WORDS = new Set(['ctrl', 'control', 'shift', 'alt', 'tab', 'enter', 'esc', 'pdf', 'jpg', 'png', 'webp', 'folio', 'general', 'original', 'zoom', 'color', 'patreon', 'clic', 'visa', 'gris']);

/** What no text of a language may have (its typography: docs/copy/<language>.md). */
const TYPOGRAPHY: Record<string, readonly { rule: string; bad: RegExp }[]> = {
  en: [
    { rule: 'curly quotes and apostrophes (“ ” ’), not straight ones or guillemets', bad: /["'«»]/ },
    { rule: 'no space before %', bad: /\d %|\} %/ },
  ],
  'zh-Hans': [
    { rule: 'full-width punctuation next to Chinese (，。：；！？（）)', bad: /[\u3400-\u9fff][,.:;!?()]|[,:;!?(][\u3400-\u9fff]/ },
    { rule: 'no space between Chinese and a number or a Latin word', bad: /[\u3400-\u9fff] [\w{]|[\w}] [\u3400-\u9fff]/ },
    { rule: 'Chinese quotes (“ ”), not guillemets or straight ones', bad: /["«»]/ },
  ],
  fr: [
    { rule: 'a no-break space before : and inside « », a narrow one before ; ! ? and %', bad: /[^\u00a0\u202f][:;!?»%]|«[^\u00a0\u202f]/ },
    { rule: 'typographic apostrophe (’), not a straight one', bad: /['"]/ },
  ],
  hi: [
    { rule: 'a sentence ends with ।, not with a point', bad: /[\u0900-\u097f]\.(\s|$)/ },
    { rule: 'curly quotes (“ ”), not guillemets or straight ones', bad: /["«»]/ },
    { rule: 'no space before %', bad: /\d %|\} %/ },
  ],
};

/** The words that find a command in the palette: search data, never shown (commas split them). */
const SEARCH_ONLY = /^commands\.aliases\./;

/** A number and its unit, and a measurement, never break: a no-break space in every language. */
const UNBREAKABLE = ['units.length', 'units.size', 'props.gridChip', 'cuts.weightTip'];

describe.each(LANGUAGES.map((language) => [language, CATALOGUES[language]] as const))('%s', (language, catalogue: Catalogue) => {
  const own = leaves(catalogue as unknown as Tree, es as unknown as Tree);

  test('has exactly the keys of es.ts', () => {
    // Each missing key with its Spanish text, ready to translate (how: docs/copy.md, «Idiomas»).
    const missing = [...SPANISH].filter(([key]) => !own.has(key)).map(([key, spanish]) => `${key}: ${JSON.stringify(spanish)}`);
    expect(missing, `in es.ts but not in src/copy/${language}.ts: add each one, translated as docs/copy/${language}.md says`).toEqual([]);
    const extra = [...own.keys()].filter((key) => !SPANISH.has(key));
    expect(extra, `in src/copy/${language}.ts but no longer in es.ts: remove them`).toEqual([]);
  });

  test('each text has the parameters and links of its Spanish one', () => {
    for (const [key, spanish] of SPANISH) {
      const value = own.get(key);
      if (value === undefined) continue;
      expect(typeof value === 'string', `${key}: a plural where Spanish has one, and only there`).toBe(typeof spanish === 'string');
      expect(params(value), `${key}: the parameters of the Spanish ${JSON.stringify(spanish)}`).toEqual(params(spanish));
      if (typeof value === 'string') expect(links(value), `${key}: the <link>…</link> of the Spanish ${JSON.stringify(spanish)}`).toEqual(links(spanish));
      // Every form of a plural keeps what every Spanish form says («{max}»), whatever it says of the count.
      const always = params(spanish).filter((name) => forms(spanish).every((text) => text.includes(`{${name}}`)));
      for (const [form, text] of Object.entries(typeof value === 'string' ? { text: value } : value))
        expect(always.filter((name) => !text.includes(`{${name}}`)), `${key}.${form}: parameters every Spanish form has (${JSON.stringify(spanish)})`).toEqual([]);
    }
  });

  test('each plural has exactly the forms of its language (and maybe «zero»)', () => {
    const categories = integerCategories(catalogue.meta.lang);
    for (const [key, value] of own) {
      if (typeof value === 'string') continue;
      expect(Object.keys(value).filter((form) => form !== 'zero').sort(), `${key}: forms for ${categories.join(', ')}`).toEqual(categories);
    }
  });

  test('nothing is left in Spanish: a text the same as Spanish’s has only words every language shares', () => {
    if (language === 'es') return;
    const left = [...own].filter(([key, value]) => {
      const spanish = SPANISH.get(key);
      return JSON.stringify(value) === JSON.stringify(spanish) && forms(value).some((text) => (text.replace(/\{\w+\}/g, '').match(/\p{L}{3,}/gu) ?? []).some((word) => !SHARED_WORDS.has(word.toLowerCase())));
    });
    expect(left.map(([key, value]) => `${key}: ${JSON.stringify(value)}`)).toEqual([]);
  });

  test('follows its typography; numbers and units never break apart', () => {
    for (const [key, value] of own) {
      if (SEARCH_ONLY.test(key)) continue;
      for (const text of forms(value)) for (const { rule, bad } of TYPOGRAPHY[language] ?? []) expect(bad.test(text), `${key}: ${rule}: «${text}»`).toBe(false);
    }
    for (const key of UNBREAKABLE) expect(own.get(key), key).not.toMatch(/\} \{| \{unit\}| pt$/);
  });

  test('says its language and number locale, and its texts are in normalized form (NFC)', () => {
    expect(catalogue.meta.lang).toBe(language);
    expect(Intl.NumberFormat.supportedLocalesOf([catalogue.meta.numberLocale])).toHaveLength(1);
    for (const [key, value] of own) for (const text of forms(value)) expect(text === text.normalize('NFC'), `${key}: NFC`).toBe(true);
  });
});
