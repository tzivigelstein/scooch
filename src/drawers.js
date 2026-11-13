// Paneles que se pliegan según el ancho: el de piezas se vuelve un panel
// superpuesto (< 1100 px) y el de propiedades una hoja inferior (< 800 px).
// Se abren con su botón, cierran con Esc, con su botón de cerrar, al hacer
// click afuera o cuando el foco se va; al cerrar, el foco vuelve a quien los abrió.

import { NARROW_QUERY, LEFT_DRAWER_QUERY } from './config.ts';
import { $ } from './util.js';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex="0"], summary';

const drawers = {};
let onChange = () => {};

/**
 * `initialFocus(name)` devuelve el elemento a enfocar al abrir (si no, el primero enfocable).
 * `changed()` se llama cuando un panel aparece o desaparece (para redibujar la hoja).
 */
export function initDrawers({ initialFocus, changed }) {
  onChange = changed;
  drawers.pieces = {
    panel: $('pieces-panel'),
    triggers: [$('pieces-toggle'), $('pieces-dock')],
    query: window.matchMedia(LEFT_DRAWER_QUERY),
  };
  drawers.props = {
    panel: $('props-panel'),
    triggers: [$('props-toggle')],
    query: window.matchMedia(NARROW_QUERY),
  };
  for (const [name, d] of Object.entries(drawers)) {
    d.name = name;
    d.open = false;
    d.returnTo = null;
    d.initialFocus = () => initialFocus(name);
    for (const t of d.triggers) {
      t.addEventListener('click', () => (d.open ? closeDrawer(name) : openDrawer(name, { returnTo: t })));
    }
    for (const b of d.panel.querySelectorAll('[data-close-panel]')) b.addEventListener('click', () => closeDrawer(name));
    d.query.addEventListener('change', () => {
      d.open = false;
      sync(d);
      onChange();
    });
    // Si el foco se va a otro lado (Tab hacia afuera), se cierra sin robarlo.
    d.panel.addEventListener('focusout', (e) => {
      const to = e.relatedTarget;
      if (!d.open || !to || d.panel.contains(to) || d.triggers.includes(to)) return;
      closeDrawer(name, { focus: 'none' });
    });
    sync(d);
  }
  // Click afuera: cierra.
  document.addEventListener(
    'pointerdown',
    (e) => {
      for (const [name, d] of Object.entries(drawers)) {
        if (!d.open || d.panel.contains(e.target) || d.triggers.some((t) => t.contains(e.target))) continue;
        closeDrawer(name, { focus: 'auto' });
      }
    },
    true
  );
}

function sync(d) {
  const collapsible = d.query.matches;
  if (!collapsible) d.open = false;
  d.panel.classList.toggle('is-drawer', collapsible);
  d.panel.classList.toggle('is-open', collapsible && d.open);
  d.panel.hidden = collapsible && !d.open;
  for (const t of d.triggers) {
    t.setAttribute('aria-expanded', String(collapsible && d.open));
    t.classList.toggle('is-open', collapsible && d.open);
  }
}

/** ¿El panel está plegado (en modo superpuesto/hoja inferior)? */
export const isCollapsible = (name) => drawers[name].query.matches;
export const isDrawerOpen = (name) => drawers[name].open;
export const drawerOf = (el) => Object.values(drawers).find((d) => d.panel.contains(el))?.name ?? null;

export function openDrawer(name, { returnTo = document.activeElement, focus = true } = {}) {
  const d = drawers[name];
  if (!d.query.matches) return;
  for (const other of Object.values(drawers)) if (other !== d && other.open) closeDrawer(other.name, { focus: 'none' });
  d.open = true;
  d.returnTo = returnTo && returnTo !== document.body ? returnTo : d.triggers.find((t) => t.offsetParent) ?? null;
  sync(d);
  onChange();
  if (focus) (d.initialFocus() ?? d.panel.querySelector(FOCUSABLE))?.focus({ preventScroll: true });
}

/** `focus`: 'return' (a quien lo abrió), 'auto' (solo si el foco estaba adentro) o 'none'. */
export function closeDrawer(name, { focus = 'return' } = {}) {
  const d = drawers[name];
  if (!d.open) return;
  const active = document.activeElement;
  const inside = d.panel.contains(active) || active === document.body;
  d.open = false;
  if (focus === 'return' || (focus === 'auto' && inside)) {
    const target = [d.returnTo, ...d.triggers].find((el) => el?.isConnected && el.offsetParent !== null && !el.disabled);
    target?.focus({ preventScroll: true });
  }
  sync(d);
  onChange();
}

/** Muestra el panel si está plegado (sin mover el foco). */
export function revealPanel(name, returnTo = document.activeElement) {
  const d = drawers[name];
  if (d.query.matches && !d.open) openDrawer(name, { returnTo, focus: false });
}
