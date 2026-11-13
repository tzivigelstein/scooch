// What the page shows, read from the DOM in mm. These functions run inside the
// page (page.evaluate), so they only use what they get as arguments.

export interface ShownPiece {
  id: number;
  /** The id of its sheet (data-sheet), or null if it is in the drag layer. */
  sheet: number | null;
  /** Its sheet's position among the sheets (0 = first), or -1. */
  sheetIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation of the image in degrees. */
  r: number;
  selected: boolean;
  label: string;
  /** The file name (the label up to its first comma, without «(página n)»). */
  name: string;
}

export interface Shown {
  /** Paper width and height in mm (from the paper label, in mm). */
  W: number;
  H: number;
  /** Screen px per mm of the sheets. */
  zoom: number;
  margin: number;
  gap: number;
  sheets: number[];
  /** Sorted by id. */
  pieces: ShownPiece[];
}

/**
 * Exact geometry (mm) from the styles (px / zoom). The zoom comes from the width
 * of the sheet's box and the paper's width in mm: `paperW` when given (when the
 * unit isn't mm the label can't tell it exactly), else the paper label.
 */
export const readGeometry = (paperW: number | null): Shown => {
  const num = (s: string | null | undefined) => parseFloat(String(s ?? '').replace(',', '.'));
  const label = document.getElementById('paper-label')!.textContent ?? '';
  const m = label.match(/· ([\d.,]+)\s×\s([\d.,]+)\smm/);
  const box = document.querySelector<HTMLElement>('#sheets .sheet-box')!;
  const W = paperW ?? num(m?.[1]);
  const zoom = parseFloat(box.style.width) / W;
  const H = parseFloat(box.style.height) / zoom;
  const sheets = [...document.querySelectorAll<HTMLElement>('#sheets .page')].map((p) => Number(p.dataset.sheet));
  const pieces = [...document.querySelectorAll<HTMLElement>('#sheets .piece')].map((p) => {
    const page = p.closest<HTMLElement>('.page');
    const img = p.querySelector('img');
    const tr = img?.style.transform ?? '';
    const aria = p.getAttribute('aria-label') ?? '';
    return {
      id: Number(p.dataset.id),
      sheet: page ? Number(page.dataset.sheet) : null,
      sheetIndex: page ? sheets.indexOf(Number(page.dataset.sheet)) : -1,
      x: parseFloat(p.style.left) / zoom,
      y: parseFloat(p.style.top) / zoom,
      w: parseFloat(p.style.width) / zoom,
      h: parseFloat(p.style.height) / zoom,
      r: Number((tr.match(/rotate\((\d+)deg\)/) ?? [0, 0])[1]),
      selected: p.classList.contains('is-selected'),
      label: aria,
      name: aria.split(',')[0].replace(/ \(página \d+\)$/, ''),
    };
  });
  pieces.sort((a, b) => a.id - b.id);
  const margin = document.getElementById('margin') as HTMLInputElement | null;
  const gap = document.getElementById('gap') as HTMLInputElement | null;
  return { W, H, zoom, margin: num(margin?.value), gap: num(gap?.value), sheets, pieces };
};

/** A snapshot of what the sheets show, to compare «exactly the same». */
export const readSnapshot = () =>
  JSON.stringify({
    sheets: [...document.querySelectorAll<HTMLElement>('#sheets .page')].map((p) => p.dataset.sheet),
    pieces: [...document.querySelectorAll<HTMLElement>('#sheets .piece')]
      .map((p) => {
        const img = p.querySelector('img')!;
        return [p.dataset.id, p.closest<HTMLElement>('.page')?.dataset.sheet, p.style.left, p.style.top, p.style.width, p.style.height, img.style.width, img.style.height, img.style.transform];
      })
      .sort((a, b) => Number(a[0]) - Number(b[0])),
  });

export interface ShownSheet {
  id: string;
  label: string;
  group: string;
  pieces: { id: string; name: string; x: number; y: number; w: number; h: number }[];
}

