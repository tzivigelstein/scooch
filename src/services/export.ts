// The PDF of the document: one page the size of the paper per sheet, in
// order, skipping empty ones, with its pieces (cropped and rotated) and, if
// the document asks for them, its cut lines (contour ones once every shape
// is traced). pdf-lib builds it in a worker (export.worker.ts), so embedding
// large images never freezes the page; where the worker can't start or
// stops, the page builds it.

import { APP_NAME } from '../config.ts';
import { cutStyle } from '../core/cutmarks.js';
import { pdfKey } from '../core/savings.js';
import { slug } from '../core/util.ts';
import { OUTPUT_TEXTS, outputText } from '../copy/output.ts';
import { getAsset } from '../state/assets.ts';
import { getDocument, type Piece } from '../state/document.ts';
import { itemsOn, sheetSize } from '../state/selectors.ts';
import type { AppAsset } from './assets.ts';
import { shapesReady, sheetCuts } from './contours.ts';
import { paperSlug, writtenPaperName } from './measure.ts';
import { buildPdf, pdfFile, type PdfJob, type PdfReply, type PdfSource } from './pdf.ts';

/** «scooch-a4.pdf»: the same in every language, like the PDF's title (copy/output.ts). */
export const pdfFileName = () => `${slug(APP_NAME, OUTPUT_TEXTS.fallbackName)}-${paperSlug()}.pdf`;

/** What the PDF takes of an asset: what it draws, nothing a worker can't receive (the pdf.js document). */
const pdfSource = (asset: AppAsset): PdfSource =>
  asset.kind === 'pdf'
    ? { kind: 'pdf', src: asset.src, page: asset.page, view: asset.view, pageRotation: asset.pageRotation, bytes: asset.bytes, preview: asset.preview, w: asset.w, h: asset.h }
    : { kind: 'image', src: asset.src, format: asset.format, bytes: asset.bytes, w: asset.w, h: asset.h };

/**
 * The document's PDF, as the file (application/pdf) that is downloaded or
 * printed. `signal` says it is no longer wanted: its worker ends, and it
 * rejects with the signal's reason (built in the page, it just finishes).
 */
export async function makePdf(signal?: AbortSignal): Promise<Blob> {
  const [W, H] = sheetSize();
  const { sheets, cuts } = getDocument();
  const title = outputText(OUTPUT_TEXTS.title, { app: APP_NAME, paper: writtenPaperName() });
  const filled = sheets.map((sheet) => itemsOn(sheet.id)).filter((items) => items.length);
  // The assets as they are now: nothing the document does meanwhile changes this PDF.
  const assets = new Map(filled.flat().map((item) => [item.asset, getAsset(item.asset)]));
  const assetOf = (key: string) => assets.get(key)!;
  const sources = new Map([...assets].map(([key, asset]) => [key, pdfSource(asset)]));
  const piece = (item: Piece) => ({ asset: sources.get(item.asset)!, x: item.x, y: item.y, scale: item.scale, r: item.r, crop: item.crop ?? null });
  if (cuts.mode === 'contour') await shapesReady(filled.flat(), cuts.margin, assetOf);
  signal?.throwIfAborted();
  const pages = filled.map((items) => ({ pieces: items.map(piece), ...sheetCuts(items, cuts, W, H, assetOf) }));
  return build({ width: W, height: H, pages, title, creator: APP_NAME, cutStyle: cutStyle(cuts) }, signal);
}

/**
 * The key of what makePdf draws (see pdfKey): the paper, the cut lines and
 * each printed sheet's pieces, their files told apart by content. The same
 * document gives the same key, however many times it goes out.
 */
export function pdfContentKey() {
  const { sheets, cuts } = getDocument();
  const piece = (item: Piece) => {
    const asset = getAsset(item.asset);
    const file = asset.hashes?.bytes ?? asset.hashes?.src ?? `${asset.src}:${asset.name}`;
    return [file, asset.kind === 'pdf' ? asset.page : 0, asset.w, asset.h, item.x, item.y, item.scale, item.r, item.crop ?? null];
  };
  const pages = sheets
    .map((sheet) => itemsOn(sheet.id))
    .filter((items) => items.length)
    .map((items) => items.map(piece));
  return pdfKey({ size: sheetSize(), cuts, pages });
}

