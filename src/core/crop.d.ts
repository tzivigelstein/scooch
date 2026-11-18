import type { AssetSize, Crop, Point, Rect, Rotation, Size } from './types';

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
export function sameCrop(a: Crop | null | undefined, b: Crop | null | undefined): boolean;

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

export const SIZE_MATCH_TOLERANCE: number;
/** The standard photo size of a w × h mm piece, in either orientation, or null. */
export function matchPhotoSize(w: number, h: number, tolerance?: number): PhotoSize | null;

export function rotateCrop(crop: Crop | null | undefined, r: number): Crop;
export function unrotateCrop(rect: Crop, r: number): Crop;

/** Crop mode's two rectangles in sheet mm: the visible area and the whole (rotated) image. */
export interface CropFrame {
  frame: Rect;
  image: Rect;
}

export type FrameHandle = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw';
export const FRAME_HANDLES: readonly FrameHandle[];

export function cropFrame(item: PlacedOnSheet, asset: AssetSize): CropFrame;
export function pieceFromFrame(asset: AssetSize, r: number, frame: CropFrame): { x: number; y: number; scale: number; crop: Crop | null };
export function panFrame(frame: CropFrame, dx: number, dy: number): CropFrame;
export function zoomFrame(frame: CropFrame, factor: number, focus?: Point): CropFrame;
export function resizeFrame(frame: CropFrame, handle: FrameHandle, dx: number, dy: number, options?: { lock?: boolean }): CropFrame;
export function frameToSize(frame: CropFrame, size: Size): CropFrame;
