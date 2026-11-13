// Diálogo «Preferencias»: unidades (mm, cm o in) y «Atajos de 1 tecla»
// (WCAG 2.1.4). Son ajustes de este navegador: se guardan en localStorage y
// no entran en el historial ni en el proyecto.

import { SINGLE_KEYS_STORAGE } from './config.ts';
import { settings, setUnit } from './store.js';
import { setupDialog } from './dialogs.js';
import { storageGet, storageSet } from './services/storage/local.ts';
import { $ } from './hooks/dom.ts';

let ui = {};
let openDialog = () => {};

/** `onSingleKeysChange()` y `onUnitChange()`: después de cambiar cada preferencia. */
export function initPrefs({ trigger, onSingleKeysChange, onUnitChange }) {
  ui = {
    dialog: $('prefs'),
    trigger,
    singleKeys: $('single-keys'),
    units: [...document.querySelectorAll('input[name="unit"]')],
  };
  settings.singleKeys = storageGet(SINGLE_KEYS_STORAGE) !== 'off';
  openDialog = setupDialog(ui.dialog, { close: [$('prefs-close')], fallback: () => ui.trigger });

  ui.singleKeys.checked = settings.singleKeys;
  ui.singleKeys.addEventListener('change', () => {
    settings.singleKeys = ui.singleKeys.checked;
    storageSet(SINGLE_KEYS_STORAGE, ui.singleKeys.checked ? 'on' : 'off');
    onSingleKeysChange();
  });

  for (const radio of ui.units) {
    radio.checked = radio.value === settings.unit;
    radio.addEventListener('change', () => {
      if (!radio.checked || radio.value === settings.unit) return;
      setUnit(radio.value);
      onUnitChange();
    });
  }

  trigger.addEventListener('click', () => openPrefs());
}

/** Abre «Preferencias». `returnTo`: a dónde vuelve el foco al cerrar. */
export function openPrefs({ returnTo } = {}) {
  for (const radio of ui.units) radio.checked = radio.value === settings.unit;
  ui.singleKeys.checked = settings.singleKeys;
  openDialog(returnTo ? { returnTo } : undefined);
}
