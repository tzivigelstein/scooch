import type { Rect, Size } from './types';

export interface Area {
  aw: number;
  ah: number;
}

export interface GridCapacity {
  count: number;
  cols: number;
  rows: number;
  rotated: boolean;
}

export interface SheetCapacity {
  count: number;
  placements: Rect[];
  capped: boolean;
  grid: GridCapacity;
}

export function gridCapacity(piece: Size, area: Area, options?: { gap?: number; rotate?: boolean }): GridCapacity;
export function sheetCapacity(piece: Size, area: Area, options?: { gap?: number; rotate?: boolean; limit?: number }): SheetCapacity;
