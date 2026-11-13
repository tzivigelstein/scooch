// The undo history and the cut pieces saved with a project
// (src/core/undostore.js): what is stored (each distinct piece once), reading
// it back (pieces shared between steps again), every stored version
// (tests/fixtures/history) and what can't be used (read as nothing).
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CUTS, DOC_VERSION, fileKeys } from '../../src/core/projectdoc.js';
import { nextIdsOf, parseClip, parseHistory, serializeClip, serializeHistory } from '../../src/core/undostore.js';

const DIR = join(import.meta.dirname, '../fixtures/history');
const fixture = (name) => JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8'));

const META = {
  a1: { kind: 'image', name: 'foto.jpg', src: 1, px: [1200, 800], format: 'jpg', dpi: 300, w: 101.6, h: 67.73, derived: true },
  a2: { kind: 'pdf', name: 'plano.pdf', src: 2, page: 2, pages: 3, pageRotation: 0, view: [0, 0, 595.28, 841.89], px: [1697, 2400], w: 210, h: 297 },
};
const metaOf = (key) => META[key];
const hashOf = (fileKey) => `h-${fileKey.replace(/^preview:a(\d)$/, 'preview:$1')}`;

const sheet1 = [{ id: 1 }];
const a = { id: 1, asset: 'a1', sheet: 1, x: 10, y: 10, scale: 50, r: 0, crop: null };
const b = { id: 2, asset: 'a2', sheet: 1, x: 80, y: 10, scale: 30, r: 90, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } };
const settings = { paper: 'A4', landscape: false, margin: 10, gap: 5, cuts: { ...DEFAULT_CUTS }, allowOverlap: false };
const step = (items, selection = []) => ({ sheets: sheet1, items, selection, ...settings });

/** Three steps: both pieces; a moved; b removed (only the history has it). */
function stacks() {
  const moved = { ...a, x: 20 };
  return { undo: [step([a, b]), step([moved, b], [1])], redo: [step([moved])] };
}

describe('the saved undo history', () => {
  test('each distinct piece is stored once, with the assets the steps use and their files’ hashes', () => {
    const saved = serializeHistory('p1', stacks(), metaOf, hashOf);
    expect(saved.items).toHaveLength(3); // a, a moved, b
    expect(saved.undo.map((s) => s.items)).toEqual([
      [0, 1],
      [2, 1],
    ]);
    expect(saved.redo[0].items).toEqual([2]);
    expect(saved.assets).toEqual(META);
    expect(Object.keys(saved.files).sort()).toEqual(fileKeys({ assets: META }).sort());
    expect(saved.hashes).toEqual([...new Set(Object.values(saved.files))].sort());
    expect(saved).toMatchObject({ project: 'p1', v: 1, docVersion: DOC_VERSION });
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  test('read back, the steps are the same and share their pieces again', () => {
    const read = parseHistory(serializeHistory('p1', stacks(), metaOf, hashOf));
    expect(read.undo).toEqual(stacks().undo);
    expect(read.redo).toEqual(stacks().redo);
    expect(read.undo[0].items[1]).toBe(read.undo[1].items[1]);
    expect(read.undo[1].items[0]).toBe(read.redo[0].items[0]);
  });

  test('no steps: nothing to save', () => {
    expect(serializeHistory('p1', { undo: [], redo: [] }, metaOf, hashOf)).toBeNull();
  });

  test('an asset without its hash can’t be saved yet (it throws, nothing half-saved)', () => {
    expect(() => serializeHistory('p1', stacks(), metaOf, (key) => (key === 'src:2' ? undefined : hashOf(key)))).toThrow();
  });

  test('what can’t be used reads as nothing: damaged, another version, another document version, a piece pointing nowhere', () => {
    const saved = serializeHistory('p1', stacks(), metaOf, hashOf);
    expect(parseHistory(null)).toBeNull();
    expect(parseHistory({ ...saved, v: 2 })).toBeNull();
    expect(parseHistory({ ...saved, docVersion: DOC_VERSION - 1 })).toBeNull();
    expect(parseHistory({ ...saved, items: 'x' })).toBeNull();
    expect(parseHistory({ ...saved, undo: [{ ...saved.undo[0], items: [7] }] })).toBeNull();
    expect(parseHistory({ ...saved, items: saved.items.map((item) => ({ ...item, asset: 'a9' })) })).toBeNull();
    expect(parseHistory({ ...saved, files: {} })).toBeNull();
  });

  test('the ids it uses (to continue after them)', () => {
    const read = parseHistory(serializeHistory('p1', stacks(), metaOf, hashOf));
    expect(nextIdsOf(read)).toEqual({ item: 3, sheet: 2, asset: 3, src: 3 });
  });
});

describe('the saved cut pieces', () => {
  test('stored with their assets and hashes, and read back', () => {
    const pieces = [{ asset: 'a2', scale: 30, r: 90, crop: b.crop }];
    const saved = serializeClip(pieces, metaOf, hashOf);
    expect(saved).toMatchObject({ id: 'cut', v: 1, docVersion: DOC_VERSION, assets: { a2: META.a2 } });
    expect(saved.hashes).toEqual(['h-preview:2', 'h-src:2']);
    expect(parseClip(saved)).toEqual({ pieces, assets: { a2: META.a2 }, files: saved.files });
    expect(serializeClip([], metaOf, hashOf)).toBeNull();
  });

  test('what can’t be used reads as nothing', () => {
    const saved = serializeClip([{ asset: 'a1', scale: 50, r: 0, crop: null }], metaOf, hashOf);
    expect(parseClip({ ...saved, pieces: [] })).toBeNull();
    expect(parseClip({ ...saved, pieces: [{ asset: 'a9', scale: 50, r: 0 }] })).toBeNull();
    expect(parseClip({ ...saved, docVersion: 1 })).toBeNull();
  });
});

describe('stored versions', () => {
  const files = readdirSync(DIR).filter((file) => file.endsWith('.json'));

  test('there is a fixture of every stored shape', () => {
    expect(files.sort()).toEqual(['clip-v1.json', 'history-v1.json']);
  });

  test('history version 1 reads as it was written', () => {
    const { record, reads } = fixture('history-v1');
    const read = parseHistory(record);
    expect({ undo: read.undo.length, redo: read.redo.length, items: read.undo.at(-1).items.map((item) => [item.id, item.x]) }).toEqual(reads);
  });

  test('clipboard version 1 reads as it was written', () => {
    const { record, reads } = fixture('clip-v1');
    expect(parseClip(record).pieces).toEqual(reads);
  });

  test('what is written today has exactly the shape of the fixtures', () => {
    const history = fixture('history-v1').record;
    const steps = parseHistory(history);
    expect(serializeHistory(history.project, steps, (key) => history.assets[key], (key) => history.files[key])).toEqual(history);
    const clip = fixture('clip-v1').record;
    const read = parseClip(clip);
    expect(serializeClip(read.pieces, (key) => clip.assets[key], (key) => clip.files[key])).toEqual(clip);
  });
});
