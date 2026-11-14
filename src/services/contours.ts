// Contour cut lines («Silueta») for the pieces. Each image with transparency
// is traced once per crop and margin (core/contour.traceShape), off the main
// thread in a worker, and the result is kept: moving, rotating or copying a
// piece reuses it, and so does resizing it while the margin is 0. Until a
// shape is ready, the piece shows the last one traced for the same crop, or no
// line. sheetCuts gives a sheet's lines the same way to the screen and to the
// PDF, which waits for every shape first (shapesReady).
//
// Shapes are traced in units of the visible part's longer side, so one trace
// serves every size of the piece; the margin, in those units, is rounded to
// MARGIN_STEP so resizing with a margin traces again only every so often.

import { contourCuts, placeLoops, traceShape, type AlphaMask, type CutPath } from '../core/contour.js';
import { pieceSize } from '../core/crop.js';
import { cutLines, type CutLine } from '../core/cutmarks.js';
import type { Box, Crop, Cuts } from '../core/types.ts';
import type { Piece } from '../state/document.ts';
import { getAsset } from '../state/assets.ts';
import type { AppAsset } from './assets.ts';
import { decodeAlpha } from './alpha.ts';

type Loops = Float64Array[];

/** What is traced: an image's preview, its crop, the visible part's size and the margin (in units of its longer side). */
export interface TraceRequest {
  source: Blob;
  crop: Crop | null;
  w: number;
  h: number;
  margin: number;
}

/** Traces one request: the loops, or null when the rectangle applies. */
export type Tracer = (request: TraceRequest) => Promise<Loops | null>;

/** To the worker: a request, with an id of its source (the same Blob keeps the same id). */
export interface TraceMessage extends TraceRequest {
  id: number;
  sourceId: number;
}

/** From the worker; `unsupported`: it can't decode images (no OffscreenCanvas), trace in the page. */
export type TraceReply = { id: number; loops: Loops | null; unsupported?: undefined } | { id: number; unsupported: true; loops?: undefined };

const MARGIN_STEP = 1 / 2048;
/** Traced shapes kept besides the ones in use, and stand-ins kept. */
const KEEP = 200;

// ---------- Tracing ----------

const sourceIds = new WeakMap<Blob, number>();
let lastSourceId = 0;
const sourceId = (blob: Blob) => {
  let id = sourceIds.get(blob);
  if (!id) sourceIds.set(blob, (id = ++lastSourceId));
  return id;
};

const pageMasks = new WeakMap<Blob, Promise<AlphaMask>>();

/** Traces in the page (where there is no worker): the same work, on the main thread. */
async function traceInPage(request: TraceRequest): Promise<Loops | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let mask = pageMasks.get(request.source);
  if (!mask) pageMasks.set(request.source, (mask = decodeAlpha(request.source)));
  return traceShape(await mask, request);
}

let worker: Worker | null | undefined;
let lastMessage = 0;
const waiting = new Map<number, { request: TraceRequest; done: (loops: Loops | null) => void }>();

// Without the worker, what it had pending is traced in the page.
function dropWorker() {
  worker?.terminate();
  worker = null;
  for (const { request, done } of waiting.values()) traceInPage(request).then(done, () => done(null));
  waiting.clear();
}

function startWorker(): Worker | null {
  try {
    const started = new Worker(new URL('./contour.worker.ts', import.meta.url), { type: 'module' });
    started.onmessage = ({ data }: MessageEvent<TraceReply>) => {
      const job = waiting.get(data.id);
      if (data.unsupported) return dropWorker();
      waiting.delete(data.id);
      job?.done(data.loops);
    };
    started.onerror = (event) => {
      event.preventDefault();
      console.warn('The contour worker stopped; tracing in the page.', event.message);
      dropWorker();
    };
    return started;
  } catch {
    return null;
  }
}

const traceInWorker: Tracer = (request) => {
  if (worker === undefined) worker = typeof Worker === 'function' ? startWorker() : null;
  if (!worker) return traceInPage(request);
  const id = ++lastMessage;
  const message: TraceMessage = { ...request, id, sourceId: sourceId(request.source) };
  return new Promise((done) => {
    waiting.set(id, { request, done });
    worker!.postMessage(message);
  });
};

