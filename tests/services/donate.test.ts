// @vitest-environment jsdom
// When the donation dialog shows (donateUrl, shouldAskDonation): only with a
// valid https Patreon URL (config's DONATE_URL; on localhost ?donar= can try
// one), once per page load, and never again on this device once «No volver a
// mostrar» was checked when it closed. Each test loads donate.ts afresh (a
// new page load: «this session» starts over, localStorage stays).
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// DONATE_URL is '' in the repo; tests set what it would be.
const config = vi.hoisted(() => ({ donateUrl: '' }));
vi.mock('../../src/config.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/config.ts')>();
  return {
    ...real,
    get DONATE_URL() {
      return config.donateUrl;
    },
  };
});

const PATREON = 'https://www.patreon.com/ejemplo';

/** A fresh page load of the dialog's logic (and of the storage it reads). */
async function load() {
  vi.resetModules();
  const donate = await import('../../src/components/dialogs/donate.ts');
  const storage = await import('../../src/services/storage/local.ts');
  const { DONATE_STORAGE } = await import('../../src/config.ts');
  return { ...donate, dismissed: () => storage.storageGet(DONATE_STORAGE) };
}

/** Opens the dialog and closes it with «Seguir sin aportar», with «No volver a mostrar» checked or not. */
async function askAndSkip(donate: Awaited<ReturnType<typeof load>>, never: boolean) {
  document.body.innerHTML = `<input type="checkbox" id="donate-never"${never ? ' checked' : ''}>`;
  const asked = donate.askDonation();
  await vi.waitFor(() => expect(donate.isDonationOpen()).toBe(true));
  donate.finishDonation('skip');
  expect(await asked).toBe('skip');
  expect(donate.isDonationOpen()).toBe(false);
}

const visit = (query: string) => window.history.replaceState(null, '', `/${query}`);

beforeEach(() => {
  config.donateUrl = '';
  localStorage.clear();
  visit('');
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('the Patreon URL', () => {
  test('without a URL: no dialog, the export goes straight on', async () => {
    const donate = await load();
    expect(donate.donateUrl()).toBe('');
    expect(donate.shouldAskDonation()).toBe(false);
  });

  test('on localhost, ?donar= with an https URL is tried', async () => {
    visit(`?donar=${encodeURIComponent(PATREON)}`);
    const donate = await load();
    expect(donate.donateUrl()).toBe(PATREON);
    expect(donate.shouldAskDonation()).toBe(true);
  });

  test('the configured URL is used when there is no ?donar=', async () => {
    config.donateUrl = 'https://www.patreon.com/scooch';
    const donate = await load();
    expect(donate.donateUrl()).toBe('https://www.patreon.com/scooch');
    expect(donate.shouldAskDonation()).toBe(true);
  });

  test('an invalid URL (not https, or with spaces) is no URL: no dialog', async () => {
    for (const url of ['javascript:alert(1)', 'http://www.patreon.com/ejemplo', 'https://', 'https://www.patreon.com/a b', 'patreon.com/ejemplo']) {
      visit(`?donar=${encodeURIComponent(url)}`);
      const donate = await load();
      expect(donate.donateUrl(), url).toBe('');
      expect(donate.shouldAskDonation(), url).toBe(false);
    }
  });

  test('outside localhost ?donar= is ignored and the configured URL stays', async () => {
    const away = (search: string) => vi.stubGlobal('location', { hostname: 'scooch.app', search });
    const donate = await load();
    away(`?donar=${encodeURIComponent(PATREON)}`);
    expect(donate.donateUrl()).toBe('');
    config.donateUrl = 'https://www.patreon.com/scooch';
    expect(donate.donateUrl()).toBe('https://www.patreon.com/scooch');
    // The same query on localhost does override it.
    vi.stubGlobal('location', { hostname: '127.0.0.1', search: `?donar=${encodeURIComponent(PATREON)}` });
    expect(donate.donateUrl()).toBe(PATREON);
  });
});

describe('how often it shows', () => {
  beforeEach(() => visit(`?donar=${encodeURIComponent(PATREON)}`));

  test('once per page load: after it showed, printing or downloading again goes straight on', async () => {
    const donate = await load();
    expect(donate.shouldAskDonation()).toBe(true);
    await askAndSkip(donate, false);
    expect(donate.shouldAskDonation()).toBe(false);
    expect(donate.dismissed()).toBeNull();
    // The next page load asks again.
    expect((await load()).shouldAskDonation()).toBe(true);
  });

  test('«No volver a mostrar» checked when it closes: never again on this device, after a reload too', async () => {
    const donate = await load();
    await askAndSkip(donate, true);
    expect(donate.dismissed()).toBe('never');
    const reloaded = await load();
    expect(reloaded.shouldAskDonation()).toBe(false);
  });

  test('«No volver a mostrar» counts however it closes', async () => {
    for (const via of ['cta', 'close', 'esc', 'backdrop'] as const) {
      localStorage.clear();
      const donate = await load();
      document.body.innerHTML = '<input type="checkbox" id="donate-never" checked>';
      const asked = donate.askDonation();
      await vi.waitFor(() => expect(donate.isDonationOpen()).toBe(true));
      donate.finishDonation(via);
      expect(await asked, via).toBe(via);
      expect((await load()).shouldAskDonation(), via).toBe(false);
    }
  });

  test('saved under the app’s former name (before the rename), it is still honoured', async () => {
    localStorage.setItem('donate-dismissed', 'never');
    const donate = await load();
    expect(donate.shouldAskDonation()).toBe(false);
    expect(donate.dismissed()).toBe('never');
  });
});
