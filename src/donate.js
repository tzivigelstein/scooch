// Modal de donación al imprimir o descargar. Honesto: se puede seguir sin
// donar con la misma facilidad, no hay cuentas regresivas ni culpa, y la
// exportación pedida sigue siempre, se cierre como se cierre.

import { APP_NAME, DONATE_URL, DONATE_EVERY, DONATE_STORAGE, DONATE_COPY } from './config.js';
import { icon } from './icons.js';
import { $, storageGet, storageSet } from './util.js';

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

const fill = (text) => text.replaceAll('{app}', APP_NAME);

export function initDonate() {
  ui = {
    dialog: $('donate'),
    title: $('donate-title'),
    body: $('donate-body'),
    benefits: $('donate-benefits'),
    cta: $('donate-cta'),
    ctaText: $('donate-cta-text'),
    ctaNote: $('donate-note'),
    skip: $('donate-skip'),
    never: $('donate-never'),
    neverText: $('donate-never-text'),
    thanks: $('donate-thanks'),
    close: $('donate-close'),
  };
  ui.title.textContent = DONATE_COPY.title;
  ui.body.replaceChildren(
    ...DONATE_COPY.body.map((line) => {
      const p = document.createElement('p');
      p.textContent = fill(line);
      return p;
    })
  );
  ui.benefits.innerHTML = DONATE_COPY.benefits
    .map((b) => `<li>${icon(b.icon)}<span>${b.text}</span></li>`)
    .join('');
  ui.ctaText.textContent = DONATE_COPY.cta;
  ui.ctaNote.textContent = DONATE_COPY.ctaNote;
  ui.skip.textContent = DONATE_COPY.skip;
  ui.neverText.textContent = DONATE_COPY.never;
  ui.thanks.textContent = fill(DONATE_COPY.thanks);
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
