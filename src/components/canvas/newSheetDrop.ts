// The placeholders that show a drag can create a sheet: a dashed sheet after
// the last one and a bar in the gap between two sheets (or above the first).
// They are painted directly during the drag, outside the layout (nothing
// moves under the pointer), and hidden from screen readers: the result of
// the drop is announced.

import { endSheetBox, type NewSheetSpot } from './viewport.ts';

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/**
 * Shows the placeholders, with `spot` (or none, null) as the one the drop
 * would use, or hides them (`false`).
 */
export function paintNewSheetSpot(spot: NewSheetSpot | null | false) {
  const sheets = document.getElementById('sheets');
  const end = document.getElementById('new-sheet-end');
  const bar = document.getElementById('new-sheet-gap');
  if (!sheets || !end || !bar) return;
  const on = spot !== false;
  if (sheets.classList.contains('has-new-sheet') !== on) sheets.classList.toggle('has-new-sheet', on);
  end.hidden = !on;
  bar.hidden = !(spot && spot.kind === 'gap');
  if (!on) return;
  const box = endSheetBox();
  if (box) Object.assign(end.style, { left: px(box.left), top: px(box.top), width: px(box.width), height: px(box.height) });
  end.classList.toggle('is-active', !!spot && spot.kind === 'end');
  if (spot && spot.kind === 'gap') Object.assign(bar.style, { left: px(spot.box.left), top: px(spot.box.top), width: px(spot.box.width) });
}
