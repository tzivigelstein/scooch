// The document (sheets and pieces) and the selection, in a Zustand store. All
// lengths in mm. The document has an ordered list of sheets (always at least
// one), all with the same paper, orientation and margin; each piece belongs to
// a sheet (`sheet`, its id) and its x/y are relative to that sheet.
//
// State is immutable: every change replaces the arrays and objects it touches,
// so the undo history (history.ts) keeps plain references.

import { create } from 'zustand';
import { DEFAULT_CUTS } from '../core/projectdoc.js';
import type { Cuts, Item, Paper, Sheet } from '../core/types.ts';

export type Piece = Readonly<Item>;

export interface DocumentData {
  readonly sheets: readonly Readonly<Sheet>[];
  /** In stacking order (the last one is on top). */
  readonly items: readonly Piece[];
  readonly paper: Paper;
  readonly landscape: boolean;
  readonly margin: number;
  readonly gap: number;
  readonly cuts: Readonly<Cuts>;
  /** «Permitir superposición»: pieces may overlap when moved, scaled, aligned… */
  readonly allowOverlap: boolean;
}

export interface DocumentState extends DocumentData {
  /**
   * Selected piece ids in the order they were selected: the last one is the
   * primary (the one of the toolbar, the current sheet and the focus).
   */
  readonly selection: readonly number[];
  /** «Rotación automática»: saved with the project but outside the undo history. */
  readonly rotate: boolean;
  /** Something is loading or being created: actions wait. */
  readonly busy: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export const useDocument = create<DocumentState>()(() => ({
  sheets: [{ id: 1 }],
  items: [],
  selection: [],
  paper: 'A4',
  landscape: false,
  margin: 10,
  gap: 5,
  cuts: { ...DEFAULT_CUTS },
  allowOverlap: false,
  rotate: true,
  busy: false,
  canUndo: false,
  canRedo: false,
}));

export const getDocument = () => useDocument.getState();
export const setDocument = (patch: Partial<DocumentState>) => useDocument.setState(patch);

// ---------- Ids ----------

let nextItemId = 1;
let nextSheetId = 2;

export const newItemId = () => nextItemId++;
export const newSheetId = () => nextSheetId++;
export const newSheet = (): Sheet => ({ id: newSheetId() });

export const newItem = (asset: string, props: Partial<Item> = {}): Item => ({ id: newItemId(), asset, sheet: 1, x: 0, y: 0, scale: 100, r: 0, crop: null, ...props });

/** After opening a document, new ids continue after its own. */
export function resetIds(next: { item: number; sheet: number }) {
  nextItemId = next.item;
  nextSheetId = next.sheet;
}

// ---------- Changes ----------

/** Replaces some fields of some pieces (by id), keeping the others as they are. */
export function patchItems(patches: ReadonlyMap<number, Partial<Item>>) {
  if (!patches.size) return;
  const items = getDocument().items.map((item) => {
    const patch = patches.get(item.id);
    return patch ? { ...item, ...patch } : item;
  });
  setDocument({ items });
}

export const patchItem = (id: number, patch: Partial<Item>) => patchItems(new Map([[id, patch]]));
