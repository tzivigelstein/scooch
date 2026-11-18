// The site's pages the editor links to (src/site/links.ts) exist: in every
// language of the editor, each address is a page the build writes, in that
// language. A language whose content leaves one of them out (docs/site.md,
// «No fallback») fails here, naming the page. And the editor calls each page
// what the page calls itself.
import { describe, expect, test } from 'vitest';
import { LANGUAGES } from '../../src/core/language.js';
import { CATALOGUES } from '../../src/copy/all.ts';
import { EDITOR_LINKS, sitePath } from '../../src/site/links.ts';
import { readLegal, sitePages } from '../../src/site/site.ts';

const pages = sitePages(readLegal(process.cwd()));

describe.each(LANGUAGES)('%s', (language) => {
  test.each(EDITOR_LINKS)('%s: the editor’s link is a page the site builds, in this language', (id) => {
    const path = sitePath(language, id);
    const page = pages.find((p) => p.path === path);
    expect(page, `${path}: no page of the site has this address`).toBeDefined();
    expect({ id: page!.id, lang: page!.lang }).toEqual({ id, lang: language });
  });

  test('the links are named by the pages’ headings', () => {
    const h1 = (id: string) => pages.find((p) => p.path === sitePath(language, id as (typeof EDITOR_LINKS)[number]))!.h1;
    const { prefs, legal } = CATALOGUES[language];
    expect([prefs.faq, legal.terms, legal.privacy]).toEqual(EDITOR_LINKS.map(h1));
  });
});
