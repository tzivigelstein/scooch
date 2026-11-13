import type { AssetMeta, Crop, Cuts, Item, Paper, Rotation, Sheet, StoredClip, StoredHistory } from './types';

export const HISTORY_VERSION: number;
export const CLIP_VERSION: number;

/** An undo step: the document without its binaries, and the selection. */
export interface StepSnapshot {
  readonly sheets: readonly Readonly<Sheet>[];
  readonly items: readonly Readonly<Item>[];
  readonly selection: readonly number[];
  readonly paper: Paper;
  readonly landscape: boolean;
  readonly margin: number;
  readonly gap: number;
  readonly cuts: Readonly<Cuts>;
  readonly allowOverlap: boolean;
}

export function serializeHistory(
  project: string,
  stacks: { undo: readonly StepSnapshot[]; redo: readonly StepSnapshot[] },
  metaOf: (assetKey: string) => AssetMeta,
  hashOf: (fileKey: string) => string | undefined
): StoredHistory | null;

export function parseHistory(raw: unknown): { undo: StepSnapshot[]; redo: StepSnapshot[]; assets: Record<string, AssetMeta>; files: Record<string, string> } | null;

/** A piece in the clipboard: its asset and how it was. */
export interface ClipPieceMeta {
  asset: string;
  scale: number;
  r: Rotation;
  crop: Crop | null;
}

export function serializeClip(pieces: readonly ClipPieceMeta[], metaOf: (assetKey: string) => AssetMeta, hashOf: (fileKey: string) => string | undefined): StoredClip | null;
export function parseClip(raw: unknown): { pieces: ClipPieceMeta[]; assets: Record<string, AssetMeta>; files: Record<string, string> } | null;

export function nextIdsOf(history: { undo?: readonly StepSnapshot[]; redo?: readonly StepSnapshot[]; assets?: Record<string, AssetMeta> }): { item: number; sheet: number; asset: number; src: number };
