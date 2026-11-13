// Diálogo de atajos (<dialog> modal). El interruptor «Atajos de 1 tecla» vive
// en «Preferencias» (prefs.js); aquí se marca lo que queda desactivado y hay un
// botón para ir a cambiarlo.

import { settings } from './store.js';
import { stepTexts } from './measure.js';
import { setupDialog } from './dialogs.js';
import { $ } from './util.js';
import { t, keyLabel } from './copy/index.js';

// [teclas (nombres de keyLabel), acción (clave en shortcuts.rows), es de una tecla]
const ROWS = [
  [['Tab', 'Shift+Tab'], 'tab', false],
  [['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'], 'move', false],
  [['Plus', 'Minus'], 'scale', true],
  [['R', 'Shift+R'], 'rotate', true],
  [['D'], 'duplicate', true],
  [['I'], 'selectSame', true],
  [['F'], 'fit', true],
  [['C'], 'center', true],
  [[']'], 'front', true],
  [['Enter', 'Space'], 'toolbar', false],
  [['Shift+Space', 'Shift+Enter'], 'toggleSelect', false],
  [['Shift+Click', 'Mod+Click'], 'clickSelect', false],
  [['Mod+A'], 'selectAll', false],
  [['Alt+Shift+ArrowLeft', 'Alt+Shift+ArrowRight'], 'alignSides', false],
  [['Alt+Shift+ArrowUp', 'Alt+Shift+ArrowDown'], 'alignEnds', false],
  [['Alt+Shift+H', 'Alt+Shift+V'], 'alignCenter', false],
  [['Alt+Shift+X', 'Alt+Shift+Y'], 'distribute', false],
  [['PageUp', 'PageDown'], 'pages', false],
  [['Shift+PageUp', 'Shift+PageDown'], 'sendPage', false],
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
  [['Mod+O'], 'projects', false],
  [['Escape'], 'escape', false],
  [['?'], 'help', true],
];

let dialog;
let trigger;
let openDialog = () => {};
let shownUnit = null;
let opener = null; // quién abrió el diálogo (a donde vuelve el foco, también desde «Preferencias»)

/** `openPrefs({returnTo})`: abre «Preferencias» (desde el botón del diálogo). */
export function initShortcuts({ trigger: button, openPrefs }) {
  trigger = button;
  dialog = $('shortcuts');
  openDialog = setupDialog(dialog, { close: [$('shortcuts-close')], fallback: () => trigger });
  renderRows();
  syncShortcuts();
  trigger.addEventListener('click', () => openShortcuts());
  $('shortcuts-prefs').addEventListener('click', () => {
    const back = opener?.isConnected && opener !== document.body ? opener : trigger;
    dialog.close();
    openPrefs({ returnTo: back });
  });
}

function renderRows() {
  shownUnit = settings.unit;
  const steps = stepTexts();
  $('shortcuts-rows').replaceChildren(
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
      actionCell.textContent = t(`shortcuts.rows.${action}`, steps);
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
}

/** Marca los atajos de 1 tecla si están desactivados y pone los pasos en la unidad elegida. */
export function syncShortcuts() {
  dialog.classList.toggle('single-off', !settings.singleKeys);
  if (shownUnit !== settings.unit) renderRows();
}

export function openShortcuts() {
  if (dialog.open) return;
  opener = document.activeElement;
  syncShortcuts();
  openDialog({ returnTo: opener });
}
