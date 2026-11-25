export type QrLevel = 'L' | 'M' | 'Q' | 'H';

export const QR_LEVELS: readonly QrLevel[];
export const MIN_VERSION: 1;
export const MAX_VERSION: 40;

export interface QrMatrix {
  version: number;
  /** Modules on a side, without the quiet zone. */
  size: number;
  level: QrLevel;
  mask: number;
  /** size × size flags in rows: 1 for a dark module. */
  dark: Uint8Array;
  /** size × size flags in rows: 1 for a function module (finders, timing, alignment, format and version information). */
  reserved: Uint8Array;
}

export interface CodewordLayout {
  size: number;
  /** For each module, the codeword it carries (its index in the final sequence), or −1. */
  codeword: Int16Array;
  /** For each module, which bit of its codeword it carries (7 the highest), or −1. */
  bit: Int8Array;
  /** The block of each codeword of the sequence. */
  blockOf: Uint8Array;
  blocks: number;
  /** Error correction codewords per block. */
  ecc: number;
}

export function sizeOf(version: number): number;
export function dataCodewords(version: number, level: QrLevel): number;
export function fitsQr(text: string, level?: QrLevel): boolean;
export function alignmentPositions(version: number): number[];
export function encodeQr(text: string, options?: { level?: QrLevel; minVersion?: number; boost?: boolean; mask?: number | null }): QrMatrix | null;
export function codewordLayout(version: number, level: QrLevel): CodewordLayout;
export function codewordsOf(text: string, version: number, level: QrLevel): { codewords: Uint8Array; blockOf: Uint8Array };