/** Per sheet (in order): its label, its group's name and its pieces (mm). */
export const readSheets = (): ShownSheet[] => {
  const label = document.getElementById('paper-label')!.textContent ?? '';
  const m = label.match(/· ([\d.,]+)\s×\s([\d.,]+)\s(mm|cm|in)/)!;
  const box = document.querySelector<HTMLElement>('#sheets .sheet-box')!;
  const toMm = { mm: 1, cm: 10, in: 25.4 }[m[3] as 'mm' | 'cm' | 'in'];
  const W = parseFloat(m[1].replace(',', '.')) * toMm;
  const zoom = parseFloat(box.style.width) / W;
  return [...document.querySelectorAll<HTMLElement>('#sheets .page')].map((page) => ({
    id: page.dataset.sheet!,
    label: page.querySelector('.page-label')?.textContent ?? '',
    group: page.querySelector('.sheet')?.getAttribute('aria-label') ?? '',
    pieces: [...page.querySelectorAll<HTMLElement>('.sheet > .piece')].map((p) => ({
      id: p.dataset.id!,
      name: (p.getAttribute('aria-label') ?? '').split(',')[0],
      x: parseFloat(p.style.left) / zoom,
      y: parseFloat(p.style.top) / zoom,
      w: parseFloat(p.style.width) / zoom,
      h: parseFloat(p.style.height) / zoom,
    })),
  }));
};

export interface Notice {
  text: string;
  action: string;
  warn: boolean;
}

/** The notice pill: its text, its action button's text and whether it is a warning. */
export const readNotice = (): Notice => {
  const nbsp = /\u00a0/g;
  const pill = document.getElementById('pill');
  if (!pill || pill.hidden) return { text: '', action: '', warn: false };
  const action = document.getElementById('pill-action');
  return {
    text: (document.getElementById('pill-text')?.textContent ?? '').trim().replace(nbsp, ' '),
    action: !action || action.hidden ? '' : (action.textContent ?? '').replace(nbsp, ' '),
    warn: pill.dataset.tone === 'warning',
  };
};

/** What the live regions say right now (polite, then assertive). */
export const readLive = () => `${document.getElementById('live-polite')?.textContent ?? ''} ${document.getElementById('live-assertive')?.textContent ?? ''}`;

// ---------- Checks on geometry (in Node) ----------

type Box = { x: number; y: number; w: number; h: number; sheet?: number | string | null; id?: number | string };

export const near = (a: number, b: number, tol = 1e-3) => Math.abs(a - b) <= tol;

/** Pieces of the same sheet that overlap by more than touching (the app's tolerance is 0.01 mm). */
export function overlapping<T extends Box>(pieces: readonly T[], eps = 0.011) {
  const bad: [T['id'], T['id']][] = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      if (a.sheet !== b.sheet) continue;
      if (a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps) bad.push([a.id, b.id]);
    }
  return bad;
}

/** Pieces of the same sheet closer than `gap` mm (or overlapping). */
export function closerThan<T extends Box>(pieces: readonly T[], gap: number, eps = 0.02) {
  const bad: [T['id'], T['id']][] = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      if (a.sheet !== b.sheet) continue;
      if (a.x < b.x + b.w + gap - eps && b.x < a.x + a.w + gap - eps && a.y < b.y + b.h + gap - eps && b.y < a.y + a.h + gap - eps) bad.push([a.id, b.id]);
    }
  return bad;
}

/** Pieces that cross the sheet's margin. */
export const outsideMargin = <T extends Box>(g: { W: number; H: number; margin: number; pieces: readonly T[] }, eps = 0.02) =>
  g.pieces.filter((p) => p.x < g.margin - eps || p.y < g.margin - eps || p.x + p.w > g.W - g.margin + eps || p.y + p.h > g.H - g.margin + eps);

/** Pieces whose center is off their sheet. */
export const centersOutside = <T extends Box>(g: { W: number; H: number; pieces: readonly T[] }) =>
  g.pieces.filter((p) => p.x + p.w / 2 < -1e-3 || p.y + p.h / 2 < -1e-3 || p.x + p.w / 2 > g.W + 1e-3 || p.y + p.h / 2 > g.H + 1e-3);

/** Bounding box of some pieces (of one sheet, if given). */
export function boundsOf<T extends Box & { id: number }>(pieces: readonly T[], ids: readonly number[], sheet?: number) {
  const list = pieces.filter((p) => ids.includes(p.id) && (sheet === undefined || p.sheet === sheet));
  if (!list.length) return null;
  const x0 = Math.min(...list.map((p) => p.x));
  const y0 = Math.min(...list.map((p) => p.y));
  const x1 = Math.max(...list.map((p) => p.x + p.w));
  const y1 = Math.max(...list.map((p) => p.y + p.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const onGrid = (v: number, step: number, tol = 2e-3) => Math.abs(v / step - Math.round(v / step)) * step <= tol;
