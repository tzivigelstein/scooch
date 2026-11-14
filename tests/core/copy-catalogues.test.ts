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

describe.each(LANGUAGES.map((language) => [language, CATALOGUES[language]] as const))('%s', (language, catalogue: Catalogue) => {
  const own = leaves(catalogue as unknown as Tree, es as unknown as Tree);

  test('has exactly the keys of es.ts', () => {
    expect([...SPANISH.keys()].filter((key) => !own.has(key)), 'missing').toEqual([]);
    expect([...own.keys()].filter((key) => !SPANISH.has(key)), 'not in es.ts').toEqual([]);
  });

  test('each text has the parameters and links of its Spanish one', () => {
    for (const [key, spanish] of SPANISH) {
      const value = own.get(key);
      if (value === undefined) continue;
      expect(typeof value === 'string', `${key}: a plural where Spanish has one, and only there`).toBe(typeof spanish === 'string');
      expect(params(value), `${key}: parameters`).toEqual(params(spanish));
      if (typeof value === 'string') expect(links(value), `${key}: <link>…</link>`).toEqual(links(spanish));
    }
  });

  test('each plural has exactly the forms of its language (and maybe «zero»)', () => {
    const categories = integerCategories(catalogue.meta.lang);
    for (const [key, value] of own) {
      if (typeof value === 'string') continue;
      expect(Object.keys(value).filter((form) => form !== 'zero').sort(), `${key}: forms for ${categories.join(', ')}`).toEqual(categories);
    }
  });

  test('says its language and number locale, and its texts are in normalized form (NFC)', () => {
    expect(catalogue.meta.lang).toBe(language);
    expect(Intl.NumberFormat.supportedLocalesOf([catalogue.meta.numberLocale])).toHaveLength(1);
    for (const [key, value] of own) for (const text of forms(value)) expect(text === text.normalize('NFC'), `${key}: NFC`).toBe(true);
  });
});
