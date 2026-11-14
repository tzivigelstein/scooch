// Traces contour cut lines for services/contours.ts, so neither decoding an
// image nor tracing it blocks the page. It keeps the alpha of the last few
// images it decoded: a new crop or margin of the same image only traces.

import { traceShape, type AlphaMask } from '../core/contour.js';
import { decodeAlpha } from './alpha.ts';
import type { TraceMessage, TraceReply } from './contours.ts';

const KEEP = 6;
const masks = new Map<number, Promise<AlphaMask>>();

function maskOf(sourceId: number, source: Blob) {
  let mask = masks.get(sourceId);
  if (mask) masks.delete(sourceId);
  else mask = decodeAlpha(source);
  masks.set(sourceId, mask);
  if (masks.size > KEEP) masks.delete(masks.keys().next().value!);
  return mask;
}

const reply = (message: TraceReply, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

self.onmessage = async ({ data }: MessageEvent<TraceMessage>) => {
  const { id, sourceId, source, crop, w, h, margin } = data;
  if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') return reply({ id, unsupported: true });
  try {
    const loops = traceShape(await maskOf(sourceId, source), { crop, w, h, margin });
    reply({ id, loops }, loops ? loops.map((loop) => loop.buffer) : []);
  } catch (err) {
    masks.delete(sourceId);
    console.warn('The shape of an image could not be traced; its cut line is the rectangle.', err);
    reply({ id, loops: null });
  }
};