// ---------- Where it is built ----------

/** The export worker, as far as this module uses it (setPdfWorker can stand in for it). */
export type PdfWorker = Pick<Worker, 'onmessage' | 'onerror' | 'onmessageerror' | 'postMessage' | 'terminate'>;

const startWorker = (): PdfWorker => new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });

/** undefined: the real worker, where the browser has workers; null: none, the page builds it. */
let makeWorker: (() => PdfWorker) | null | undefined;

/** Test-only: build in the workers `make` gives (null: in the page; undefined: the real worker again). */
export function setPdfWorker(make: (() => PdfWorker) | null | undefined) {
  makeWorker = make;
}

const buildInPage = async (job: PdfJob) => pdfFile(await buildPdf(job));

function build(job: PdfJob, signal?: AbortSignal): Promise<Blob> {
  const make = makeWorker === undefined ? (typeof Worker === 'function' ? startWorker : null) : makeWorker;
  if (!make) return buildInPage(job);
  let worker: PdfWorker;
  try {
    worker = make();
  } catch (err) {
    console.warn('The PDF worker could not start; building the PDF in the page.', err);
    return buildInPage(job);
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const end = () => {
      done = true;
      worker.terminate();
      signal?.removeEventListener('abort', stop);
    };
    const stop = () => {
      if (done) return;
      end();
      reject(signal!.reason);
    };
    const inPage = (why: unknown) => {
      if (done) return;
      end();
      console.warn('The PDF worker stopped; building the PDF in the page.', why);
      buildInPage(job).then(resolve, reject);
    };
    worker.onmessage = ({ data }: MessageEvent<PdfReply>) => {
      if (done) return;
      end();
      if (data.error === undefined) resolve(data.pdf);
      else reject(new Error(`The PDF could not be built: ${data.error}`));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      // A script or import that didn't load comes without a message (Chromium, WebKit).
      inPage(event.message || 'its script did not load');
    };
    worker.onmessageerror = () => inPage('its reply could not be read');
    signal?.addEventListener('abort', stop, { once: true });
    forWorker(job, () => done)
      .then((sent) => sent && !done && worker.postMessage(sent.message, { transfer: sent.transfer }))
      .catch(inPage);
  });
}

/** Work between two turns of the page while copying for the worker, in ms. */
const SLICE_MS = 8;
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * The job as it goes to the worker, and what goes transferred with it: a copy
 * of each source's bytes, made for the worker. The app's own bytes (in its
 * assets, the undo history and what it stores) are never detached. Copying
 * tens of megabytes takes a while: the page gets a turn every SLICE_MS, and
 * `stopped` says when the copies aren't wanted any more.
 */
async function forWorker(job: PdfJob, stopped: () => boolean) {
  const transfer: ArrayBuffer[] = [];
  const copies = new Map<Uint8Array, Uint8Array>();
  const sent = new Map<PdfSource, PdfSource>();
  let since = performance.now();
  for (const { asset } of job.pages.flatMap((page) => page.pieces)) {
    if (sent.has(asset)) continue;
    let bytes = copies.get(asset.bytes);
    if (!bytes) {
      if (performance.now() - since > SLICE_MS) {
        await nextTask();
        if (stopped()) return null;
        since = performance.now();
      }
      const copy = asset.bytes.slice();
      transfer.push(copy.buffer);
      copies.set(asset.bytes, (bytes = copy));
    }
    sent.set(asset, { ...asset, bytes });
  }
  const pages = job.pages.map((page) => ({ ...page, pieces: page.pieces.map((piece) => ({ ...piece, asset: sent.get(piece.asset)! })) }));
  return { message: { ...job, pages }, transfer };
}
