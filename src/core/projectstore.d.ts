import type { MigrationContext } from './projectdoc';
import type { ListedProject, ProjectDoc, ProjectRecord, ProjectStorage } from './types';

export const NAME_MAX: number;

export function newProjectId(now?: number, random?: () => number): string;
export function cleanName(name: unknown, fallback: string): string;
export function emptyDoc(settings?: Partial<Pick<ProjectDoc, 'paper' | 'landscape' | 'margin' | 'gap' | 'rotate' | 'allowOverlap' | 'cuts'>>): ProjectDoc;

export function createProject(
  storage: ProjectStorage,
  project: { id: string; name: string; now: number; doc?: ProjectDoc; thumb?: Blob | null }
): Promise<ProjectRecord>;

export function saveProject(
  storage: ProjectStorage,
  save: { record: ProjectRecord; doc: ProjectDoc; blobs: ReadonlyMap<string, Blob>; stored?: ReadonlySet<string>; thumb?: Blob | null; now: number }
): Promise<{ record: ProjectRecord; stored: Set<string> }>;

export function loadProject(storage: ProjectStorage, id: string, context?: MigrationContext): Promise<{ record: ProjectRecord; doc: ProjectDoc; files: Map<string, Blob> }>;
export function duplicateProject(storage: ProjectStorage, id: string, copy: { newId: string; name: string; now: number }): Promise<ProjectRecord>;
export function renameProject(storage: ProjectStorage, id: string, name: string, now: number): Promise<ProjectRecord>;
export function deleteProject(storage: ProjectStorage, id: string): Promise<void>;
/** Why a record's document can't be opened: null, 'corrupt' or 'newer' (saved by a newer version of the app). */
export function openProblem(record: ProjectRecord): 'corrupt' | 'newer' | null;
export function isDamaged(record: ProjectRecord): boolean;
/** Every project, newest first, with `damaged` and `newer`. */
export function listProjects(storage: ProjectStorage): Promise<ListedProject[]>;
/** Which project to open on start: the last one if it can be opened, else the newest (or null). */
export function pickProject(list: readonly ListedProject[], lastId: string | null): string | null;

/** Last-moment copy of the open document, written synchronously when the tab goes away. */
export type Journal =
  | { v: 2; id: string; base: number; name: unknown; doc: unknown }
  /** Version 1 (one key for every tab): used when `at` is later than the save, by the clock. */
  | { v?: undefined; id: string; at: number; name: unknown; doc: unknown };

export function recoverJournal(record: ProjectRecord, files: ReadonlyMap<string, Blob>, journal: Journal | null, context?: MigrationContext): { doc: ProjectDoc; name: string } | null;
export function memoryStorage(options?: { fail?: (op: string) => Error | null | undefined }): ProjectStorage;
