// Loading a language's texts: each catalogue is a chunk of its own, so the
// editor downloads only the language it shows (index.html preloads it).
// Hindi brings its font with it (styles/devanagari.css), and nothing else does.

import type { Language } from '../core/language.js';
import type { Catalogue } from './index.ts';

type Module = { default: Catalogue };

const CATALOGUES: Readonly<Record<Language, () => Promise<Module>>> = {
  es: () => import('./es.ts'),
  en: () => import('./en.ts'),
  'zh-Hans': () => import('./zh-Hans.ts'),
  hi: () => Promise.all([import('./hi.ts'), import('../styles/devanagari.css')]).then(([texts]) => texts),
};

const loaded = new Map<Language, Promise<Catalogue>>();

/** The texts of `language`, downloaded once (a failed download is tried again next time). */
export function loadCatalogue(language: Language): Promise<Catalogue> {
  let texts = loaded.get(language);
  if (!texts) {
    texts = CATALOGUES[language]().then((module) => module.default);
    texts.catch(() => loaded.delete(language));
    loaded.set(language, texts);
  }
  return texts;
}
