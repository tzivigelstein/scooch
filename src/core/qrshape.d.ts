import type { QrLevel } from './qrcode.js';
import type { QrAssetMeta, QrDots, QrEyes } from './types';

export const QR_DOTS: readonly QrDots[];
export const QR_EYES: readonly QrEyes[];
export const CAPTION_MAX: number;

export const QUIET_ZONE: number;
export const LOGO_SIDE: number;
export const CAPTION_BAND: number;
export const MIN_CONTRAST: number;

/** A rectangle in modules, from the top left of the code's square (quiet zone included). */
export interface QrBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface QrDrawing {
  version: number;
  level: QrLevel;
  /** Modules on a side, without the quiet zone. */
  size: number;
  /** The square's side in modules, quiet zone included. */
  units: number;
  /** Path data of the dark modules (finders apart). */
  dots: string;
  /** Path data of the three finder patterns. */
  eyes: string;
  logo: QrBox | null;
}

export interface QrCleared {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function cleanQr<T extends Pick<QrAssetMeta, 'text' | 'color' | 'background' | 'dots' | 'eyes' | 'caption'>>(qr: T): T;
export function fitText(text: string): string;
export function logoPlace(size: number, aspect: number): { box: QrBox; cleared: QrCleared };
export function logoFits(version: number, level: QrLevel, cleared: QrCleared): boolean;
export function qrDrawing(text: string, options?: { dots?: QrDots; eyes?: QrEyes; logo?: number | null }): QrDrawing | null;
export function luminance(hex: string): number;
export function contrastRatio(a: string, b: string): number;
export function colorIssue(color: string, background: string | null): 'contrast' | 'inverted' | null;
