import type { AssetSize, Item, Size } from './types';

export interface SettleOptions {
  /** A piece's asset size at 100 %. */
  assetOf: (item: Item) => AssetSize;
  W: number;
  H: number;
  margin?: number;
  gap?: number;
  /** The cut margin around each image, mm (the layout keeps it apart too). */
  pad?: number;
  allowOverlap?: boolean;
  /** The id of each sheet to add. */
  newSheet: () => number;
}

export interface Settled {
  /** The changed pieces where they go, in the order they came. */
  items: Item[];
  /** The ids that moved aside: to a free spot of their sheet or to another sheet. */
  moved: number[];
  /** The sheets to add at the end. */
  sheets: number[];
}

/** `item` with `patch` applied, moved so its center stays where it was. */
export function withCenterKept(item: Item, patch: Partial<Item>, asset: AssetSize): Item;

/** Where pieces that changed size go: center kept and on the sheet, moved off others unless overlaps are allowed. */
export function settleResized(changed: readonly Item[], items: readonly Item[], sheetIds: readonly number[], options: SettleOptions): Settled;

export interface PhotoSizePlan {
  changed: Item[];
  /** The pieces whose scale would leave 1 %–1000 %, as they would be: they don't change. */
  refused: Item[];
  moved: number[];
  sheets: number[];
  /** The changed pieces that end up off the sheet or, with overlaps not allowed, on another piece. */
  problems: number[];
}

/** What choosing a standard photo size (null: «Original») does to the selected pieces, without changing anything. */
export function planPhotoSize(selected: readonly Item[], size: Size | null, options: SettleOptions & { items: readonly Item[]; sheetIds: readonly number[] }): PhotoSizePlan;
