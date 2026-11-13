import type { Crop, Cuts, ImageAssetMeta, Item, Paper, PdfAssetMeta, ProjectDoc, Sheet } from './types';

export const DOC_VERSION: number;
export const DEFAULT_CUTS: Readonly<Cuts>;
/** The stroke of version 2 documents (they keep it when migrated). */
export const LEGACY_CUT_STYLE: Readonly<Pick<Cuts, 'weight' | 'color' | 'dash'>>;
export function cleanCuts(cuts: Partial<Cuts> | undefined): Cuts;
export const CUT_LIMITS: Readonly<{ length: readonly [number, number]; offset: readonly [number, number]; margin: readonly [number, number] }>;

export function cleanCrop(crop: Crop | null | undefined): Crop | null;

export type ProjectErrorCode = 'corrupt' | 'newer' | 'missing';

/** A document that cannot be opened. */
export class ProjectError extends Error {
  constructor(code: ProjectErrorCode, detail?: string);
  code: ProjectErrorCode;
}

/** What gets saved of the document state. */
export interface DocumentState {
  sheets: readonly Sheet[];
  items: readonly Item[];
  paper: Paper;
  landscape: boolean;
  margin: number;
  gap: number;
  rotate: boolean;
  allowOverlap?: boolean;
  cuts?: Partial<Cuts>;
}

/** What a migration needs from outside the document. */
export interface MigrationContext {
  /** The device's «Permitir superposición»: documents before version 5 take it. */
  allowOverlap?: boolean;
}

/** An app asset as far as serializing goes (the binaries and extra fields are ignored). */
export type SerializableAsset = PdfAssetMeta | (Omit<ImageAssetMeta, 'derived'> & { derived?: boolean });

export function serialize(state: DocumentState, assets: ReadonlyMap<string, SerializableAsset>): ProjectDoc;
/** What a stored document keeps of an app asset (no binaries). */
export function assetMeta(asset: SerializableAsset): ImageAssetMeta | PdfAssetMeta;
/** Keys of the binaries a document needs: 'src:N', 'bytes:N' and 'preview:aK'. */
export function fileKeys(doc: Pick<ProjectDoc, 'assets'>): string[];
export function counts(doc: Pick<ProjectDoc, 'sheets' | 'items'>): { sheets: number; pieces: number };
export function nextIds(doc: Pick<ProjectDoc, 'items' | 'sheets' | 'assets'>): { item: number; sheet: number; asset: number; src: number };
/** Brings a stored document to the current version (not validated). */
export function migrate(raw: unknown, context?: MigrationContext): ProjectDoc;
/** Fills missing or unreadable optional settings with their defaults and clamps numbers (a migrated document). */
export function repair<T>(doc: T): T;
export function validate(doc: unknown): string[];
/** Stored document → usable document (migrated and validated); throws ProjectError. */
export function deserialize(raw: unknown, context?: MigrationContext): ProjectDoc;
