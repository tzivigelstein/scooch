// Atajos de teclado. Los de una tecla nunca actúan mientras se escribe, dentro
// del diálogo, ni con Ctrl/Cmd/Alt de por medio, y se pueden apagar (WCAG
// 2.1.4); los de Ctrl, los de Alt+Shift (alinear y distribuir) y las
// flechas/Supr sobre una pieza siguen.

import { settings } from './store.js';
import { stepFor } from './units.js';
import { isTyping } from './util.js';

const NUDGES = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
// Alt+Shift + tecla (por posición, así funciona en cualquier distribución y en Mac).
const ALIGNS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'top', ArrowDown: 'bottom', KeyH: 'centerX', KeyV: 'centerY' };
const DISTRIBUTES = { KeyX: 'x', KeyY: 'y' };
// Teclas solas que actúan sobre la selección (ver pieceKeys).
const PIECE_KEYS = new Set(['r', 'd', 'f', 'c', ']', 'm']);
const GROWS = new Set(['+', '=', '*']);
const SHRINKS = new Set(['-', '_', '−']);

/**
 * `a`: acciones de la app. Las de pieza reciben `{focus: true}` para que el
 * foco quede en la pieza después de actuar. Sobre una pieza enfocada que no
 * está elegida, primero se elige solo esa (`adopt`): se actúa sobre lo enfocado.
 */
export function initKeyboard(a) {
  document.addEventListener('keydown', (e) => onKeyDown(e, a));
  document.addEventListener('keyup', (e) => {
    if (NUDGES[e.key] || GROWS.has(e.key) || SHRINKS.has(e.key)) a.endEdit();
  });
}

function onKeyDown(e, a) {
  if (e.defaultPrevented || e.isComposing) return;
  const t = e.target instanceof Element ? e.target : document.body;
  const key = e.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;
  const mod = e.ctrlKey || e.metaKey;
  const typing = isTyping(t);
  // Mod+O abre «Proyectos» (y nunca el diálogo de archivos del navegador).
  if (mod && !e.altKey && lower === 'o') {
    e.preventDefault();
    if (!t.closest('dialog')) a.openProjects();
    return;
  }
  if (t.closest('dialog')) return; // el <dialog> maneja Esc y Tab por su cuenta

  // Con Ctrl/Cmd: funcionan siempre (salvo deshacer mientras se escribe, que es del campo).
  if (mod && !e.altKey) {
    if (lower === 's' || lower === 'e') {
      e.preventDefault();
      a.exportPdf();
    } else if (lower === 'p') {
      e.preventDefault(); // reemplaza la impresión de la página por la del PDF a tamaño real
      a.print();
    } else if (!typing && lower === 'z') {
      e.preventDefault();
      if (e.shiftKey) a.redo();
      else a.undo();
    } else if (!typing && lower === 'y') {
      e.preventDefault();
      a.redo();
    } else if (!typing && lower === 'a' && !e.shiftKey) {
      // Todas las piezas de la hoja actual; otra vez, las de todas las hojas.
      e.preventDefault();
      a.selectAll();
    }
    return; // el resto: lo del navegador
  }

  if (key === 'Escape') {
    if (a.escape(t)) e.preventDefault();
    return;
  }
  if (typing || mod) return;

  const onPiece = t.classList.contains('piece');

  // Alinear y distribuir la selección: Alt+Shift + flechas, H, V, X o Y.
  if (e.altKey && e.shiftKey && (ALIGNS[e.code] || DISTRIBUTES[e.code])) {
    e.preventDefault();
    if (e.repeat) return;
    if (onPiece) a.adopt(t);
    if (ALIGNS[e.code]) a.align(ALIGNS[e.code]);
    else a.distribute(DISTRIBUTES[e.code]);
    return;
  }

  // En las hojas: Re Pág / Av Pág pasan el foco de hoja en hoja; con Shift,
  // la pieza enfocada se muda a la hoja anterior o siguiente.
  if ((key === 'PageDown' || key === 'PageUp') && !e.altKey && t.closest('#stage')) {
    e.preventDefault();
    const dir = key === 'PageDown' ? 1 : -1;
    if (e.shiftKey) {
      if (onPiece && !e.repeat) a.sendToSheet(dir);
    } else a.gotoSheet(dir);
    return;
  }

  // Sobre una pieza enfocada: flechas (pasos de la unidad elegida: Alt fino,
  // Shift grueso), Supr y Enter.
  if (onPiece && NUDGES[key] && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    a.adopt(t);
    const step = stepFor(settings.unit, e.altKey ? 'fine' : e.shiftKey ? 'coarse' : 'normal').mm;
    const [dx, dy] = NUDGES[key];
    a.nudge(dx * step, dy * step);
    return;
  }
  if (e.altKey) return;
  if (onPiece && (key === 'Delete' || key === 'Backspace')) {
    e.preventDefault();
    a.adopt(t);
    if (!e.repeat) a.remove();
    return;
  }
  // Shift+Espacio o Shift+Enter: agrega la pieza enfocada a la selección o la quita.
  if (onPiece && e.shiftKey && (key === 'Enter' || key === ' ')) {
    e.preventDefault();
    if (!e.repeat) a.toggleFocused(Number(t.dataset.id));
    return;
  }
  // La pieza es un botón: Enter o Espacio la "activan" (llevan a su barra).
  if (onPiece && (key === 'Enter' || key === ' ')) {
    e.preventDefault();
    a.adopt(t);
    if (!e.repeat) a.toolbar();
    return;
  }

  // De una tecla (se pueden apagar). Espacio no tiene nada global: solo lo
  // nativo del control enfocado.
  if (!settings.singleKeys) return;
  if (key === '?') {
    e.preventDefault();
    a.help();
    return;
  }
  const global = { a: a.arrange, o: a.openFiles, h: a.openSheet, l: a.toggleOrientation, g: a.toggleGrid, p: a.focusList };
  if (global[lower] && !e.repeat) {
    e.preventDefault();
    global[lower]();
    return;
  }
  const pieceKey = GROWS.has(key) || SHRINKS.has(key) || PIECE_KEYS.has(lower);
  if (onPiece && pieceKey) a.adopt(t);
  if (!a.hasSelection()) return;
  if (GROWS.has(key) || SHRINKS.has(key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    a.scaleBy(GROWS.has(key) ? step : -step);
    return;
  }
  const pieceKeys = {
    r: () => a.rotate(e.shiftKey ? -1 : 1),
    d: a.duplicate,
    f: a.fit,
    c: a.center,
    ']': a.front,
    m: a.measures,
  };
  if (pieceKeys[lower] && !e.repeat) {
    e.preventDefault();
    pieceKeys[lower]();
  }
}
