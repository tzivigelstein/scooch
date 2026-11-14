// What the canvas shows while a control is hovered or has the keyboard focus:
// what the control measures (a highlight: the margin, the gaps, a measure, the
// cut lines, the grid, a piece or the ones a notice is about) or what
// activating it would leave (a preview: ghosts of the pieces aligned,
// distributed or copied). Worked out with the same functions the actions
// apply, and never part of the document, the undo history or what is stored:
// it goes when the control is left or activated, or with Esc
// (hooks/usePreviewTriggers.ts).

import { create } from 'zustand';
import type { AlignMode, Axis } from '../core/align.js';
import { neighborGaps } from '../core/gaps.js';
import type { IdRect, Rect } from '../core/types.ts';
import { lengthText } from '../services/measure.ts';
import { getDocument, useDocument, type Piece } from './document.ts';
import { getPrefs, usePrefs } from './prefs.ts';
import { boxes, currentSheet, findItem, imageBoxOf, itemsOn, primaryItem, problemsById, selectedItem, selectedItems } from './selectors.ts';
import { getView, useView } from './view.ts';
import { fillCopies, type NewIds } from './actions/layout.ts';
import { alignPlan, distributePlan, duplicatePlan, lengthFieldValue, planPatches, primaryBox, type LengthField } from './actions/pieces.ts';

/** What a control shows on the canvas (its `data-preview`; `data-preview-arg` says which piece, mode, axis…). */
export type PreviewKind = 'margin' | 'gap' | 'x' | 'y' | 'width' | 'height' | 'cuts' | 'grid' | 'piece' | 'problems' | 'align' | 'distribute' | 'fill' | 'duplicate';

export interface PreviewTrigger {
  kind: PreviewKind;
  arg?: string;
}

/** The previews of an action: activating it takes them away (a highlight stays while the control is used). */
export const ACTION_PREVIEWS: ReadonlySet<PreviewKind> = new Set(['align', 'distribute', 'fill', 'duplicate']);

