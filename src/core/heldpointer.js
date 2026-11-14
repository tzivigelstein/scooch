// A pointer held down for a gesture, and the signs that it was let go where
// the page couldn't hear it (the button released over another window, a
// screenshot tool or the system taking the pointer): a gesture must never
// outlive its button. Pure module: it reads the fields of pointer events.

// PointerEvent.button → its bit in PointerEvent.buttons: the main button (a
// finger's or a pen tip's contact too), the middle one, the secondary one…
const BUTTON_BITS = [1, 4, 2, 8, 16, 32];

/** What a gesture keeps of the press that started it: the pointer and the bit of its button. */
export function heldPointer({ pointerId, pointerType, button }) {
  return { pointerId, pointerType, bit: BUTTON_BITS[button] ?? 1 };
}

/**
 * Does `e` show that `held` is no longer down? A move of that pointer without
 * its button pressed, or a new press of it (or a new first finger, or pen, of
 * its kind: the old one is gone). Other events say nothing: the browser sends
 * the boundary ones (over, enter…) when a capture changes, with the buttons of
 * whatever event made it change, the release that ends a click included.
 */
export function letGo(held, e) {
  if (e.type === 'pointerdown') return e.pointerId === held.pointerId || (e.isPrimary && e.pointerType === held.pointerType);
  return e.type === 'pointermove' && e.pointerId === held.pointerId && (e.buttons & held.bit) === 0;
}
