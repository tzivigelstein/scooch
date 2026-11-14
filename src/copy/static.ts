// The texts index.html carries itself, filled in while Vite serves and builds
// it (vite.config.ts), so they are there before any script runs:
//
// - `{{key}}`: the Spanish text of that key (the title, the description, the
//   loading screen), what crawlers read;
// - `{{noscript}}`: the no-JavaScript message in every language, each marked
//   with its own `lang` (without scripts nothing can choose one);
// - `{{bootCopy}}`: the JSON the head's script reads to show the page in the
//   chosen language before the first paint: the languages, each one's title,
//   description, heading, the loading screen's name and what replaces it if
//   the editor can't open (services/bootFailure.ts), and, in a build, the
//   file of each one's texts and fonts to preload, and the @font-face of
//   those fonts;
// - `{{matchLanguage}}`: the source of core/language.js matchLanguage, so the
//   head's script picks the browser's language exactly as the app does.

import { LANGUAGES, matchLanguage, type Language } from '../core/language.js';
import { CATALOGUES } from './all.ts';
import { textsFor } from './index.ts';

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What a build knows of each language's files: its texts' chunk and the fonts it needs (URLs), and their @font-face (CSS). */
export interface LanguageFiles {
  chunks?: Partial<Record<Language, string>>;
  fonts?: Partial<Record<Language, readonly string[]>>;
  styles?: Partial<Record<Language, string>>;
}

/** The data of `{{bootCopy}}`. */
export function bootCopy(files: LanguageFiles = {}) {
  const texts = Object.fromEntries(
    LANGUAGES.map((language) => {
      const { t } = textsFor(CATALOGUES[language]);
      return [language, { title: t('app.title'), description: t('app.description'), heading: t('app.heading'), loading: t('busy.loading'), failed: t('app.bootFailed'), reload: t('notices.reload') }];
    })
  );
  return { languages: LANGUAGES, texts, chunks: files.chunks ?? {}, fonts: files.fonts ?? {}, styles: files.styles ?? {} };
}

// Inside <script type="application/json">: nothing in it may close the element.
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

const noscript = () => LANGUAGES.map((language) => `<p lang="${language}">${escapeHtml(textsFor(CATALOGUES[language]).t('app.noscript'))}</p>`).join('');

/** index.html with its placeholders filled in (see above). */
export function fillStaticCopy(html: string, files: LanguageFiles = {}) {
  const { t } = textsFor(CATALOGUES.es);
  return html.replace(/\{\{([\w.]+)\}\}/g, (_, key: string) => {
    if (key === 'bootCopy') return scriptJson(bootCopy(files));
    if (key === 'matchLanguage') return matchLanguage.toString();
    if (key === 'noscript') return noscript();
    return escapeHtml(t(key as Parameters<typeof t>[0]));
  });
}