/** A piece where an action would leave it. `blocked`: the action wouldn't apply (it would overlap or leave the sheet). */
export interface Ghost {
  item: Piece;
  blocked: boolean;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A measure field's length on the sheet: from the edge it is measured from, or along the side it measures. */
export interface Dimension {
  field: LengthField;
  box: Rect;
  text: string;
}

/** What shows on one sheet (mm on that sheet). */
export interface SheetPreview {
  gaps?: Rect[];
  /** Pieces pointed out (see Overlay.tone). */
  outlines?: Rect[];
  /** Pieces an action would replace. */
  dimmed?: Rect[];
  /** What aligning goes against: its box and the line the pieces go to. */
  reference?: { box: Rect; line: Line };
  ghosts?: Ghost[];
  dimension?: Dimension;
  /** Copies that would go to other sheets (or to sheets still to add). */
  more?: number;
}

export interface Overlay {
  /** The margin band of every sheet, in mm. */
  margin?: number;
  grid?: boolean;
  cuts?: boolean;
  /** How the outlines look: a piece pointed out, or the ones with a problem. */
  tone?: 'locate' | 'problem';
  sheets: ReadonlyMap<number, SheetPreview>;
}

export interface PreviewState {
  overlay: Overlay | null;
}

export const usePreview = create<PreviewState>()(() => ({ overlay: null }));

// ---------- Working out what shows ----------

const NO_SHEETS: ReadonlyMap<number, SheetPreview> = new Map();
/** Neighbors closer than this (mm, or twice the gap) count as neighbors for «Separación». */
const NEIGHBOR_MM = 10;
/**
 * Work budget of a preview of copies: copies × pieces they are placed among
 * (5000 takes about 12 ms). Past it, nothing is worked out on hover: a frame
 * must not stall.
 */
export const COPIES_BUDGET = 5000;

/** Ids for pieces and sheets that don't exist: past any real one, going up like the real ones. */
function madeUpIds(): NewIds {
  let item = 2 ** 40;
  let sheet = 2 ** 40;
  return { item: () => ++item, sheet: () => ++sheet };
}

const rectOf = (item: Piece): Rect => {
  const { x, y, w, h } = imageBoxOf(item);
  return { x, y, w, h };
};

function partOf(sheets: Map<number, SheetPreview>, sheet: number) {
  let part = sheets.get(sheet);
  if (!part) sheets.set(sheet, (part = {}));
  return part;
}

/** Ghosts of the pieces a plan moves (the ones it leaves where they are don't need one). */
function addGhosts(sheets: Map<number, SheetPreview>, rects: ReadonlyMap<number, IdRect>, blocked: boolean) {
  for (const [id, patch] of planPatches(rects)) {
    const item = findItem(id);
    if (!item) continue;
    const ghost = { ...item, ...patch };
    if (ghost.x === item.x && ghost.y === item.y && ghost.sheet === item.sheet) continue;
    (partOf(sheets, ghost.sheet).ghosts ??= []).push({ item: ghost, blocked });
  }
}

function outlined(items: readonly Piece[], tone: Overlay['tone']): Overlay | null {
  if (!items.length) return null;
  const sheets = new Map<number, SheetPreview>();
  for (const item of items) (partOf(sheets, item.sheet).outlines ??= []).push(rectOf(item));
  return { tone, sheets };
}

function gapsOverlay(): Overlay | null {
  const max = Math.max(2 * getDocument().gap, NEIGHBOR_MM);
  const bySheet = new Map<number, Rect[]>();
  for (const box of boxes()) {
    if (!bySheet.has(box.sheet)) bySheet.set(box.sheet, []);
    bySheet.get(box.sheet)!.push(box);
  }
  const sheets = new Map<number, SheetPreview>();
  for (const [sheet, list] of bySheet) {
    const gaps = neighborGaps(list, max);
    if (gaps.length) sheets.set(sheet, { gaps });
  }
  return sheets.size ? { sheets } : null;
}

function dimensionOverlay(field: LengthField): Overlay | null {
  const list = selectedItems();
  const primary = primaryItem();
  const value = lengthFieldValue(field);
  if (!primary || value === null) return null;
  const box = list.length > 1 ? primaryBox(list) : rectOf(primary);
  return { sheets: new Map([[primary.sheet, { dimension: { field, box, text: lengthText(value) } }]]) };
}

/** The line of `box` that aligning with `mode` takes the pieces to. */
export function alignLine(box: Rect, mode: AlignMode): Line {
  const x = { left: box.x, centerX: box.x + box.w / 2, right: box.x + box.w }[mode as 'left' | 'centerX' | 'right'];
  if (x !== undefined) return { x1: x, y1: box.y, x2: x, y2: box.y + box.h };
  const y = { top: box.y, centerY: box.y + box.h / 2, bottom: box.y + box.h }[mode as 'top' | 'centerY' | 'bottom'];
  return { x1: box.x, y1: y, x2: box.x + box.w, y2: y };
}

function alignOverlay(mode: AlignMode): Overlay | null {
  const result = alignPlan(mode);
  if (!result) return null;
  const sheets = new Map<number, SheetPreview>();
  for (const [sheet, box] of result.references) partOf(sheets, sheet).reference = { box, line: alignLine(box, mode) };
  if (result.plan.changed) addGhosts(sheets, result.plan.rects, !result.plan.ok);
  return { sheets };
}

function distributeOverlay(axis: Axis): Overlay | null {
  const plan = distributePlan(axis);
  if (!plan?.changed) return null;
  const sheets = new Map<number, SheetPreview>();
  addGhosts(sheets, plan.rects, !plan.ok);
  return sheets.size ? { sheets } : null;
}

function fillOverlay(): Overlay | null {
  const item = selectedItem();
  const copies = item && fillCopies(item, madeUpIds().item);
  if (!item || !copies) return null;
  const part: SheetPreview = { ghosts: copies.map((copy) => ({ item: copy, blocked: false })), dimmed: itemsOn(item.sheet).map(rectOf) };
  return { sheets: new Map([[item.sheet, part]]) };
}

function duplicateOverlay(times: number): Overlay | null {
  const n = selectedItems().length * times;
  if (!(n > 0) || n * (getDocument().items.length + n) > COPIES_BUDGET) return null;
  const plan = duplicatePlan(times, madeUpIds());
  if (!plan) return null;
  const home = currentSheet();
  const fresh = new Set(plan.sheets);
  const sheets = new Map<number, SheetPreview>();
  let away = 0;
  for (const copy of plan.copies) {
    if (copy.sheet !== home) away++;
    if (!fresh.has(copy.sheet)) (partOf(sheets, copy.sheet).ghosts ??= []).push({ item: copy, blocked: false });
  }
  if (away) partOf(sheets, home).more = away;
  return { sheets };
}

const PROBLEMS = new Set(['cut', 'pastMargin', 'overlap']);

/** What `trigger` shows now, worked out from the stores (null: nothing to show). */
export function overlayFor({ kind, arg }: PreviewTrigger): Overlay | null {
  const doc = getDocument();
  switch (kind) {
    case 'margin':
      return doc.margin > 0 ? { margin: doc.margin, sheets: NO_SHEETS } : null;
    case 'grid':
      return { grid: true, sheets: NO_SHEETS };
    case 'cuts':
      return doc.cuts.mode !== 'none' && doc.items.length ? { cuts: true, sheets: NO_SHEETS } : null;
    case 'gap':
      return gapsOverlay();
    case 'x':
    case 'y':
    case 'width':
    case 'height':
      return dimensionOverlay(kind);
    case 'piece': {
      const item = findItem(Number(arg));
      return item ? outlined([item], 'locate') : null;
    }
    case 'problems': {
      if (!arg || !PROBLEMS.has(arg)) return null;
      const problems = problemsById();
      return outlined(
        doc.items.filter((item) => problems.get(item.id)?.[arg as 'cut' | 'pastMargin' | 'overlap']),
        'problem'
      );
    }
  }
  // What an action would do: nothing while something loads (it wouldn't run).
  if (doc.busy) return null;
  switch (kind) {
    case 'align':
      return alignOverlay(arg as AlignMode);
    case 'distribute':
      return distributeOverlay(arg === 'y' ? 'y' : 'x');
    case 'fill':
      return fillOverlay();
    case 'duplicate':
      return duplicateOverlay(Math.floor(Number(arg) || 1));
  }
  return null;
}

// ---------- What shows now ----------

// What an overlay depends on: while none of it changes, a trigger shows the
// same thing (moving back and forth over the align buttons works each out once).
const dependencies = () => {
  const d = getDocument();
  const v = getView();
  const p = getPrefs();
  return [d.items, d.sheets, d.selection, d.paper, d.landscape, d.margin, d.gap, d.cuts, d.allowOverlap, d.rotate, d.busy, v.alignTo, v.distribute, v.sheet, p.grid, p.unit];
};

let cache = { deps: [] as unknown[], overlays: new Map<string, Overlay | null>() };

function cachedOverlay(trigger: PreviewTrigger) {
  const deps = dependencies();
  if (deps.some((dep, i) => dep !== cache.deps[i])) cache = { deps, overlays: new Map() };
  const key = `${trigger.kind}:${trigger.arg ?? ''}`;
  if (!cache.overlays.has(key)) cache.overlays.set(key, overlayFor(trigger));
  return cache.overlays.get(key)!;
}

let current: PreviewTrigger | null = null;
let pending = 0;

const nextFrame = (fn: () => void): number => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : Number(setTimeout(fn, 16)));
const cancelFrame = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));

/** Works the overlay out in the next frame: passing over several controls works out only the last one. */
function schedule() {
  if (pending) return;
  pending = nextFrame(() => {
    pending = 0;
    usePreview.setState({ overlay: current ? cachedOverlay(current) : null });
  });
}

/** The control now hovered or focused (null: none). Clearing is immediate: before an action runs. */
export function showPreview(trigger: PreviewTrigger | null) {
  if (trigger?.kind === current?.kind && trigger?.arg === current?.arg) return;
  current = trigger;
  if (trigger) return schedule();
  if (pending) cancelFrame(pending);
  pending = 0;
  if (usePreview.getState().overlay) usePreview.setState({ overlay: null });
}

/** The control whose preview shows (or is about to). */
export const previewTrigger = () => current;

// While something shows, it follows what it depends on (a margin being typed, a piece moved).
const follow = () => {
  if (current) schedule();
};
useDocument.subscribe(follow);
useView.subscribe(follow);
usePrefs.subscribe(follow);
