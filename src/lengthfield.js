// Campos de longitud (X, Y, ancho, alto, margen, separación, grilla, papel):
// <input type="text" inputmode="decimal"> que muestran y aceptan la unidad
// elegida. Aceptan «2,5», «2.5 cm», «1/2 in»… (units.js), suben y bajan con
// las flechas (Shift: paso grueso; Alt: fino) y, si al confirmar lo escrito no
// se entiende, vuelven al valor anterior y lo anuncian.

import { parseLength, isPartialLength, stepFor } from './core/units.js';
import { settings } from './store.js';
import { lengthValue, lengthText } from './measure.js';
import { announce } from './live.js';
import { t, asSentence } from './copy/index.ts';

/**
 * `value()`: el valor actual en mm (el del documento o la preferencia).
 * `apply(mm, {final})`: aplica un valor que vale (`final`: se confirmó).
 * `check(mm)`: texto del problema si no vale (p. ej. fuera de rango), o null.
 * `limit(mm)`: lleva un valor al rango permitido (para las flechas).
 * `problem(texto | null)`: para mostrar el problema mientras se escribe (lo
 *   que no puede llegar a ser una medida se explica con `unreadable`; lo que
 *   está a medio escribir, como «1/» o «2,», todavía no).
 * `busy()`: true si por ahora no se puede editar.
 */
export function bindLength(
  input,
  { value, apply, check = () => null, limit = (mm) => mm, problem = () => {}, unreadable = null, busy = () => false }
) {
  const read = () => parseLength(input.value, settings.unit);

  input.addEventListener('input', () => {
    if (busy()) return;
    const mm = read();
    if (mm === null) return problem(isPartialLength(input.value, settings.unit) ? null : (unreadable ?? t('units.unreadable')));
    const issue = check(mm);
    problem(issue);
    if (!issue) apply(mm, { final: false });
  });

  const confirm = () => {
    if (busy()) return;
    const mm = read();
    const issue = mm === null ? null : check(mm);
    if (mm === null || issue) {
      const typed = input.value.trim();
      const current = value();
      input.value = current === null ? '' : lengthValue(current);
      problem(null);
      if (!typed || current === null) return; // vacío: vuelve al valor anterior sin más
      const shown = lengthText(current);
      const text = issue ? t('units.invalidValue', { text: asSentence(issue), value: shown }) : t('units.invalid', { text: typed, value: shown });
      announce(text, { assertive: true });
      return;
    }
    problem(null);
    apply(mm, { final: true });
    const current = value();
    if (current !== null) input.value = lengthValue(current);
  };

  input.addEventListener('change', confirm);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      // Confirma sin salir del campo (el «change» de Enter no llega en todos los navegadores).
      confirm();
      return;
    }
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.ctrlKey || e.metaKey || busy()) return;
    e.preventDefault();
    const size = e.altKey ? 'fine' : e.shiftKey ? 'coarse' : 'normal';
    const step = stepFor(settings.unit, size).mm;
    // Si el campo muestra el valor actual (redondeado), se parte del valor exacto.
    const current = value();
    const base = current !== null && input.value === lengthValue(current) ? current : (read() ?? current ?? 0);
    const next = limit(base + (e.key === 'ArrowUp' ? step : -step));
    if (check(next)) return;
    problem(null);
    apply(next, { final: false });
    input.value = lengthValue(next);
  });
}

/** Muestra un valor en el campo, salvo que se esté escribiendo en él. */
export function showLength(input, mm) {
  if (document.activeElement === input) return;
  input.value = Number.isFinite(mm) ? lengthValue(mm) : '';
}
