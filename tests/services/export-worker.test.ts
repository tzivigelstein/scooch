// Where the document's PDF is built (export.ts): in a worker, with the page
// building it only where the worker can't start or stops. The worker here is
// a stand-in that does what export.worker.ts does (pdfReply with pdf-lib) on
// what a real one would receive: a structured clone of the message, with the
// transferred buffers moved out of the page.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as lib from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';
import { DEFAULT_CUTS } from '../../src/core/projectdoc.js';
import type { ImageAsset, PdfAsset } from '../../src/services/assets.ts';
import { makePdf, setPdfWorker, type PdfWorker } from '../../src/services/export.ts';
import { pdfReply, type PdfJob, type PdfReply } from '../../src/services/pdf.ts';
import { addAsset, getAsset } from '../../src/state/assets.ts';
import { rgbPng } from '../support/png.ts';
import { piece, resetState } from '../support/state.ts';

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../e2e/fixtures', name)));
const MM_PER_PT = 25.4 / 72;

/** How the stand-in answers: as the worker does, by failing to run or to load, with a reply that can't be read, or not yet. */
type Answer = 'build' | 'crash' | 'unloaded' | 'unreadable' | 'hold';

class FakeWorker {
  onmessage: ((event: MessageEvent<PdfReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  sent: { message: PdfJob; transfer: Transferable[]; received: PdfJob }[] = [];

  constructor(private readonly answer: Answer) {}

  postMessage(message: PdfJob, { transfer = [] }: StructuredSerializeOptions = {}) {
    const received = structuredClone(message, { transfer });
    this.sent.push({ message, transfer, received });
    void this.run(received);
  }

  private async run(job: PdfJob) {
    await Promise.resolve();
    if (this.answer === 'crash') return this.onerror?.({ message: 'Uncaught RangeError: out of memory', preventDefault() {} } as ErrorEvent);
    if (this.answer === 'unloaded') return this.onerror?.({ message: '', preventDefault() {} } as ErrorEvent);
    if (this.answer === 'unreadable') return this.onmessageerror?.({} as MessageEvent);
    if (this.answer === 'hold') return;
    const reply = await pdfReply(lib, job);
    if (!this.terminated) this.onmessage?.({ data: structuredClone(reply) } as MessageEvent<PdfReply>);
  }

  terminate() {
    this.terminated = true;
  }
}

let workers: FakeWorker[] = [];
const useWorkers = (answer: Answer) => setPdfWorker(() => (workers.push(new FakeWorker(answer)), workers.at(-1) as unknown as PdfWorker));

const bytesOf = async (pdf: Blob) => new Uint8Array(await pdf.arrayBuffer());

/** The PDF built in the page (no worker), to compare with. */
async function inThePage() {
  setPdfWorker(null);
  return bytesOf(await makePdf());
}

/**
 * Two sheets with every kind of source: a PNG, a JPEG, both pages of one PDF
 * (one stays vector, the other is cropped and turned), an encrypted PDF page
 * (pdf-lib can't open it: its preview goes in) and a PNG whose bytes are a
 * view into a larger buffer. Corner marks on. The PDF assets carry a pdf.js
 * document, which can't be cloned: it must not go to the worker.
 */
function everyKindOfSource() {
  const proxy = { getPage: () => Promise.resolve() } as unknown as PdfAsset['pdf'];
  const image = (name: string, src: number, bytes: Uint8Array, format: 'png' | 'jpg'): ImageAsset => ({
    kind: 'image',
    name,
    src,
    px: [600, 600],
    w: 40,
    h: 40,
    bytes,
    preview: new Blob(),
    url: 'blob:test',
    format,
    dpi: 300,
    derived: false,
  });
  const pdfPage = (name: string, src: number, bytes: Uint8Array, page: number, preview = new Blob()): PdfAsset => ({
    kind: 'pdf',
    name,
    src,
    page,
    pages: 2,
    pageRotation: 0,
    view: [0, 0, 200, 200],
    px: [400, 400],
    w: 200 * MM_PER_PT,
    h: 200 * MM_PER_PT,
    bytes,
    preview,
    url: 'blob:test',
    pdf: proxy,
  });
  const padded = new Uint8Array(rgbPng(8, 8).byteLength + 64);
  padded.set(rgbPng(8, 8), 32);
  const twopage = fixture('twopage.pdf');
  const keys = [
    addAsset(image('gray.png', 1, rgbPng(30, 20), 'png')),
    addAsset(image('small.jpg', 2, fixture('small.jpg'), 'jpg')),
    addAsset(pdfPage('twopage.pdf', 3, twopage, 1)),
    addAsset(pdfPage('twopage.pdf', 3, twopage, 2)),
    addAsset(pdfPage('password.pdf', 4, fixture('password.pdf'), 1, new Blob([fixture('tile000.png')], { type: 'image/png' }))),
    addAsset(image('view.png', 5, padded.subarray(32, 32 + rgbPng(8, 8).byteLength), 'png')),
  ];
  resetState({
    sheets: [{ id: 1 }, { id: 2 }],
    items: [
      piece(1, keys[0], 10, 10),
      piece(2, keys[1], 60, 10, { r: 90 }),
      piece(3, keys[2], 10, 60, { scale: 50 }),
      piece(4, keys[3], 10, 10, { sheet: 2, r: 270, crop: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 } }),
      piece(5, keys[4], 120, 10, { sheet: 2, scale: 40 }),
      piece(6, keys[5], 120, 120, { sheet: 2 }),
      piece(7, keys[0], 60, 60, { sheet: 2 }),
    ],
    cuts: { ...DEFAULT_CUTS, mode: 'corners', margin: 2 },
  });
  return keys;
}

let warn: MockInstance<typeof console.warn>;
let keys: string[];

beforeEach(() => {
  workers = [];
  // pdf-lib dates the PDF: the same clock for every build compared.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-17T12:00:00Z') });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  keys = everyKindOfSource();
});

afterEach(() => {
  setPdfWorker(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the PDF built in the worker', () => {
  test('is the PDF the page builds, byte for byte, as an application/pdf file; the worker ends after its reply', async () => {
    const page = await inThePage();
    useWorkers('build');
    const pdf = await makePdf();
    expect(pdf.type).toBe('application/pdf');
    expect(await bytesOf(pdf)).toEqual(page);
    expect(workers).toHaveLength(1);
    expect(workers[0].sent).toHaveLength(1);
    expect(workers[0].terminated).toBe(true);
    // The encrypted page fell back to its preview in both: the same warning each time.
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual(Array(2).fill('The page could not be embedded as a vector; using its image.'));
  });

  test('gets a copy of each source’s bytes, transferred, and the app’s own bytes stay as they were', async () => {
    const bytes = keys.map((key) => getAsset(key).bytes);
    const kept = bytes.map((b) => b.slice());
    useWorkers('build');
    await makePdf();
    const [{ transfer, received }] = workers[0].sent;
    // One copy per file: both pages of the PDF share theirs.
    expect(transfer).toHaveLength(5);
    expect(transfer.every((buffer) => (buffer as ArrayBuffer).byteLength === 0)).toBe(true);
    expect(transfer.some((buffer) => bytes.some((b) => b.buffer === buffer))).toBe(false);
    bytes.forEach((b, i) => expect(b).toEqual(kept[i]));
    // Only what the PDF draws went: no pdf.js document.
    const assets = received.pages.flatMap((page) => page.pieces.map((p) => p.asset));
    expect(assets.some((asset) => 'pdf' in asset || 'name' in asset)).toBe(false);
    // The view went as just its bytes, whole in a buffer of its own.
    const view = assets.find((asset) => asset.kind === 'image' && asset.bytes.byteLength === bytes[5].byteLength)!;
    expect([view.bytes.byteOffset, view.bytes.buffer.byteLength]).toEqual([0, bytes[5].byteLength]);
  });

  test('a second PDF gets a worker of its own', async () => {
    useWorkers('build');
    await makePdf();
    await makePdf();
    expect(workers.map((w) => [w.sent.length, w.terminated])).toEqual([
      [1, true],
      [1, true],
    ]);
  });
});

describe('a PDF no longer wanted', () => {
  test('ends its worker and rejects with the reason, building nothing in the page', async () => {
    useWorkers('hold');
    const unwanted = new AbortController();
    const job = makePdf(unwanted.signal);
    await vi.waitFor(() => expect(workers[0]?.sent).toHaveLength(1));
    unwanted.abort();
    await expect(job).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].terminated).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('where the worker can’t build it', () => {
  test('a worker that can’t start: the page builds the same PDF, and says why in the console', async () => {
    const page = await inThePage();
    warn.mockClear();
    setPdfWorker(() => {
      throw new DOMException('Workers are not allowed here', 'SecurityError');
    });
    expect(await bytesOf(await makePdf())).toEqual(page);
    expect(String(warn.mock.calls[0][0])).toBe('The PDF worker could not start; building the PDF in the page.');
  });

  test.each<[Answer, string]>([
    ['crash', 'Uncaught RangeError: out of memory'],
    ['unloaded', 'its script did not load'],
    ['unreadable', 'its reply could not be read'],
  ])('a worker that stops (%s): the page builds the same PDF, the worker is ended, and the console says why', async (answer, why) => {
    const page = await inThePage();
    warn.mockClear();
    useWorkers(answer);
    expect(await bytesOf(await makePdf())).toEqual(page);
    expect(workers[0].terminated).toBe(true);
    expect(warn.mock.calls[0]).toEqual(['The PDF worker stopped; building the PDF in the page.', why]);
  });

  test('pdf-lib failing in the worker fails the PDF, without building it again in the page', async () => {
    const broken = addAsset({ ...(getAsset(keys[0]) as ImageAsset), bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) });
    resetState({ items: [piece(1, broken, 10, 10)] });
    warn.mockClear();
    useWorkers('build');
    await expect(makePdf()).rejects.toThrow(/^The PDF could not be built: /);
    expect(workers[0].terminated).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
