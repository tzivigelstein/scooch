// @vitest-environment jsdom
// When the summary after printing asks for a donation (donateUrl,
// takeDonationAsk): only with a valid https Patreon URL (config's DONATE_URL;
// on localhost ?donar= can try one), once per page load, and never again on
// this device after «No volver a mostrar». Each test loads donate.ts afresh (a
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

/** A fresh page load of the request's logic (and of the storage it reads). */
async function load() {
  vi.resetModules();
  const donate = await import('../../src/components/dialogs/donate.ts');
  const storage = await import('../../src/services/storage/local.ts');
  const { DONATE_STORAGE } = await import('../../src/config.ts');
  return { ...donate, dismissed: () => storage.storageGet(DONATE_STORAGE) };
}

beforeEach(() => {
  localStorage.clear();
  config.donateUrl = '';
});
afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('the Patreon URL', () => {
  test('without a URL: it never asks', async () => {
    const donate = await load();
    expect(donate.donateUrl()).toBe('');
    expect(donate.takeDonationAsk()).toBe(false);
  });

  test('an invalid URL (not https, with spaces) counts as none', async () => {
    for (const url of ['http://www.patreon.com/x', 'https://patreon.com/a b', 'javascript:alert(1)']) {
      config.donateUrl = url;
      expect((await load()).takeDonationAsk(), url).toBe(false);
    }
  });

  test('on localhost, ?donar= tries one', async () => {
    window.history.replaceState(null, '', `/?donar=${encodeURIComponent(PATREON)}`);
    expect((await load()).donateUrl()).toBe(PATREON);
  });
});

describe('how often it asks', () => {
  beforeEach(() => {
    config.donateUrl = PATREON;
  });

  test('once per page load: after it asked, not again until the page loads again', async () => {
    let donate = await load();
    expect(donate.takeDonationAsk()).toBe(true);
    expect(donate.takeDonationAsk()).toBe(false);
    donate = await load();
    expect(donate.takeDonationAsk()).toBe(true);
  });

  test('«No volver a mostrar»: never again on this device', async () => {
    let donate = await load();
    donate.neverAskDonation();
    expect(donate.dismissed()).toBe('never');
    donate = await load();
    expect(donate.takeDonationAsk()).toBe(false);
  });
});
