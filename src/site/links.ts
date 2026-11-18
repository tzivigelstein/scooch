// The site's pages the editor links to, in each of its languages: the
// questions (from «Preferencias» and the command palette), the terms and the
// privacy policy (from «Preferencias»). Their addresses come from each
// language's own table (content/<lang>/paths.ts): those tables are all the
// editor takes from the site, so it never bundles the pages themselves.
// tests/site/editor-links.test.ts checks that the site builds each of these
// pages in every language.

import type { Language } from '../core/language.js';
import { PATHS as en } from './content/en/paths.ts';
import { PATHS as es } from './content/es/paths.ts';
import { PATHS as fr } from './content/fr/paths.ts';
import { PATHS as hi } from './content/hi/paths.ts';
import { PATHS as zhHans } from './content/zh-Hans/paths.ts';
import type { PageId } from './types.ts';

export const EDITOR_LINKS = Object.freeze(['faq', 'legal-terms', 'legal-privacy'] as const satisfies readonly PageId[]);

export type EditorLink = (typeof EDITOR_LINKS)[number];

const PATHS: Readonly<Record<Language, Readonly<Record<PageId, string>>>> = Object.freeze({ es, en, 'zh-Hans': zhHans, hi, fr });

/** The address of the site's `page` in `language`. */
export const sitePath = (language: Language, page: EditorLink) => PATHS[language][page];
