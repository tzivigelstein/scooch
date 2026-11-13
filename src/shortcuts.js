// Diálogo de atajos (<dialog> modal) con el interruptor «Atajos de una tecla»
// (WCAG 2.1.4), que se guarda en localStorage.

import { SINGLE_KEYS_STORAGE } from './config.js';
import { settings } from './store.js';
import { $, MOD, storageGet, storageSet } from './util.js';

// [teclas, acción, es de una tecla]
const ROWS = [
  [['Tab', 'Shift+Tab'], 'Recorrer barra, piezas y paneles (en la hoja, enfocar una pieza la selecciona)', false],
  [['←', '↑', '→', '↓'], 'Mover la pieza 1 mm (Shift: 10 mm; Alt: 0,1 mm). Si choca con otra, salta al otro lado', false],
  [['+', '−'], 'Agrandar o achicar 1 % (Shift: 10 %)', true],
  [['R', 'Shift+R'], 'Girar 90° a la derecha / a la izquierda', true],
  [['D'], 'Duplicar', true],
  [['F'], 'Ajustar a la hoja', true],
  [['C'], 'Centrar', true],
  [[']'], 'Traer al frente', true],
  [['Enter', 'Espacio'], 'Sobre una pieza: ir a su barra de acciones', false],
  [['Supr', 'Backspace'], 'Quitar la pieza', false],
  [['M'], 'Editar las medidas de la pieza (panel Propiedades)', true],
  [['H'], 'Ir a los ajustes de la hoja', true],
  [['P'], 'Ir a la lista de piezas', true],
  [['A'], 'Acomodar todo sin superponer', true],
  [['O'], 'Agregar imágenes o PDF', true],
  [['L'], 'Cambiar la orientación de la hoja', true],
  [['G'], 'Mostrar u ocultar la grilla', true],
  [[`${MOD}+Z`], 'Deshacer', false],
  [[`${MOD}+Shift+Z`, 'Ctrl+Y'], 'Rehacer', false],
  [[`${MOD}+P`], 'Imprimir', false],
  [[`${MOD}+S`, `${MOD}+E`], 'Descargar PDF', false],
  [['Esc'], 'En un panel: volver a la pieza (o cerrar el panel superpuesto); si no, deseleccionar', false],
  [['?'], 'Mostrar estos atajos', true],
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
        if (i) keyCell.append(keys.length > 2 ? ' ' : ' o ');
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        keyCell.append(kbd);
      });
      const actionCell = document.createElement('td');
      actionCell.textContent = action;
      if (single) {
        const off = document.createElement('span');
        off.className = 'off-badge';
        off.textContent = 'Desactivado';
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
