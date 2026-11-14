/** How close to an edge of the stage the pointer starts the scroll (px). */
export const EDGE_ZONE: number;
/** The fastest step, with the pointer on the edge or past it (px per frame). */
export const EDGE_SPEED: number;

/** One frame of scroll along one axis while dragging near an edge: the new scroll position, within [0, max]. */
export function edgeScroll(pointer: number, start: number, end: number, scroll: number, max: number): number;

/** How much the scrolled area must grow (px) so the new sheet's placeholder shows whole; 0 when it fits. */
export function newSheetRoom(area: { bottom: number; pad: number; height: number }): number;
