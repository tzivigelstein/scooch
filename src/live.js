// Anuncios para lectores de pantalla en dos regiones vivas que existen desde
// el inicio en el DOM (#live-polite y #live-assertive).

import { $ } from './util.js';
import { asSentence } from './copy/index.js';

const regions = { polite: null, assertive: null };
const pending = { polite: [], assertive: [] };
const keyed = new Map(); // clave → timer de los anuncios con demora (se pisan entre sí)
let flushTimer = 0;
let toggle = false;

export function initLive() {
  regions.polite = $('live-polite');
  regions.assertive = $('live-assertive');
}

/**
 * Anuncia `text`. Con `key` + `delay`, solo sale el último de una ráfaga
 * (p. ej. la posición final después de varias flechas).
 */
export function announce(text, { assertive = false, key = null, delay = 0 } = {}) {
  if (!text) return;
  const channel = assertive ? 'assertive' : 'polite';
  if (key) {
    clearTimeout(keyed.get(key));
    keyed.delete(key);
    if (delay > 0) {
      keyed.set(
        key,
        setTimeout(() => {
          keyed.delete(key);
          queue(channel, text);
        }, delay)
      );
      return;
    }
  }
  queue(channel, text);
}

/** Descarta un anuncio con demora que todavía no salió (p. ej. un problema que ya se resolvió). */
export function cancelAnnounce(key) {
  clearTimeout(keyed.get(key));
  keyed.delete(key);
}

function queue(channel, text) {
  if (!pending[channel].includes(text)) pending[channel].push(text);
  clearTimeout(flushTimer);
  // Junta lo que se anuncia en el mismo momento en un solo mensaje.
  flushTimer = setTimeout(flush, 60);
}

function flush() {
  for (const channel of ['assertive', 'polite']) {
    const region = regions[channel];
    if (!region || !pending[channel].length) continue;
    // Un espacio duro alternado fuerza el cambio aunque el texto se repita.
    toggle = !toggle;
    // Los mensajes van sin punto final (docs/copy.md): se agrega al unirlos.
    region.textContent = pending[channel].map(asSentence).join(' ') + (toggle ? ' ' : '');
    pending[channel] = [];
  }
}
