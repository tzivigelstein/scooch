// @vitest-environment jsdom
// The theme the page shows (src/services/theme.ts), with the head of
// index.html: the chosen one or, on «Automático», the system's as it changes;
// one stored by another tab; and the script in index.html that applies the
// stored one before the first paint, which must read every stored version as
// the app does.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { THEME_STORAGE } from '../../src/config.ts';
import { fillStaticCopy } from '../../src/copy/static.ts';
import { parseThemePref, resolveTheme } from '../../src/core/storedprefs.js';
import { DARK_QUERY, followTheme } from '../../src/services/theme.ts';
import { getPrefs, setTheme } from '../../src/state/prefs.ts';
import { resetState } from '../support/state.ts';

// As Vite serves it, with its texts filled in (the head's script also reads them).
const HEAD = fillStaticCopy(readFileSync(join(import.meta.dirname, '../../index.html'), 'utf8')).match(/<head>([\s\S]*)<\/head>/)![1];
const BOOT_SCRIPT = [...HEAD.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

const STORAGE_FIXTURES = join(import.meta.dirname, '../fixtures/storage');
const storedVersions = readdirSync(STORAGE_FIXTURES)
  .filter((file) => file.startsWith('theme-preference-'))
  .map((file) => JSON.stringify(JSON.parse(readFileSync(join(STORAGE_FIXTURES, file), 'utf8')).value));

/** The system's theme, which a test changes as a person would in their settings. */
function fakeSystem(dark = false) {
  const listeners = new Set<() => void>();
  const list = {
    media: DARK_QUERY,
    get matches() {
      return dark;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', (query: string) => (query === DARK_QUERY ? list : null));
  return {
    set(value: boolean) {
      dark = value;
      for (const listener of listeners) listener();
    },
  };
}

/** What the page shows of the theme: the tokens' theme, the native controls' and which bar color applies. */
const shown = () => ({
  theme: document.documentElement.dataset.theme,
  colorScheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content'),
  bar: Object.fromEntries([...document.querySelectorAll('meta[name="theme-color"]')].map((meta) => [meta.getAttribute('content'), meta.getAttribute('media')])),
});

const SHOWS = {
  light: { theme: 'light', colorScheme: 'light', bar: { '#ffffff': 'all', '#121418': 'not all' } },
  dark: { theme: 'dark', colorScheme: 'dark', bar: { '#ffffff': 'not all', '#121418': 'all' } },
};

/** Another tab stored `raw` (null: it cleared the storage) and this one hears of it. */
function storedByAnotherTab(raw: string | null, key: string | null = THEME_STORAGE) {
  if (raw === null) localStorage.clear();
  else localStorage.setItem(key!, raw);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue: raw }));
}

let stop: (() => void) | undefined;

beforeEach(() => {
  resetState();
  localStorage.clear();
  document.head.innerHTML = HEAD;
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the theme shown', () => {
  test('on «Automático» it follows the system as it changes', () => {
    const system = fakeSystem();
    stop = followTheme();
    expect(shown()).toEqual(SHOWS.light);
    system.set(true);
    expect(shown()).toEqual(SHOWS.dark);
    system.set(false);
    expect(shown()).toEqual(SHOWS.light);
  });

  test('a chosen theme shows at once and stays whatever the system does', () => {
    const system = fakeSystem();
    stop = followTheme();
    setTheme('dark');
    expect(shown()).toEqual(SHOWS.dark);
    system.set(true);
    system.set(false);
    expect(shown()).toEqual(SHOWS.dark);
    setTheme('light');
    system.set(true);
    expect(shown()).toEqual(SHOWS.light);
    setTheme('auto');
    expect(shown()).toEqual(SHOWS.dark);
  });

  test('a theme another tab stores shows here too, without writing it again; other keys change nothing', () => {
    fakeSystem();
    stop = followTheme();
    const writes: string[] = [];
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      writes.push(key);
      return setItem.call(this, key, value);
    });

    storedByAnotherTab(JSON.stringify({ v: 1, theme: 'dark' }));
    expect(getPrefs().theme).toBe('dark');
    expect(shown()).toEqual(SHOWS.dark);
    expect(writes, 'only the other tab wrote').toEqual([THEME_STORAGE]);

    storedByAnotherTab('cm', 'scooch:unit-preference');
    expect(getPrefs().theme).toBe('dark');

    storedByAnotherTab(null, null);
    expect(getPrefs().theme).toBe('auto');
    expect(shown()).toEqual(SHOWS.light);
  });

  test('the script in index.html shows every stored version, nothing stored and something unreadable as the app reads them', () => {
    expect(BOOT_SCRIPT, 'one classic script in the head').toHaveLength(1);
    expect(storedVersions.length).toBeGreaterThan(0);
    for (const raw of [...storedVersions, null, '{"v":1,"theme":"sepia"}', 'oscuro'])
      for (const systemDark of [false, true]) {
        localStorage.clear();
        if (raw !== null) localStorage.setItem(THEME_STORAGE, raw);
        document.head.innerHTML = HEAD;
        delete document.documentElement.dataset.theme;
        fakeSystem(systemDark);
        new Function(BOOT_SCRIPT[0])();
        let saved: unknown = null;
        try {
          saved = JSON.parse(raw ?? 'null');
        } catch {
          // Unreadable: read as nothing stored.
        }
        const expected = resolveTheme(parseThemePref(saved).theme, systemDark);
        expect(shown(), `${raw} with a ${systemDark ? 'dark' : 'light'} system`).toEqual(SHOWS[expected]);
      }
  });
});
