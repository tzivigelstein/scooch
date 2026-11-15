// Shared shapes of the pure modules in src/core (all lengths in mm unless noted).

/** Identifier of a rectangle passed to the geometry modules (pieces use numbers; tests also strings). */
export type RectId = number | string;

/** Axis-aligned rectangle with the origin at the top left and y growing downwards. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Width and height only (what the packers place). */
export interface Size {
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface IdRect<I extends RectId = number> extends Rect {
  id: I;
}

export interface IdSize<I extends RectId = number> extends Size {
  id: I;
}

/** A piece's rectangle on its sheet, already rotated and cropped. */
export interface Box<I extends RectId = number> extends IdRect<I> {
  sheet: number;
}

/** Normalized crop (0–1) of the original, unrotated image. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clockwise rotation in degrees. */
export type Rotation = 0 | 90 | 180 | 270;

/** Physical size of an asset at 100 % (what crop.js needs). */
export interface AssetSize {
  w: number;
  h: number;
}

/** A piece on a sheet: x/y relative to its sheet, in stacking order within the document. */
export interface Item {
  id: number;
  asset: string;
  sheet: number;
  x: number;
  y: number;
  scale: number;
  r: Rotation;
  crop: Crop | null;
}

export interface Sheet {
  id: number;
}

export type PaperGroup = 'iso-a' | 'iso-b' | 'us' | 'photo';

export type PaperId =
  | 'A0'
  | 'A1'
  | 'A2'
  | 'A3'
  | 'A4'
  | 'A5'
  | 'A6'
  | 'B4'
  | 'B5'
  | 'letter'
  | 'legal'
  | 'folio'
  | 'tabloid'
  | 'photo-9x13'
  | 'photo-10x15'
  | 'photo-13x18'
  | 'photo-15x20'
  | 'photo-20x30';

export interface CustomPaper {
  custom: true;
  w: number;
  h: number;
}

/** A preset id or a custom size (stored portrait; the orientation goes apart). */
export type Paper = PaperId | CustomPaper;

/** 'contour' (since document version 6): around the opaque shape of an image with transparency. */
export type CutMode = 'none' | 'corners' | 'outline' | 'contour';
export type CutWeight = 'thin' | 'medium' | 'thick';
export type CutDash = 'solid' | 'dotted';

/**
 * Cut lines: the mode, the marks' length and offset (mm), the cut margin
 * (mm between the image and its cut line; negative cuts inside the image) and
 * the stroke (weight, #rrggbb color, dash).
 */
export interface Cuts {
  mode: CutMode;
  length: number;
  offset: number;
  margin: number;
  weight: CutWeight;
  color: string;
  dash: CutDash;
}

export interface ImageAssetMeta {
  kind: 'image';
  name: string;
  src: number;
  px: [number, number];
  format: 'jpg' | 'png';
  dpi: number;
  w: number;
  h: number;
  derived: boolean;
}

export interface PdfAssetMeta {
  kind: 'pdf';
  name: string;
  src: number;
  page: number;
  pages: number;
  pageRotation: number;
  view: [number, number, number, number];
  px: [number, number];
  w: number;
  h: number;
}

/** What a saved document keeps of an asset (the binaries go apart, see projectdoc.fileKeys). */
export type AssetMeta = ImageAssetMeta | PdfAssetMeta;

/** The document of a saved project (current version). */
export interface ProjectDoc {
  version: number;
  paper: Paper;
  landscape: boolean;
  margin: number;
  gap: number;
  rotate: boolean;
  allowOverlap: boolean;
  cuts: Cuts;
  sheets: Sheet[];
  items: Item[];
  assets: Record<string, AssetMeta>;
}

/** A saved project. `doc` is stored as is and validated when opened. */
export interface ProjectRecord {
  id: string;
  name: string;
  created: number;
  /** When its document was last saved. */
  modified: number;
  /** When it was last opened («Proyectos» is sorted by it); records from before layout 2 may not have it. */
  opened?: number;
  version: number;
  doc: ProjectDoc;
  counts: { sheets: number; pieces: number };
  thumb: Blob | null;
}

/**
 * A stored binary and its content's hash: SHA-256 in hex or, where the
 * browser can't hash (an insecure context), a unique id starting with «u».
 * Equal hashes are equal content, stored once.
 */
export interface StoredFile {
  blob: Blob;
  hash: string;
}

/** What a saved undo history or clipboard references: its assets and their files (core/undostore.js). */
export interface StoredAssets {
  /** The assets, by key, as a document keeps them. */
  assets: Record<string, AssetMeta>;
  /** projectdoc.fileKeys of those assets → hash. */
  files: Record<string, string>;
  /** Every hash in `files` (indexed: what keeps those binaries stored). */
  hashes: string[];
}

/** A project's undo history as stored (core/undostore.js). */
export interface StoredHistory extends StoredAssets {
  project: string;
  v: number;
  [field: string]: unknown;
}

/** The pieces cut and not pasted yet, as stored (core/undostore.js). */
export interface StoredClip extends StoredAssets {
  id: 'cut';
  v: number;
  [field: string]: unknown;
}

/**
 * A project as listed: `damaged` when its document cannot be interpreted,
 * `newer` when a newer version of the app saved it (left as it is).
 */
export interface ListedProject extends ProjectRecord {
  damaged: boolean;
  newer?: boolean;
}

/** What a write changes besides the record (see ProjectStorage.write). */
export interface WriteChanges {
  /** Files to reference by key; each blob is stored unless its hash already is. */
  put?: ReadonlyMap<string, StoredFile>;
  /** Keys that stop being referenced (their binaries go when nothing else references them). */
  remove?: readonly string[];
  /** The project's undo history (null: none). Left as it is when undefined. */
  history?: StoredHistory | null;
  /** Binaries the history references, by hash: stored unless already. */
  blobs?: ReadonlyMap<string, Blob>;
  /** The record is new: write it even though it isn't stored yet (otherwise a write to a missing project fails with 'missing'). */
  create?: boolean;
}

/**
 * The storage behind projectstore.js (IndexedDB in the browser, memory in
 * tests). Binaries are stored once per content (by hash) and referenced by
 * the projects' files, the saved undo histories and the saved clipboard; a
 * binary is deleted only by collectGarbage, when nothing references it.
 * Writes are atomic: a reference and the binary it needs are written together.
 */
export interface ProjectStorage {
  list(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | null>;
  /** The project's files by key (projectdoc.fileKeys). */
  files(id: string): Promise<Map<string, StoredFile>>;
  /** Writes the record and `changes` in one operation (all or nothing). */
  write(record: ProjectRecord, changes?: WriteChanges): Promise<void>;
  /** Changes some fields of a stored record (read and written in one operation); null if it isn't there. */
  update(id: string, patch: Partial<Pick<ProjectRecord, 'name' | 'opened'>>): Promise<ProjectRecord | null>;
  /**
   * Stores a copy of project `id`, its record made by `make` from the stored
   * one (with a new id), with the same files: references, no binary is
   * copied. Read and written in one operation. Returns the copy's record.
   */
  copy(id: string, make: (source: ProjectRecord) => ProjectRecord): Promise<ProjectRecord>;
  /** The record, its file references and its undo history. */
  remove(id: string): Promise<void>;
  history(id: string): Promise<StoredHistory | null>;
  clip(): Promise<StoredClip | null>;
  /** Stores the clipboard (null: none) and, unless already stored, the binaries it references. */
  setClip(clip: StoredClip | null, blobs?: ReadonlyMap<string, Blob>): Promise<void>;
  /** Stored binaries by hash (the ones there are). */
  blobs(hashes: readonly string[]): Promise<Map<string, Blob>>;
  /** Deletes the binaries nothing references. Returns how many. */
  collectGarbage(): Promise<number>;
}
