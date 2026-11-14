// The interface language: the one chosen in «Preferencias» or, on
// «Automático», the browser's best match (core/language.js), kept up to date
// when the choice, the browser's languages or another tab change it. Only
// that language's texts download (copy/load.ts). The script in index.html
// chooses the same way before the first paint, so the page already has the
// right `lang`, title and loading screen when this takes over.

import { LANGUAGE_STORAGE } from '../config.ts';
import { LANGUAGES, matchLanguage, resolveLanguage, type Language } from '../core/language.js';
import { setTexts, t, type Catalogue } from '../copy/index.ts';
import { loadCatalogue } from '../copy/load.ts';
import { useLanguage } from '../state/language.ts';
import { readStoredLanguage, usePrefs } from '../state/prefs.ts';

/** The browser's languages, most preferred first. */
const browserLanguages = () => (navigator.languages?.length ? navigator.languages : [navigator.language]);

/** The language «Automático» shows: the browser's best match. */
export const browserLanguage = () => matchLanguage(browserLanguages(), LANGUAGES);

/** The language the interface should show now. */
export const wantedLanguage = () => resolveLanguage(usePrefs.getState().language, browserLanguages());

/** Installs the texts and says the page's language, title and description in it. */
export function applyTexts(language: Language, messages: Catalogue) {
  setTexts(messages);
  document.documentElement.lang = messages.meta.lang;
  document.title = t('app.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('app.description'));
  useLanguage.setState({ language });
}

let wanted: Language | null = null;

/** Shows `language` once its texts are here, unless another was asked for meanwhile. */
async function show(language: Language) {
  wanted = language;
  const messages = await loadCatalogue(language);
  if (wanted === language) applyTexts(language, messages);
}

/**
 * Starts following the choice, the browser and the other tabs. `ready`
 * settles once the first texts are installed (the app renders after it);
 * a later language that fails to download leaves the current one on screen.
 */
export function followLanguage() {
  const update = () => void show(wantedLanguage()).catch(() => {});
  const fromOtherTab = (e: StorageEvent) => {
    // key null: another tab cleared this site's storage.
    if (e.key === LANGUAGE_STORAGE || e.key === null) readStoredLanguage();
  };
  const ready = show(wantedLanguage());
  const unsubscribe = usePrefs.subscribe((now, before) => {
    if (now.language !== before.language) update();
  });
  window.addEventListener('languagechange', update);
  window.addEventListener('storage', fromOtherTab);
  const stop = () => {
    unsubscribe();
    window.removeEventListener('languagechange', update);
    window.removeEventListener('storage', fromOtherTab);
  };
  return { ready, stop };
}