let tracer: Tracer = traceInWorker;

/** Test-only: trace with `fake` (null: the worker again); forgets every shape. */
export function setTracer(fake: Tracer | null) {
  tracer = fake ?? traceInWorker;
  generation++;
  tracing = false;
  for (const entry of entries.values()) entry.finish();
  entries.clear();
  latest.clear();
  scopes.clear();
  queue.length = 0;
  notify();
}

// ---------- The shapes, by what they depend on ----------

interface Entry {
  key: string;
  base: string;
  /** Until it is traced (then dropped: it holds the image's preview). */
  request: TraceRequest | null;
  state: 'queued' | 'tracing' | 'done';
  loops: Loops | null;
  done: Promise<void>;
  finish: () => void;
  /** The slots (a scope and a piece) that show it. */
  wanted: Set<string>;
}

const entries = new Map<string, Entry>();
/** The last shape traced for each source and crop (by `base`), shown until the exact one is ready. */
const latest = new Map<string, Loops | null>();
/** Which entry each slot of each scope wants. */
const scopes = new Map<string, Map<string, string>>();
const queue: string[] = [];
let tracing = false;
/** Changes when everything is forgotten (setTracer): a trace still running then is ignored. */
let generation = 0;

const unqueue = (key: string) => {
  const at = queue.indexOf(key);
  if (at >= 0) queue.splice(at, 1);
};

