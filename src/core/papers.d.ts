import type { CustomPaper, PaperGroup, PaperId, Size } from './types';

export const PAPER_GROUPS: readonly PaperGroup[];

export interface PaperPreset {
  id: PaperId;
  w: number;
  h: number;
  group: PaperGroup;
}

export const PAPERS: readonly PaperPreset[];
export const CUSTOM_MIN: number;
export const CUSTOM_MAX: number;
export const MATCH_TOLERANCE: number;

export type SideProblem = 'invalid' | 'too-small' | 'too-large';

export function getPaper(id: unknown): PaperPreset | null;
export function validateSide(mm: unknown): SideProblem | null;
export function validateCustom(w: unknown, h: unknown): SideProblem | null;
/** A custom paper from what was typed: stored portrait, landscape when w > h. */
export function customPaper(w: number, h: number): { paper: CustomPaper; landscape: boolean } | null;
/** Sheet width and height for a paper and an orientation, or null when the paper is not valid. */
export function sizeOf(paper: unknown, landscape?: boolean): Size | null;
export function matchPreset(w: number, h: number, tolerance?: number): { id: PaperId; landscape: boolean } | null;

export interface PaperInfo {
  custom: boolean;
  id: PaperId | null;
  match: PaperId | null;
  group: PaperGroup | null;
  w: number;
  h: number;
  landscape: boolean;
}

export function describe(paper: unknown, landscape?: boolean): PaperInfo | null;
