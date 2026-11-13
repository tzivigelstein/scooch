// The donation dialog when printing or downloading. Honest: continuing without
// donating is just as easy, there are no countdowns or guilt, and the export
// asked for always goes on, however the dialog closes.

import { create } from 'zustand';
import { DONATE_EVERY, DONATE_STORAGE, DONATE_URL } from '../../config.ts';
import { storageGet, storageSet } from '../../services/storage/local.ts';
import { DonateContent } from './lazy.ts';

export type DonateVia = 'cta' | 'skip' | 'close' | 'esc' | 'backdrop';

interface DonateState {
  /** Open, with what resolves askDonation and who opened it. */
  request: { resolve: (via: DonateVia) => void; opener: Element | null } | null;
}

export const useDonate = create<DonateState>()(() => ({ request: null }));

let askedThisSession = false;

/** The Patreon URL; on localhost it can be tried with ?donar=https://… */
export function donateUrl() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const override = local ? new URLSearchParams(location.search).get('donar') : null;
  const url = override || DONATE_URL;
  return /^https:\/\/\S+$/.test(url) ? url : '';
}

/** Should the dialog show now? */
export function shouldAskDonation() {
  if (!donateUrl()) return false;
  if (storageGet(DONATE_STORAGE) === 'never') return false;
  return DONATE_EVERY === 'always' || !askedThisSession;
}

export const isDonationOpen = () => !!useDonate.getState().request;

/**
 * Opens the dialog. The promise resolves with how it closed ('cta', 'skip',
 * 'close', 'esc' or 'backdrop') in the same user gesture that closed it.
 */
export async function askDonation(): Promise<DonateVia> {
  askedThisSession = true;
  const opener = document.activeElement;
  await DonateContent.preload();
  return new Promise((resolve) => useDonate.setState({ request: { resolve, opener } }));
}

/** Every way of closing it ends here, and the export goes on. */
export function finishDonation(via: DonateVia) {
  const request = useDonate.getState().request;
  if (!request) return;
  if ((document.getElementById('donate-never') as HTMLInputElement | null)?.checked) storageSet(DONATE_STORAGE, 'never');
  useDonate.setState({ request: null });
  request.resolve(via);
}
