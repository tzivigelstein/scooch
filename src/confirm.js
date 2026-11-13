// Confirmación breve (<dialog> modal) para acciones que borran algo: quitar
// una hoja con piezas (se puede deshacer) o eliminar un proyecto (no).

import { setupDialog } from './dialogs.js';
import { $ } from './util.js';

let ui = {};
let openDialog = () => {};
let pending = null;

export function initConfirm() {
  ui = { dialog: $('confirm'), title: $('confirm-title'), body: $('confirm-body'), ok: $('confirm-ok'), cancel: $('confirm-cancel') };
  openDialog = setupDialog(ui.dialog, { close: [ui.cancel] });
  ui.ok.addEventListener('click', () => {
    if (pending) pending.result = true;
    ui.dialog.close();
  });
  ui.dialog.addEventListener('close', () => {
    const done = pending;
    pending = null;
    done?.resolve(done.result);
  });
}

/**
 * Pide confirmación. `title`, `body` y `confirm` (texto del botón) ya vienen
 * escritos; `focus`: 'confirm' o 'cancel' (lo irreversible empieza en
 * «Cancelar»). `returnTo`: a dónde vuelve el foco. Resuelve true o false.
 */
export function confirmAction({ title, body, confirm, focus = 'confirm', returnTo = document.activeElement }) {
  if (pending) return Promise.resolve(false);
  ui.title.textContent = title;
  ui.body.textContent = body;
  ui.ok.textContent = confirm;
  return new Promise((resolve) => {
    pending = { resolve, result: false };
    openDialog({ returnTo, focus: focus === 'cancel' ? ui.cancel : ui.ok });
  });
}

export const isConfirmOpen = () => !!pending;
