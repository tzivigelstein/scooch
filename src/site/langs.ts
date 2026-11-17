// The site's languages are the interface's (src/core/language.js), each
// named in itself as «Idioma» names it (src/copy/languages.ts). A page exists
// in a language only when that language's content has it (src/site/content),
// and hreflang links are written only between versions that exist (seo.ts).

import { LANGUAGES, type Language } from '../core/language.js';
import { LANGUAGE_NAMES } from '../copy/languages.ts';

export { LANGUAGES };

export type Lang = Language;

/** The first part of the addresses of a language's pages: «/es», «/zh-hans» (addresses are lowercase). */
export const pathPrefix = (lang: Lang) => `/${lang.toLowerCase()}`;

/** What `hreflang` and `<html lang>` say: the language's BCP 47 tag. */
export const hreflangOf = (lang: Lang) => lang;

/** The language's name in itself («English», «Español»), for the links between versions. */
export const languageName = (lang: Lang) => LANGUAGE_NAMES[lang];

/** Whose version is x-default (for searchers in a language with none), the first that exists. */
export const DEFAULT_LANGS: readonly Lang[] = ['en', 'es'];
