import type { CustomPaper, CutMode, Paper, Size } from './types';

export type DeepLinkKey = 'paper' | 'orientation' | 'margin' | 'gap' | 'photo' | 'cuts' | 'cutmargin' | 'rotate';

export const DEEP_LINK_KEYS: readonly DeepLinkKey[];
export const LENGTH_RANGE: readonly [number, number];
export const PHOTO_RANGE: readonly [number, number];
/** The cut margin's range in mm: the one its field enforces (CUT_LIMITS.margin). */
export const CUT_MARGIN_RANGE: readonly [number, number];

/** What a new project takes from a link (only what was valid). */
export interface DeepLinkSettings {
  paper?: Paper;
  landscape?: boolean;
  margin?: number;
  gap?: number;
  cutMode?: CutMode;
  /** mm between each image and its cut line (Cuts.margin). */
  cutMargin?: number;
  rotate?: boolean;
}

/** The size the images added to the new project get: a PHOTO_SIZES id, or a custom size (`id` null). */
export interface DeepLinkPhoto extends Size {
  id: string | null;
}

export interface DeepLink {
  /** The deep link parameters present in the query, valid or not. */
  keys: DeepLinkKey[];
  settings: DeepLinkSettings;
  photo: DeepLinkPhoto | null;
}

export function parseDeepLink(search: string, defaults?: { paper?: Paper }): DeepLink | null;
export function setsUp(link: DeepLink | null | undefined): link is DeepLink;

export interface DeepLinkRequest extends DeepLinkSettings {
  paper?: Paper | CustomPaper;
  photo?: string | Size;
}

export function deepLinkSearch(request?: DeepLinkRequest): string;
export function withoutDeepLink(search: string): string;
