// Saved projects for the tests of the projects service: documents and files in
// a storage in memory (src/core/projectstore.js memoryStorage).
import { createProject } from '../../src/core/projectstore.js';
import type { ProjectDoc, ProjectStorage } from '../../src/core/types.ts';

/** A Blob that can be read back (jsdom's has no arrayBuffer()). */
export const readableBlob = (text: string) => Object.assign(new Blob([text]), { arrayBuffer: async () => new TextEncoder().encode(text).buffer });

/** The document of a project with one image piece at (`x`, 20) on each of `sheets` sheets. */
export function oneImageDoc(name: string, x: number, sheets = 1): ProjectDoc {
  return {
    version: 5,
    paper: 'A4',
    landscape: false,
    margin: 10,
    gap: 5,
    rotate: true,
    allowOverlap: false,
    cuts: { mode: 'none', length: 4, offset: 1, weight: 'thin', color: '#000000', dash: 'solid', margin: 0 },
    sheets: Array.from({ length: sheets }, (_, i) => ({ id: i + 1 })),
    items: Array.from({ length: sheets }, (_, i) => ({ id: i + 1, asset: 'a1', sheet: i + 1, x, y: 20, scale: 100, r: 0 as const, crop: null })),
    assets: { a1: { kind: 'image', name: `${name}.png`, src: 1, px: [472, 354], format: 'png', dpi: 300, w: 39.96, h: 29.97, derived: false } },
  };
}

/** A stored file whose hash is its text (tests don't hash). */
export const textFile = (text: string) => ({ blob: readableBlob(text), hash: `h-${text}` });

/** A project in storage with one image piece at `x` (on each of `sheets` sheets), and its files. */
export async function storedProject(storage: ProjectStorage, id: string, name: string, x: number, now: number, { sheets = 1 } = {}) {
  const record = await createProject(storage, { id, name, now, doc: oneImageDoc(name, x, sheets) });
  await storage.write(record, { put: new Map([['src:1', textFile('png')], ['preview:a1', textFile('preview')]]) });
  return record;
}
