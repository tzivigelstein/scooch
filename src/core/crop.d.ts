import type { AssetSize, Crop, Point, Rotation, Size } from './types';

export const MIN_CROP: number;

export interface PhotoSize {
  id: string;
  w: number;
  h: number;
  group: 'print' | 'id' | 'instant';
}

export const PHOTO_SIZES: readonly PhotoSize[];
export function photoSize(id: string): PhotoSize | null;

export function isIdentity(crop: Crop | null | undefined): boolean;
export function clampCrop(crop: Crop | null | undefined): Crop | null;

/** A piece's printed size: `w`/`h` as it sits on the sheet (rotated), `uw`/`uh` unrotated. */
export interface PieceSize {
  w: number;
  h: number;
  uw: number;
  uh: number;
}

export interface Placed {
  scale: number;
  r?: number;
  crop?: Crop | null;
}

export function pieceSize(asset: AssetSize, piece: Placed): PieceSize;
export function cropToAspect(imgW: number, imgH: number, aspect: number, focus?: Point): Crop;
export function fitToSize(asset: AssetSize, r: number, target: Size, options?: { autoOrient?: boolean; focus?: Point }): { crop: Crop | null; scale: number; r: Rotation };
export function panCrop(crop: Crop | null | undefined, dx: number, dy: number): Crop | null;
export function panDelta(asset: AssetSize, item: { scale: number; r: number }, dx: number, dy: number): { dx: number; dy: number };
export function zoomCrop(crop: Crop | null | undefined, factor: number, focus?: Point): Crop | null;

export interface PlacedOnSheet extends Placed {
  x: number;
  y: number;
  r: number;
}

/** Numbers to draw a piece with pdf-lib, in PDF points (see the comment in crop.js). */
export interface DrawParams {
  clip: { x: number; y: number; width: number; height: number } | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
}

export function drawParams(item: PlacedOnSheet, asset: AssetSize, sheetH: number): DrawParams;

/** The same for the screen, in px: the clipping container and the whole image inside it. */
export interface CssParams {
  left: number;
  top: number;
  width: number;
  height: number;
  img: { width: number; height: number; left: number; top: number; rotate: Rotation; transform: string };
}

export function cssParams(item: PlacedOnSheet, asset: AssetSize, zoom: number): CssParams;
