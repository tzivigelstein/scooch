// @vitest-environment jsdom
// The interface language (src/services/language.ts) with the page of
// index.html: the scripts that choose it before the first paint, reading
// every stored version and the browser's languages as the app does, and the
// app following the choice, the browser and the other tabs afterwards.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { LANGUAGE_STORAGE } from '../../src/config.ts';
import { LANGUAGES, resolveLanguage } from '../../src/core/language.js';
import { parseLanguagePref } from '../../src/core/storedprefs.js';
import { CATALOGUES } from '../../src/copy/all.ts';
import { textsFor, textsLanguage } from '../../src/copy/index.ts';
import { loadCatalogue } from '../../src/copy/load.ts';
import { fillStaticCopy } from '../../src/copy/static.ts';
import { followLanguage } from '../../src/services/language.ts';
import { useLanguage } from '../../src/state/language.ts';
import { getPrefs, setLanguage } from '../../src/state/prefs.ts';
import { resetState } from '../support/state.ts';

// As Vite builds it, with a file for each language's texts, and Hindi's font with its @font-face.
const CHUNKS = Object.fromEntries(LANGUAGES.map((language) => [language, `/assets/copy-${language}-x.js`]));
const FONT = '/assets/noto-sans-devanagari-x.woff2';
const FACE = `@font-face{font-family:Noto Sans Devanagari Variable;src:url(${FONT})}`;
const PAGE = fillStaticCopy(readFileSync(join(import.meta.dirname, '../../index.html'), 'utf8'), { chunks: CHUNKS, fonts: { hi: [FONT] }, styles: { hi: FACE } });
const HEAD = PAGE.match(/<head>([\s\S]*)<\/head>/)![1];
const BODY = PAGE.match(/<body[^>]*>([\s\S]*)<\/body>/)![1];
const scripts = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

const STORAGE_FIXTURES = join(import.meta.dirname, '../fixtures/storage');
const storedVersions = readdirSync(STORAGE_FIXTURES)
  .filter((file) => file.startsWith('language-preference-'))
  .map((file) => JSON.stringify(JSON.parse(readFileSync(join(STORAGE_FIXTURES, file), 'utf8')).value));

/** The browser's languages, as a person sets them. */
function browserSpeaks(languages: readonly string[]) {
  vi.stubGlobal('navigator', { ...navigator, languages, language: languages[0] });
}

/** What the page says of its language. */
const shown = () => ({
  lang: document.documentElement.lang,
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
});

const expected = (language: (typeof LANGUAGES)[number]) => {
  const { t } = textsFor(CATALOGUES[language]);
  return { lang: language, title: t('app.title'), description: t('app.description') };
};

let stop: (() => void) | undefined;

