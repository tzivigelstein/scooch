// Builds the document's PDF for services/export.ts, off the main thread:
// embedding images (decoding and compressing PNGs above all) takes seconds in
// a large project, and the page goes on meanwhile. One PDF per worker.
// pdf-lib is imported here, not loaded later: a worker that can't get it
// fails to start, and the page builds the PDF instead.

import * as lib from 'pdf-lib';
import { pdfReply, type PdfJob } from './pdf.ts';

self.onmessage = async ({ data }: MessageEvent<PdfJob>) => self.postMessage(await pdfReply(lib, data));
