// Reading a downloaded PDF in Node: page sizes in mm, embedded objects and a
// hash of each page's content (to compare two exports byte for byte).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFRawStream, type PDFDict, type PDFRef } from 'pdf-lib';

export interface PdfPageInfo {
  /** Size in mm, to 0.1 mm. */
  w: number;
  h: number;
  /** How many XObjects (images, embedded PDF pages) the page uses. */
  xobjects: number;
  /** Hash of the page's content streams. */
  content: string;
  /** Hash of each XObject. */
  objects: string[];
  /** The page's raw content streams, decoded when they aren't compressed. */
  streams: Buffer[];
}

export interface PdfInfo {
  title: string | undefined;
  pages: PdfPageInfo[];
}

const mm = (pt: number) => Math.round((pt / 72) * 25.4 * 10) / 10;
const hash = (chunks: readonly (Uint8Array | undefined)[]) => {
  const h = createHash('sha1');
  for (const c of chunks) if (c) h.update(c);
  return h.digest('hex').slice(0, 12);
};

export async function pdfInfo(src: Buffer | string): Promise<PdfInfo> {
  const bytes = typeof src === 'string' ? readFileSync(src) : src;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = doc.getPages().map((pg) => {
    const { width, height } = pg.getSize();
    const xobj = pg.node.Resources()?.lookup(PDFName.of('XObject')) as PDFDict | undefined;
    const names = xobj ? xobj.keys() : [];
    const contents = pg.node.Contents();
    const raw: Uint8Array[] = [];
    if (contents) {
      const refs = 'asArray' in contents ? (contents.asArray() as PDFRef[]) : [contents];
      for (const ref of refs) {
        const stream = doc.context.lookup(ref);
        if (stream instanceof PDFRawStream) raw.push(stream.contents);
      }
    }
    const objects = names.map((n) => {
      const obj = doc.context.lookup(xobj!.get(n));
      return hash([obj instanceof PDFRawStream ? obj.contents : undefined]);
    });
    return { w: mm(width), h: mm(height), xobjects: names.length, content: hash(raw), objects, streams: raw.map((r) => Buffer.from(r)) };
  });
  return { title: doc.getTitle(), pages };
}
