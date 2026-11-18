import type { RectId } from './types';

export function clamp(v: number, lo: number, hi: number): number;
/** Rounds to 0.1. */
export function round1(v: number): number;
/** Rounds to 0.01. */
export function tidy(v: number): number;
/** Rounds to 0.0001. */
export function fine(v: number): number;
export function num(v: number): string;
export function compareIds(a: RectId, b: RectId): number;
export function slug(text: string, fallback: string): string;
