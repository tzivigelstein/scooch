// Exportación: una página de PDF del tamaño de la hoja por cada hoja con
// piezas, en orden, armada con pdf-lib.

const PT_PER_MM = 72 / 25.4;

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
 * Arma el PDF y devuelve sus bytes. `pages`: una lista de piezas por página,
 * cada una [{asset, x, y, w, h, uw, uh, r}] en mm; w/h ya rotados, uw/uh sin
 * rotar. Cada origen (imagen o página de PDF) se embebe una sola vez aunque
 * aparezca en varias páginas.
 */
export async function buildPdf({ width, height, pages, title, creator = title }) {
  const { PDFDocument, degrees } = await loadPdfLib();
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator(creator);
  const embed = embedder(doc, PDFDocument);

  for (const pieces of pages) {
    const page = doc.addPage([width * PT_PER_MM, height * PT_PER_MM]);
    for (const piece of pieces) {
      const target = await embed(piece.asset);
      const options = placement(piece, height, degrees);
      if (target.page) page.drawPage(target.page, options);
      else page.drawImage(target.image, options);
    }
  }
  return doc.save();
}

// pdf-lib ancla en la esquina inferior izquierda de lo que dibuja y rota
// (antihorario) alrededor de ese punto; en pantalla rotamos en sentido horario.
function placement({ x, y, w, h, uw, uh, r }, sheetHeight, degrees) {
  return {
    x: (x + (r === 180 || r === 270 ? w : 0)) * PT_PER_MM,
    y: (sheetHeight - y - (r === 90 || r === 180 ? 0 : h)) * PT_PER_MM,
    width: uw * PT_PER_MM,
    height: uh * PT_PER_MM,
    rotate: degrees(-r),
  };
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
