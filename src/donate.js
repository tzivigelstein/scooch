// Modal de donación al imprimir o descargar. Honesto: se puede seguir sin
// donar con la misma facilidad, no hay cuentas regresivas ni culpa, y la
// exportación pedida sigue siempre, se cierre como se cierre.

import { DONATE_URL, DONATE_EVERY, DONATE_STORAGE } from './config.ts';
import { storageGet, storageSet } from './services/storage/local.ts';
import { $ } from './hooks/dom.ts';

let ui = {};
let askedThisSession = false;
let pending = null; // {resolve, opener}

/** URL de Patreon; en localhost se puede probar con ?donar=https://… */
function donateUrl() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const override = local ? new URLSearchParams(location.search).get('donar') : null;
  const url = override || DONATE_URL;
  return /^https:\/\/\S+$/.test(url) ? url : '';
}

export function initDonate() {
  ui = {
    dialog: $('donate'),
    title: $('donate-title'),
    cta: $('donate-cta'),
    skip: $('donate-skip'),
    never: $('donate-never'),
    close: $('donate-close'),
  };
  // Los textos ya vienen en el HTML (data-i18n, desde src/copy).
  ui.cta.href = donateUrl() || '#';

  // Cada vía de cierre continúa con la exportación, dentro del mismo gesto.
  ui.cta.addEventListener('click', () => finish('cta')); // el enlace se abre solo (target=_blank)
  ui.skip.addEventListener('click', () => finish('skip'));
  ui.close.addEventListener('click', () => finish('close'));
  ui.dialog.addEventListener('cancel', () => finish('esc'));
  ui.dialog.addEventListener('click', (e) => {
    if (e.target !== ui.dialog) return;
    const r = ui.dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) finish('backdrop');
  });
  ui.dialog.addEventListener('close', () => finish('close'));
}

/** ¿Hay que mostrar el modal ahora? */
export function shouldAskDonation() {
  if (!donateUrl()) return false;
  if (storageGet(DONATE_STORAGE) === 'never') return false;
  return DONATE_EVERY === 'always' || !askedThisSession;
}

export const isDonationOpen = () => !!pending;

/**
 * Abre el modal. La promesa se resuelve con la vía de cierre ('cta', 'skip',
 * 'close', 'esc' o 'backdrop') en el mismo gesto del usuario que lo cerró.
 */
export function askDonation() {
  askedThisSession = true;
  const opener = document.activeElement;
  ui.never.checked = false;
  ui.dialog.showModal();
  // Foco en el título: un Enter apurado no abre Patreon sin querer.
  ui.title.focus();
  return new Promise((resolve) => {
    pending = { resolve, opener };
  });
}

function finish(via) {
  if (!pending) return;
  const { resolve, opener } = pending;
  pending = null;
  if (ui.never.checked) storageSet(DONATE_STORAGE, 'never');
  if (ui.dialog.open) ui.dialog.close();
  if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
  resolve(via);
}
