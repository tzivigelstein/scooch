// The request for a donation: a panel in the summary after printing or
// downloading (never a dialog of its own, never before the printer).
// Only with a valid https Patreon URL, once per page load (DONATE_EVERY), and
// never again on this device after «No volver a mostrar».

import { DONATE_EVERY, DONATE_STORAGE, DONATE_URL } from '../../config.ts';
import { storageGet, storageSet } from '../../services/storage/local.ts';

let askedThisSession = false;

/** The Patreon URL; on localhost it can be tried with ?donar=https://… */
export function donateUrl() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const override = local ? new URLSearchParams(location.search).get('donar') : null;
  const url = override || DONATE_URL;
  return /^https:\/\/\S+$/.test(url) ? url : '';
}

/** Should this summary ask? (Asking counts: the next one, in this page load, won't.) */
export function takeDonationAsk() {
  if (!donateUrl() || storageGet(DONATE_STORAGE) === 'never') return false;
  if (DONATE_EVERY === 'session' && askedThisSession) return false;
  askedThisSession = true;
  return true;
}

/** «No volver a mostrar»: never asks again on this device. */
export const neverAskDonation = () => storageSet(DONATE_STORAGE, 'never');
