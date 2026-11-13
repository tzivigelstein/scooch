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

export type CutMode = 'none' | 'corners' | 'outline';
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
  modified: number;
  version: number;
  doc: ProjectDoc;
  counts: { sheets: number; pieces: number };
  thumb: Blob | null;
}

/**
 * A project as listed: `damaged` when its document cannot be interpreted,
 * `newer` when a newer version of the app saved it (left as it is).
 */
export interface ListedProject extends ProjectRecord {
  damaged: boolean;
  newer?: boolean;
}

/** Minimal storage behind projectstore.js (IndexedDB in the browser, memory in tests). */
export interface ProjectStorage {
  list(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | null>;
  files(id: string): Promise<Map<string, Blob>>;
  write(record: ProjectRecord, changes?: { put?: Map<string, Blob>; remove?: string[] }): Promise<void>;
  remove(id: string): Promise<void>;
}
