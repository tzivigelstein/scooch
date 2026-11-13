// Diálogo de atajos (<dialog> modal) con el interruptor «Atajos de una tecla»
// (WCAG 2.1.4), que se guarda en localStorage.

import { SINGLE_KEYS_STORAGE } from './config.js';
import { settings } from './store.js';
import { stepTexts } from './measure.js';
import { $, storageGet, storageSet } from './util.js';
import { t, keyLabel } from './copy/index.js';

// [teclas (nombres de keyLabel), acción (clave en shortcuts.rows), es de una tecla]
const ROWS = [
  [['Tab', 'Shift+Tab'], 'tab', false],
  [['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'], 'move', false],
  [['Plus', 'Minus'], 'scale', true],
  [['R', 'Shift+R'], 'rotate', true],
  [['D'], 'duplicate', true],
  [['F'], 'fit', true],
  [['C'], 'center', true],
  [[']'], 'front', true],
  [['Enter', 'Space'], 'toolbar', false],
  [['Delete', 'Backspace'], 'remove', false],
  [['M'], 'measures', true],
  [['H'], 'sheet', true],
  [['P'], 'list', true],
  [['A'], 'arrange', true],
  [['O'], 'add', true],
  [['L'], 'orientation', true],
  [['G'], 'grid', true],
  [['Mod+Z'], 'undo', false],
  [['Mod+Shift+Z', 'Control+Y'], 'redo', false],
  [['Mod+P'], 'print', false],
  [['Mod+S', 'Mod+E'], 'download', false],
  [['Escape'], 'escape', false],
  [['?'], 'help', true],
];

let dialog;
let toggle;
let trigger;
let session = 0;
let onChange = () => {};

export function initShortcuts({ trigger: button, onSingleKeysChange }) {
  trigger = button;
  dialog = $('shortcuts');
  toggle = $('single-keys');
  onChange = onSingleKeysChange;
  settings.singleKeys = storageGet(SINGLE_KEYS_STORAGE) !== 'off';

  const body = $('shortcuts-rows');
  body.replaceChildren(
    ...ROWS.map(([keys, action, single]) => {
      const row = document.createElement('tr');
      if (single) row.dataset.single = '';
      const keyCell = document.createElement('td');
      keys.forEach((key, i) => {
        if (i) keyCell.append(keys.length > 2 ? ' ' : t('shortcuts.or'));
        const kbd = document.createElement('kbd');
        kbd.textContent = keyLabel(key);
        keyCell.append(kbd);
      });
      const actionCell = document.createElement('td');
      actionCell.textContent = t(`shortcuts.rows.${action}`, stepTexts());
      if (single) {
        const off = document.createElement('span');
        off.className = 'off-badge';
        off.textContent = t('shortcuts.off');
        actionCell.append(' ', off);
      }
      row.append(keyCell, actionCell);
      return row;
    })
  );

  toggle.checked = settings.singleKeys;
  toggle.addEventListener('change', () => {
    settings.singleKeys = toggle.checked;
    storageSet(SINGLE_KEYS_STORAGE, toggle.checked ? 'on' : 'off');
    syncState();
    onChange();
  });
  syncState();

  trigger.addEventListener('click', () => openShortcuts());
  $('shortcuts-close').addEventListener('click', () => dialog.close());
  // Click en el fondo (fuera de la caja) cierra.
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });
}

function syncState() {
  dialog.classList.toggle('single-off', !settings.singleKeys);
}

export function openShortcuts() {
  if (dialog.open) return;
  // Quién lo abrió, por apertura: «close» llega de forma asíncrona y uno
  // atrasado de una apertura anterior no tiene que pisar a este.
  const opener = document.activeElement;
  const id = ++session;
  dialog.addEventListener('close', function onClose() {
    if (dialog.open) return; // atrasado: sigue esperando su propio cierre
    dialog.removeEventListener('close', onClose);
    if (id !== session) return;
    const target = opener?.isConnected && opener !== document.body && !opener.closest('[hidden]') ? opener : trigger;
    target.focus({ preventScroll: true });
  });
  dialog.showModal();
}