let version = 0;
const listeners = new Set<() => void>();
function notify() {
  version++;
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: a number that changes whenever a shape is ready. */
export const shapesVersion = () => version;
export function subscribeShapes(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Only PNG images can have transparency (WebP and others are stored as PNG); JPEG and PDF pages keep the rectangle. */
const traceable = (asset: AppAsset) => asset.kind === 'image' && asset.format === 'png';

const cropKey = (crop: Crop | null) => (crop ? `${crop.x},${crop.y},${crop.w},${crop.h}` : 'all');

/** What a piece's shape depends on, or null when its line is the rectangle. */
function need(item: Piece, asset: AppAsset, margin: number) {
  if (!traceable(asset)) return null;
  const { uw, uh } = pieceSize(asset, item);
  const side = Math.max(uw, uh);
  if (!(side > 0)) return null;
  const crop = item.crop ?? null;
  const ratio = Math.round(margin / side / MARGIN_STEP) * MARGIN_STEP;
  const base = `${sourceId(asset.preview)}|${cropKey(crop)}`;
  return { key: `${base}|${ratio}`, base, uw, uh, side, request: { source: asset.preview, crop, w: uw / side, h: uh / side, margin: ratio } };
}

function pump() {
  if (tracing) return;
  const entry = entries.get(queue.pop() ?? '');
  if (!entry) {
    if (queue.length) pump();
    return;
  }
  tracing = true;
  entry.state = 'tracing';
  const request = entry.request!;
  const started = generation;
  Promise.resolve()
    .then(() => tracer(request))
    .catch((err) => {
      console.warn('The shape of an image could not be traced; its cut line is the rectangle.', err);
      return null;
    })
    .then((loops) => {
      if (started !== generation) return;
      tracing = false;
      entry.loops = loops;
      entry.state = 'done';
      entry.request = null;
      latest.delete(entry.base);
      latest.set(entry.base, loops);
      entry.finish();
      forget();
      notify();
      pump();
    });
}

// Drops the oldest finished shapes nobody shows, and the oldest stand-ins, beyond KEEP.
function forget() {
  let extra = entries.size - KEEP;
  for (const [key, entry] of entries) {
    if (extra <= 0) break;
    if (entry.state === 'done' && !entry.wanted.size) {
      entries.delete(key);
      extra--;
    }
  }
  for (const base of latest.keys()) {
    if (latest.size <= KEEP) break;
    latest.delete(base);
  }
}

function release(slot: string, key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  entry.wanted.delete(slot);
  if (entry.state === 'queued' && !entry.wanted.size) {
    entries.delete(key);
    unqueue(key);
    entry.finish();
  }
}

function want(slot: string, wanted: NonNullable<ReturnType<typeof need>>) {
  let entry = entries.get(wanted.key);
  if (!entry) {
    let finish!: () => void;
    const done = new Promise<void>((resolve) => (finish = resolve));
    entry = { key: wanted.key, base: wanted.base, request: wanted.request, state: 'queued', loops: null, done, finish, wanted: new Set() };
    entries.set(wanted.key, entry);
    queue.push(wanted.key);
  } else if (entry.state === 'queued') {
    // Asked for again: the next one traced.
    unqueue(wanted.key);
    queue.push(wanted.key);
  }
  entry.wanted.add(slot);
  return entry;
}

/**
 * The pieces `scope` (a sheet on screen, an export) shows now: their shapes
 * are traced, newest first, and what the scope no longer shows is dropped
 * from the queue. An empty list releases the scope.
 */
export function showShapes(scope: string, items: readonly Piece[], margin: number, assetOf: (key: string) => AppAsset = getAsset) {
  const before = scopes.get(scope) ?? new Map<string, string>();
  const now = new Map<string, string>();
  const entriesNow: Entry[] = [];
  for (const item of items) {
    const wanted = need(item, assetOf(item.asset), margin);
    if (!wanted) continue;
    const slot = `${scope}#${item.id}`;
    now.set(slot, wanted.key);
    if (before.get(slot) !== wanted.key) entriesNow.push(want(slot, wanted));
    else entriesNow.push(entries.get(wanted.key)!);
  }
  for (const [slot, key] of before) if (now.get(slot) !== key) release(slot, key);
  if (now.size) scopes.set(scope, now);
  else scopes.delete(scope);
  pump();
  return entriesNow;
}

let exports = 0;

/** Waits until the shapes of `items` are traced (for the PDF). */
export async function shapesReady(items: readonly Piece[], margin: number, assetOf: (key: string) => AppAsset = getAsset) {
  const scope = `pdf:${++exports}`;
  try {
    await Promise.all(showShapes(scope, items, margin, assetOf).map((entry) => entry.done));
  } finally {
    showShapes(scope, [], margin, assetOf);
  }
}

/**
 * A piece's contour on the sheet (placed loops, mm): null for the rectangle,
 * undefined while nothing is traced yet for its image and crop. Until its
 * exact shape is ready, the last one traced for the same crop stands in.
 */
export function shapeOf(item: Piece, margin: number, assetOf: (key: string) => AppAsset = getAsset): Loops | null | undefined {
  const wanted = need(item, assetOf(item.asset), margin);
  if (!wanted) return null;
  const entry = entries.get(wanted.key);
  const loops = entry?.state === 'done' ? entry.loops : latest.get(wanted.base);
  if (loops === undefined) return undefined;
  return loops && placeLoops(loops, { x: item.x, y: item.y, r: item.r, uw: wanted.uw, uh: wanted.uh, k: wanted.side });
}

/**
 * A sheet's cut lines (cutmarks.cutLines, contour.contourCuts), the same on
 * screen and in the PDF: segments and, in contour mode, the shapes' paths.
 */
export function sheetCuts(items: readonly Piece[], cuts: Readonly<Cuts>, W: number, H: number, assetOf: (key: string) => AppAsset = getAsset): { lines: CutLine[]; paths: CutPath[] } {
  const bounds = { x: 0, y: 0, w: W, h: H };
  const boxOf = (item: Piece): Box => {
    const { w, h } = pieceSize(assetOf(item.asset), item);
    return { id: item.id, sheet: item.sheet, x: item.x, y: item.y, w, h };
  };
  if (cuts.mode !== 'contour') return { lines: cutLines(items.map(boxOf), { ...cuts, bounds }), paths: [] };
  return contourCuts(
    items.map((item) => ({ box: boxOf(item), shape: shapeOf(item, cuts.margin, assetOf) })),
    { margin: cuts.margin, bounds }
  );
}
