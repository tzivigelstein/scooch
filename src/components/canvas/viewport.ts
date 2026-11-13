// Where the sheets are on screen: the measured position of each sheet's box
// inside #sheets (for the selection frames and drags) and scrolling so a piece
// or a sheet is visible.

import { getDocument } from '../../state/document.ts';
import { dims, findItem, sheetSize } from '../../state/selectors.ts';
import { getView } from '../../state/view.ts';

export interface BoxOffset {
  left: number;
  top: number;
}

let boxes = new Map<number, BoxOffset>();

const stage = () => document.getElementById('stage');
const sheetsEl = () => document.getElementById('sheets');
export const pageNode = (id: number) => document.querySelector<HTMLElement>(`#sheets .page[data-sheet="${id}"]`);

/** Measures where each sheet's box is inside #sheets. */
export function measureBoxes() {
  const next = new Map<number, BoxOffset>();
  for (const sheet of getDocument().sheets) {
    const box = pageNode(sheet.id)?.querySelector<HTMLElement>('.sheet-box');
    if (box) next.set(sheet.id, { left: box.offsetLeft, top: box.offsetTop });
  }
  boxes = next;
  return boxes;
}

/** The last measured positions (measureBoxes). */
export const sheetBoxes = () => boxes;

/** The sheet that shows the most right now (id), or null. */
export function visibleSheet(): number | null {
  const stageEl = stage();
  const sheets = sheetsEl();
  if (!stageEl || !sheets) return null;
  const [, H] = sheetSize();
  const zoom = getView().zoom;
  const top = stageEl.scrollTop - sheets.offsetTop;
  const bottom = top + stageEl.clientHeight;
  let best: number | null = null;
  let most = -Infinity;
  for (const sheet of getDocument().sheets) {
    const box = boxes.get(sheet.id);
    if (!box) continue;
    const seen = Math.min(bottom, box.top + H * zoom) - Math.max(top, box.top);
    if (seen > most + 0.5) {
      best = sheet.id;
      most = seen;
    }
  }
  return best;
}

// Scrolls so the range [top, bottom] (in #sheets coordinates) is visible.
function scrollToRange(top: number, bottom: number) {
  const stageEl = stage();
  const sheets = sheetsEl();
  if (!stageEl || !sheets) return;
  const margin = 16;
  const offset = sheets.offsetTop;
  const viewTop = stageEl.scrollTop;
  const viewBottom = viewTop + stageEl.clientHeight;
  const a = offset + top - margin;
  const b = offset + bottom + margin;
  if (a < viewTop) stageEl.scrollTop = a;
  else if (b > viewBottom) stageEl.scrollTop = Math.min(a, b - stageEl.clientHeight);
}

/** Shows the piece if it is out of view (keyboard, adding, moving it to another sheet…). */
export function revealPiece(id: number) {
  const item = findItem(id);
  const box = item && measureBoxes().get(item.sheet);
  if (!item || !box) return;
  const [, h] = dims(item);
  const zoom = getView().zoom;
  scrollToRange(box.top + item.y * zoom, box.top + (item.y + h) * zoom);
}

/** Shows the sheet (with its heading). */
export function revealSheet(id: number) {
  const page = pageNode(id);
  const box = measureBoxes().get(id);
  if (!page || !box) return;
  const [, H] = sheetSize();
  const head = page.firstElementChild as HTMLElement;
  scrollToRange(box.top - head.offsetHeight, box.top + H * getView().zoom);
}
