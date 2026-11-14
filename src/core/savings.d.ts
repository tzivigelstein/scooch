import type { Savings } from './storedprefs';
import type { Rect } from './types';

export const PAPER_GSM: number;
export const SHEET_MM: number;
export const REAM: number;
export const MILESTONES: readonly number[];
export const MIN_GRAMS: number;
export const LOW_USAGE: number;

/** A physical fact a person can picture: grams or kg of paper, a stack in cm, reams. */
export interface Equivalent {
  kind: 'grams' | 'kg' | 'stack' | 'reams';
  value: number;
}

export function unionArea(rects: readonly Rect[]): number;
/** The share (0–1) of the printable area the pieces use over the sheets that print, or null. */
export function sheetUsage(sheets: readonly (readonly Rect[])[], area: Rect): number | null;
export function sheetSavings(pieces: number, sheetsUsed: number): { used: number; baseline: number; saved: number };
export function paperFacts(saved: number, w: number, h: number): { grams: number; ream: number; stack: number };
export function tangibleFacts(saved: number, w: number, h: number): Equivalent[];
export function equivalent(turn: number, facts: readonly Equivalent[]): Equivalent | null;
export function milestoneReached(before: number, after: number): number | null;
export function suggestArrange(share: number | null, used: number, packed: number | null): boolean;

export function pdfKey(description: unknown): string;
export function settlePending(savings: Savings): Savings;
export function countPdf(savings: Savings, key: string, saved: number, how: 'print' | 'download'): { savings: Savings; added: number; milestone: number | null };
