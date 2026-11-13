// Panels that collapse with the width: the pieces panel becomes an overlay
// (< 1100 px) and the properties panel a bottom sheet (< 800 px). They open
// with their button and close with Esc, their close button, a click outside or
// when the focus leaves; on closing, the focus returns to whoever opened them.

import { LEFT_DRAWER_QUERY, NARROW_QUERY } from '../../config.ts';
import { matches } from '../../hooks/useMediaQuery.ts';
import { flushUi } from '../flush.ts';
import { getView, setView, type DrawerName } from '../view.ts';
import { listFocusTarget } from './focus.ts';

export const DRAWER_QUERIES: Record<DrawerName, string> = { pieces: LEFT_DRAWER_QUERY, props: NARROW_QUERY };
export const DRAWER_PANELS: Record<DrawerName, string> = { pieces: 'pieces-panel', props: 'props-panel' };
export const DRAWER_TRIGGERS: Record<DrawerName, string[]> = { pieces: ['pieces-toggle', 'pieces-dock'], props: ['props-toggle'] };

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex="0"], summary';

const returnTargets: Partial<Record<DrawerName, Element | null>> = {};

/** Is the panel collapsed (overlay or bottom sheet) at this width? */
export const isCollapsible = (name: DrawerName) => matches(DRAWER_QUERIES[name]);
export const isDrawerOpen = (name: DrawerName) => getView().drawer === name;
/** The panel an element is in, or null. */
export const drawerOf = (el: Element | null): DrawerName | null =>
  (Object.keys(DRAWER_PANELS) as DrawerName[]).find((name) => document.getElementById(DRAWER_PANELS[name])?.contains(el)) ?? null;
const triggers = (name: DrawerName) => DRAWER_TRIGGERS[name].map((id) => document.getElementById(id)).filter((el) => !!el);

// What gets the focus when a panel opens: the list (or the add zone), or the first field.
function initialFocus(name: DrawerName): HTMLElement | null {
  if (name === 'pieces') return listFocusTarget() ?? document.getElementById('addzone');
  const x = document.getElementById('pos-x');
  return x && !x.closest('[hidden]') ? x : document.getElementById('paper');
}

export function openDrawer(name: DrawerName, { returnTo = document.activeElement as Element | null, focus = true } = {}) {
  if (!isCollapsible(name)) return;
  returnTargets[name] = returnTo && returnTo !== document.body ? returnTo : (triggers(name).find((el) => el.offsetParent) ?? null);
  setView({ drawer: name });
  if (!focus) return;
  flushUi();
  const panel = document.getElementById(DRAWER_PANELS[name])!;
  (initialFocus(name) ?? panel.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
}

/** `focus`: 'return' (to whoever opened it), 'auto' (only if the focus was inside) or 'none'. */
export function closeDrawer(name: DrawerName, { focus = 'return' as 'return' | 'auto' | 'none' } = {}) {
  if (!isDrawerOpen(name)) return;
  const panel = document.getElementById(DRAWER_PANELS[name]);
  const active = document.activeElement;
  const inside = !!panel?.contains(active) || active === document.body;
  if (focus === 'return' || (focus === 'auto' && inside)) {
    const target = [returnTargets[name], ...triggers(name)].find(
      (el): el is HTMLElement => !!el && el.isConnected && (el as HTMLElement).offsetParent !== null && !(el as HTMLButtonElement).disabled
    );
    target?.focus({ preventScroll: true });
  }
  setView({ drawer: null });
}

export const toggleDrawer = (name: DrawerName, trigger: Element) =>
  isDrawerOpen(name) ? closeDrawer(name) : openDrawer(name, { returnTo: trigger });

/** Shows the panel if it is collapsed (without moving the focus). */
export function revealPanel(name: DrawerName, returnTo: Element | null = document.activeElement) {
  if (isCollapsible(name) && !isDrawerOpen(name)) openDrawer(name, { returnTo, focus: false });
}
