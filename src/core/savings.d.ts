import type { Savings } from './storedprefs';
import type { Rect } from './types';

export const PAPER_GSM: number;
export const SHEET_MM: number;
export const REAM: number;
export const MILESTONES: readonly number[];
export type EquivalentKind = 'grams' | 'ream' | 'stack';
export const EQUIVALENTS: readonly EquivalentKind[];
export const LOW_USAGE: number;

export function unionArea(rects: readonly Rect[]): number;
/** The share (0–1) of the printable area the pieces use over the sheets that print, or null. */
export function sheetUsage(sheets: readonly (readonly Rect[])[], area: Rect): number | null;
export function sheetSavings(pieces: number, sheetsUsed: number): { used: number; baseline: number; saved: number };
export function paperFacts(saved: number, w: number, h: number): Record<EquivalentKind, number>;
export function equivalent(turn: number, facts: Record<EquivalentKind, number>): { kind: EquivalentKind; value: number };
export function milestoneReached(before: number, after: number): number | null;
export function suggestArrange(share: number | null, used: number, packed: number | null): boolean;

export function pdfKey(description: unknown): string;
export function countPdf(savings: Savings, key: string, saved: number): { savings: Savings; added: number };
export function uncountPdf(savings: Savings, key: string, added: number): Savings;
