// Exportación: una página de PDF del tamaño de la hoja por cada hoja con
// piezas, en orden, armada con pdf-lib. Dónde va cada pieza (recortada y
// girada) lo calcula crop.drawParams; sin recorte, la cuenta y los operadores
// son los mismos de siempre.

import { drawParams } from './core/crop.js';

const PT_PER_MM = 72 / 25.4;
/** Líneas de corte: finas (pt) y gris oscuro neutro. */
export const CUT_LINE = Object.freeze({ thickness: 0.25, gray: 0.2 });

let pdfLibPromise = null;

// pdf-lib va en un archivo aparte: se descarga recién al exportar o imprimir.

function loadPdfLib() {
  pdfLibPromise ??= import('pdf-lib').catch((err) => {
    pdfLibPromise = null;
    throw err;
  });
  return pdfLibPromise;
}

/**
 * Arma el PDF y devuelve sus bytes. `pages`: [{pieces, lines}] por página;
 * cada pieza {asset, x, y, scale, r, crop} (x/y en mm desde la esquina
 * superior izquierda de la hoja; crop como en crop.js) y cada línea de corte
 * {x1, y1, x2, y2} en mm (cutmarks.cutLines). Con recorte, la pieza se dibuja
 * entera con un trazado de recorte (las páginas de PDF siguen siendo vector).
 * Cada origen (imagen o página de PDF) se embebe una sola vez aunque aparezca
 * en varias páginas.
 */
export async function buildPdf({ width, height, pages, title, creator = title }) {
  const lib = await loadPdfLib();
  const { PDFDocument, degrees, rgb } = lib;
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator(creator);
  const embed = embedder(doc, PDFDocument);
  const pt = (mm) => mm * PT_PER_MM;

  for (const { pieces, lines = [] } of pages) {
    const page = doc.addPage([pt(width), pt(height)]);
    for (const piece of pieces) {
      const target = await embed(piece.asset);
      const p = drawParams(piece, piece.asset, height);
      const options = { x: p.x, y: p.y, width: p.width, height: p.height, rotate: degrees(p.rotate) };
      if (p.clip) page.pushOperators(lib.pushGraphicsState(), lib.rectangle(p.clip.x, p.clip.y, p.clip.width, p.clip.height), lib.clip(), lib.endPath());
      if (target.page) page.drawPage(target.page, options);
      else page.drawImage(target.image, options);
      if (p.clip) page.pushOperators(lib.popGraphicsState());
    }
    const color = rgb(CUT_LINE.gray, CUT_LINE.gray, CUT_LINE.gray);
    for (const line of lines) {
      page.drawLine({ start: { x: pt(line.x1), y: pt(height - line.y1) }, end: { x: pt(line.x2), y: pt(height - line.y2) }, thickness: CUT_LINE.thickness, color });
    }
  }
  return doc.save();
}

// Devuelve una función que embebe cada origen una sola vez.
function embedder(doc, PDFDocument) {
  const cache = new Map(); // id de origen → promesa de {page} | {image}
  const sources = new Map(); // src → PDF de origen cargado con pdf-lib

  const embedImage = async (asset) => ({
    image: asset.format === 'jpg' ? await doc.embedJpg(asset.bytes) : await doc.embedPng(asset.bytes),
  });

  // Página vectorial, recortada a su caja visible.
  const embedPage = async (asset) => {
    if (!sources.has(asset.src)) {
      sources.set(asset.src, PDFDocument.load(asset.bytes, { updateMetadata: false }));
    }
    const source = await sources.get(asset.src);
    const [left, bottom, right, top] = asset.view;
    const [page] = await doc.embedPages([source.getPage(asset.page - 1)], [{ left, bottom, right, top }]);
    return { page };
  };

  // La vista previa ya viene rotada como corresponde.
  const embedPreview = async (asset) => {
    const png = new Uint8Array(await (await fetch(asset.url)).arrayBuffer());
    return { image: await doc.embedPng(png) };
  };

  const embedPdfAsset = async (asset) => {
    if (asset.pageRotation % 360 === 0) {
      try {
        return await embedPage(asset);
      } catch (err) {
        // Por ejemplo, PDFs cifrados que pdf.js abre pero pdf-lib no.
        console.warn('No se pudo embeber la página como vector; se usa la imagen.', err);
      }
    }
    return embedPreview(asset);
  };

  return (asset) => {
    const id = asset.kind === 'pdf' ? `${asset.src}#${asset.page}` : String(asset.src);
    if (!cache.has(id)) cache.set(id, asset.kind === 'pdf' ? embedPdfAsset(asset) : embedImage(asset));
    return cache.get(id);
  };
}