beforeEach(() => {
  resetState();
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  document.head.innerHTML = HEAD;
  document.body.innerHTML = BODY;
  document.documentElement.lang = 'es';
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('before the first paint', () => {
  test('the head’s script says the stored language, or the browser’s, as the app reads them, and preloads its texts (and Hindi’s font)', () => {
    const [head] = scripts(HEAD);
    expect(scripts(HEAD), 'one classic script in the head').toHaveLength(1);
    expect(storedVersions.length).toBeGreaterThan(0);
    for (const raw of [...storedVersions, null, '{"v":1,"language":"klingon"}', 'español'])
      for (const browser of [['es-AR'], ['en-US', 'es'], ['zh-TW', 'zh'], ['hi-IN'], ['fr-CA'], ['de']]) {
        localStorage.clear();
        if (raw !== null) localStorage.setItem(LANGUAGE_STORAGE, raw);
        document.head.innerHTML = HEAD;
        browserSpeaks(browser);
        new Function(head)();
        let saved: unknown = null;
        try {
          saved = JSON.parse(raw ?? 'null');
        } catch {
          // Unreadable: read as nothing stored.
        }
        const language = resolveLanguage(parseLanguagePref(saved).language, browser);
        const label = `${raw} with ${browser.join(', ')}`;
        expect(shown(), label).toEqual(expected(language));
        expect([...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].map((link) => link.getAttribute('href')), label).toEqual([CHUNKS[language]]);
        const hindi = language === 'hi';
        expect([...document.querySelectorAll<HTMLLinkElement>('link[rel="preload"][as="font"]')].map((link) => link.getAttribute('href')).filter((href) => href === FONT), `${label}: Hindi's font, only in Hindi`).toEqual(hindi ? [FONT] : []);
        expect([...document.querySelectorAll('style')].some((style) => style.textContent === FACE), `${label}: its @font-face, only in Hindi`).toBe(hindi);
      }
  });

  test('the loading screen comes in the language the head chose', () => {
    for (const language of LANGUAGES) {
      document.body.innerHTML = BODY;
      document.documentElement.lang = language;
      for (const script of scripts(BODY)) new Function(script)();
      const { t } = textsFor(CATALOGUES[language]);
      expect(document.querySelector('.boot-about')?.textContent, language).toBe(t('app.description'));
      expect(document.querySelector('.boot h1')?.textContent, language).toBe(t('app.heading'));
    }
  });
});

describe('the app', () => {
  test('installs the texts of the language it shows before it renders, and says it on the page', async () => {
    browserSpeaks(['es-AR']);
    useLanguage.setState({ language: null });
    const follow = followLanguage();
    stop = follow.stop;
    await follow.ready;
    expect(textsLanguage()).toBe('es');
    expect(useLanguage.getState().language).toBe('es');
    expect(shown()).toEqual(expected('es'));
  });

  test('a language another tab stores is this one’s too, without writing it again', async () => {
    const follow = followLanguage();
    stop = follow.stop;
    await follow.ready;
    const writes: string[] = [];
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      writes.push(key);
      return setItem.call(this, key, value);
    });
    localStorage.setItem(LANGUAGE_STORAGE, JSON.stringify({ v: 1, language: 'es' }));
    window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE }));
    expect(getPrefs().language).toBe('es');
    expect(writes, 'only the other tab wrote').toEqual([LANGUAGE_STORAGE]);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(getPrefs().language).toBe('auto');
  });

  test('another language shows as soon as its texts arrive; on «Automático» it follows the browser’s languages as they change', async () => {
    browserSpeaks(['es-AR']);
    const follow = followLanguage();
    stop = follow.stop;
    await follow.ready;
    expect(shown()).toEqual(expected('es'));
    setLanguage('en');
    await vi.waitFor(() => expect(textsLanguage()).toBe('en'));
    expect(shown()).toEqual(expected('en'));
    expect(useLanguage.getState().language).toBe('en');
    setLanguage('auto');
    await vi.waitFor(() => expect(textsLanguage()).toBe('es'));
    browserSpeaks(['en-GB', 'es']);
    window.dispatchEvent(new Event('languagechange'));
    await vi.waitFor(() => expect(textsLanguage()).toBe('en'));
    expect(shown()).toEqual(expected('en'));
  });

  test('the last language chosen wins, even if an earlier one arrives later', async () => {
    browserSpeaks(['es-AR']);
    const follow = followLanguage();
    stop = follow.stop;
    await follow.ready;
    for (const language of LANGUAGES) setLanguage(language);
    setLanguage('es');
    // Once every download is done (each one's own continuation comes right after it).
    await Promise.all(LANGUAGES.map(loadCatalogue));
    await Promise.resolve();
    expect(textsLanguage()).toBe('es');
    expect(shown()).toEqual(expected('es'));
  });

  test('choosing a language stores it', async () => {
    const follow = followLanguage();
    stop = follow.stop;
    await follow.ready;
    setLanguage('es');
    expect(JSON.parse(localStorage.getItem(LANGUAGE_STORAGE)!)).toEqual({ v: 1, language: 'es' });
  });
});
