// Shared setup for tests of the state layer (actions on the real Zustand stores)
// and of components that read those stores. Assets are fake (no image is
// decoded): only their size in mm, pixels and resolution matter to the actions.
import { vi } from 'vitest';
import { addAsset } from '../../src/state/assets.ts';
import { DEFAULT_CUTS } from '../../src/core/projectdoc.js';
import { setDocument, resetIds, type DocumentState, type Piece } from '../../src/state/document.ts';
import { resetHistory } from '../../src/state/history.ts';
import { usePrefs } from '../../src/state/prefs.ts';
import { setView } from '../../src/state/view.ts';
import { GRID_DEFAULTS } from '../../src/config.ts';
import type { ImageAsset, PdfAsset } from '../../src/services/assets.ts';

const MM_PER_INCH = 25.4;

// The binaries of fake assets aren't hashed (jsdom's Blob can't be read): each gets hashes of its own.
let fakes = 0;
const fakeHashes = (src: number) => ({ src: `fake-src-${src}`, preview: `fake-preview-${++fakes}` });

/** Adds a fake image asset of `px` pixels at `dpi` (300 by default) and returns its key. */
/**
 * Live regions in the page and fake timers, for tests that check what an
 * action announces: then `heard()` says it (what the polite region holds).
 */
export function listen() {
  document.body.insertAdjacentHTML('beforeend', '<div id="live-polite"></div><div id="live-assertive"></div>');
  vi.useFakeTimers();
}

/** What was announced (after `listen()`), with plain spaces; the region is emptied. */
export function heard(ms = 1000) {
  vi.advanceTimersByTime(ms);
  const region = document.getElementById('live-polite')!;
  const text = (region.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  region.textContent = '';
  return text;
}

export function fakeImage({ name = 'foto.png', src = 1, px = [600, 400] as [number, number], dpi = 300, format = 'png' as 'png' | 'jpg' } = {}) {
  const asset: ImageAsset = {
    kind: 'image',
    name,
    src,
    px,
    w: (px[0] / dpi) * MM_PER_INCH,
    h: (px[1] / dpi) * MM_PER_INCH,
    bytes: new Uint8Array(),
    preview: new Blob(),
    url: 'blob:test',
    format,
    dpi,
    derived: false,
    hashes: fakeHashes(src),
  };
  return addAsset(asset);
}

/** Adds a fake image asset of exactly `w` × `h` mm and returns its key. */
export const fakeImageMm = (w: number, h: number, { name = 'foto.png', src = 1, dpi = 300 } = {}) =>
  fakeImage({ name, src, dpi, px: [Math.round((w / MM_PER_INCH) * dpi), Math.round((h / MM_PER_INCH) * dpi)] });

/** Adds a fake PDF page asset of `w` × `h` mm (page `page` of `pages`) and returns its key. */
export function fakePdf({ name = 'doc.pdf', src = 1, w = 148, h = 210, page = 1, pages = 1, pageRotation = 0 } = {}) {
  const pt = (mm: number) => (mm / MM_PER_INCH) * 72;
  const asset: PdfAsset = {
    kind: 'pdf',
    name,
    src,
    page,
    pages,
    pageRotation,
    view: [0, 0, pt(w), pt(h)],
    px: [Math.round(pt(w) * 2), Math.round(pt(h) * 2)],
    w,
    h,
    bytes: new Uint8Array(),
    preview: new Blob(),
    url: 'blob:test',
    pdf: null,
    hashes: fakeHashes(src),
  };
  return addAsset(asset);
}

/** A piece (the document's item) with sensible defaults. */
export const piece = (id: number, asset: string, x: number, y: number, props: Partial<Piece> = {}): Piece => ({ id, asset, sheet: 1, x, y, scale: 100, r: 0, crop: null, ...props });

/**
 * Starts from a known state: an A4 portrait document with one sheet, margin 10,
 * gap 5, default cut lines, overlaps not allowed, nothing selected and no
 * history; preferences in mm with the grid's defaults (snap on, 1 mm), single
 * keys on; no notice. `doc` patches the document on top of that.
 */
export function resetState(doc: Partial<DocumentState> = {}) {
  usePrefs.setState({ unit: 'mm', singleKeys: true, grid: { ...GRID_DEFAULTS }, sections: {}, cutOptions: false, printing: { tip: true, summary: true }, theme: 'auto' });
  setView({ sheet: 1, pinned: false, flash: null, busyText: '', alignTo: 'selection', distribute: 'gap', drawer: null, propsTab: 'project', editing: false, cropping: null, loading: false });
  setDocument({
    sheets: [{ id: 1 }],
    items: [],
    selection: [],
    paper: 'A4',
    landscape: false,
    margin: 10,
    gap: 5,
    cuts: { ...DEFAULT_CUTS },
    rotate: true,
    allowOverlap: false,
    busy: false,
    ...doc,
  });
  const items = doc.items ?? [];
  const sheets = doc.sheets ?? [{ id: 1 }];
  resetIds({ item: Math.max(0, ...items.map((i) => i.id)) + 1, sheet: Math.max(1, ...sheets.map((s) => s.id)) + 1 });
  resetHistory();
}
