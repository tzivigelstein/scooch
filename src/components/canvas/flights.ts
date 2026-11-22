// Pieces that change sheet while positions animate (Arrange, Undo…). React
// draws such a piece anew on the other sheet, where no transition can start
// from where it was, and each sheet clips what crosses its edge: it would show
// up there at once while its selection frame, which is drawn over the sheets,
// travelled on its own. Instead, the piece as it was drawn flies over above
// the sheets (in the drag layer, which doesn't clip), from where it showed to
// where the other sheet draws it, with the transitions of the pieces that
// stay on their sheet (resized and turned as they are); the new piece is
// transparent until it lands. The frame, in the same coordinates and with
// the same timing, goes along with it.
//
// The flying copy is a node React has let go of: no one else touches it, it
// doesn't take the pointer or the focus, and screen readers don't see it. It
// lands when its transitions end, and at once when the animation ends early
// (a gesture starts), the zoom or the layout change, or the document changes
// again.

import type { Piece } from '../../state/document.ts';
import { pieceNode } from '../../state/actions/focus.ts';

interface Departure {
  node: HTMLElement;
  /** Where it showed, in the drag layer's coordinates (px). */
  left: number;
  top: number;
}

/** The pieces the change being rendered takes to another sheet, by id. */
let departures = new Map<number, Departure>();
/** The copies in flight and the pieces they land on, by id. */
const flights = new Map<number, { copy: HTMLElement; piece: HTMLElement }>();

const layer = () => document.getElementById('drag-layer');
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Before a change of the document is rendered (`before` → `after`): notes
 * the pieces it takes to another sheet, as they show now.
 */
export function noteDepartures(before: readonly Piece[], after: readonly Piece[]) {
  landAll();
  if (reducedMotion()) return;
  const sheetOf = new Map(before.map((item) => [item.id, item.sheet]));
  let origin: DOMRect | null = null;
  for (const item of after) {
    const sheet = sheetOf.get(item.id);
    if (sheet === undefined || sheet === item.sheet || departures.has(item.id)) continue;
    const node = pieceNode(item.id);
    origin ??= layer()?.getBoundingClientRect() ?? null;
    if (!node || !origin) continue;
    const r = node.getBoundingClientRect();
    departures.set(item.id, { node, left: r.left - origin.left, top: r.top - origin.top });
  }
}

/**
 * Once the change is rendered: when positions animate (`animate`), each piece
 * another sheet drew anew flies over from where it showed. Otherwise the
 * departures are forgotten.
 */
export function flyDepartures(animate: boolean) {
  const list = departures;
  departures = new Map();
  const into = layer();
  if (!animate || !list.size || !into || reducedMotion()) return;
  // Drawn anew: the node React rendered before is gone, and another one stands for the piece.
  const going = [...list].flatMap(([id, departure]) => {
    const piece = pieceNode(id);
    return piece && piece !== departure.node && !departure.node.isConnected ? [{ id, ...departure, piece }] : [];
  });
  if (!going.length) return;
  const origin = into.getBoundingClientRect();
  const ends = going.map(({ piece }) => piece.getBoundingClientRect());
  for (const { id, node, left, top } of going) {
    const grouped = node.classList.contains('is-grouped');
    for (const name of node.getAttributeNames()) if (name !== 'style') node.removeAttribute(name);
    node.className = grouped ? 'piece-flight is-grouped' : 'piece-flight';
    node.dataset.flight = String(id);
    node.setAttribute('aria-hidden', 'true');
    node.inert = true;
    Object.assign(node.style, { left: `${left}px`, top: `${top}px` });
    into.append(node);
  }
  // Styled where they showed, so that they transition from there.
  going[0].node.getBoundingClientRect();
  going.forEach(({ id, node, piece }, i) => {
    const before = node.style.cssText + (node.firstElementChild as HTMLElement | null)?.style.cssText;
    Object.assign(node.style, { left: `${ends[i].left - origin.left}px`, top: `${ends[i].top - origin.top}px`, width: piece.style.width, height: piece.style.height });
    const from = node.firstElementChild as HTMLElement | null;
    const to = piece.firstElementChild as HTMLElement | null;
    if (from && to) Object.assign(from.style, { width: to.style.width, height: to.style.height, transform: to.style.transform });
    flights.set(id, { copy: node, piece });
    // Nothing to transition: it shows where it lands already.
    if (node.style.cssText + from?.style.cssText === before) return land(id);
    piece.style.opacity = '0';
    // Its transitions (the box's and the image's) share their timing: when the
    // first ends, all have. If none ends, it lands with the animation's end.
    node.addEventListener('transitionend', () => land(id), { once: true });
    node.addEventListener('transitioncancel', () => land(id), { once: true });
  });
}

/** The copy of piece `id` lands: it goes, and the piece shows. */
function land(id: number) {
  const flight = flights.get(id);
  if (!flight) return;
  flights.delete(id);
  flight.copy.remove();
  flight.piece.style.opacity = '';
}

/** Every copy in flight lands at once. */
export function landAll() {
  for (const id of [...flights.keys()]) land(id);
}
