// The languages the site is ready for, with their hreflang codes. A page
// exists in a language only when its content does (only Spanish today), and
// hreflang links are written only between versions that exist (seo.ts).

export const LANGS = Object.freeze({
  es: { hreflang: 'es' },
  en: { hreflang: 'en' },
  'zh-Hans': { hreflang: 'zh-Hans' },
  hi: { hreflang: 'hi' },
  fr: { hreflang: 'fr' },
});

export type Lang = keyof typeof LANGS;

/** Whose version is x-default (for searchers in a language with none), the first that exists. */
export const DEFAULT_LANGS: readonly Lang[] = ['en', 'es'];
