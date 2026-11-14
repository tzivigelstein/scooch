/** A name and its other words, folded (lowercase, no accents) for searching. */
export interface FuzzyTarget {
  name: string;
  key: string;
  alt: string;
}

/** Matched parts of a name: [start, end) pairs, sorted and merged. */
export type FuzzyRanges = [number, number][];

export interface FuzzyMatch {
  /** Higher is better; 0 for an empty query. */
  score: number;
  ranges: FuzzyRanges;
}

export function fold(text: string): string;
export function prepare(name: string, aliases?: string): FuzzyTarget;
export function fuzzyMatch(query: string, target: FuzzyTarget): FuzzyMatch | null;
export function fuzzyFilter(query: string, targets: readonly FuzzyTarget[]): (FuzzyMatch & { index: number })[];
