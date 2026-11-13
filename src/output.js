// Salida: arma el PDF de la hoja (export.js) y lo descarga o lo manda a
// imprimir. Imprimir usa el mismo PDF que la descarga, cargado en un iframe
// oculto; si el navegador no lo permite, abre el PDF en otra pestaña (o, si
// eso también está bloqueado, lo descarga).

import { APP_NAME } from './config.js';
import { state, assets, sheetSize, dims, paperName, paperSlug } from './store.js';
import { buildPdf } from './export.js';
import { slug } from './util.js';
import { t } from './copy/index.js';

export const pdfFileName = () => `${slug(APP_NAME, t('print.fallbackName'))}-${paperSlug()}.pdf`;

/** Bytes del PDF de la hoja actual (una página del tamaño del papel). */
export function makePdf() {
  const [W, H] = sheetSize();
  const pieces = state.items.map((item) => {
    const asset = assets.get(item.asset);
    const k = item.scale / 100;
    const [w, h] = dims(item);
    return { asset, x: item.x, y: item.y, w, h, uw: asset.w * k, uh: asset.h * k, r: item.r };
  });
  return buildPdf({ width: W, height: H, pieces, title: t('print.pdfTitle', { paper: paperName() }), creator: APP_NAME });
}

const pdfUrl = (bytes) => URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));

function downloadUrl(url, fileName) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadBytes(bytes, fileName) {
  downloadUrl(pdfUrl(bytes), fileName);
}

// ---------- Imprimir ----------

let frame = null; // un único iframe, reusado entre impresiones
let frameUrl = null;
let cleanupTimer = 0;

/**
 * ¿Se puede imprimir un PDF embebido? Primero por capacidad (sin visor de PDF
 * integrado, p. ej. en móviles, no); Safari e iOS imprimen la página en vez
 * del PDF del iframe, y eso no se puede detectar de otra forma.
 */
function canPrintInFrame() {
  if (navigator.pdfViewerEnabled === false) return false;
  const ua = navigator.userAgent;
  const iOS = /iP(hone|ad|od)/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const safari = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(ua);
  return !iOS && !safari;
}

function releaseFrame() {
  clearTimeout(cleanupTimer);
  if (frameUrl) URL.revokeObjectURL(frameUrl);
  frameUrl = null;
}

function printInFrame(url) {
  return new Promise((resolve, reject) => {
    releaseFrame();
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'print-frame';
      frame.title = t('print.frameTitle');
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      document.body.append(frame);
    }
    frameUrl = url;
    const timeout = setTimeout(() => {
      frame.onload = null;
      reject(new Error('el PDF no terminó de cargar'));
    }, 20_000);
    const back = document.activeElement;
    // El foco vuelve a donde estaba (imprimir lo pasa al iframe oculto).
    const restore = () => {
      if (document.activeElement === frame && back?.isConnected) back.focus({ preventScroll: true });
    };
    frame.onload = () => {
      clearTimeout(timeout);
      frame.onload = null;
      try {
        const win = frame.contentWindow;
        win.addEventListener('afterprint', () => (releaseFrame(), restore()), { once: true });
        win.focus();
        win.print();
        window.addEventListener('focus', restore, { once: true });
        requestAnimationFrame(restore);
        resolve();
      } catch (err) {
        restore();
        reject(err);
      }
      // Por si «afterprint» no llega (el visor de PDF no siempre lo avisa).
      cleanupTimer = setTimeout(releaseFrame, 5 * 60_000);
    };
    frame.src = url;
  });
}

function openOrDownload(url, fileName) {
  const tab = window.open(url, '_blank');
  if (tab) {
    try {
      tab.opener = null;
    } catch {
      // nada: es solo una precaución
    }
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    return 'tab';
  }
  downloadUrl(url, fileName);
  return 'download';
}

/**
 * Manda los bytes a imprimir. Devuelve 'dialog' si abrió el diálogo de
 * impresión, 'tab' si abrió el PDF en otra pestaña o 'download' si lo descargó.
 */
export async function printBytes(bytes, fileName) {
  const url = pdfUrl(bytes);
  if (canPrintInFrame()) {
    try {
      await printInFrame(url);
      return 'dialog';
    } catch (err) {
      console.warn('No se pudo imprimir directamente; se abre el PDF.', err);
      releaseFrame();
      return openOrDownload(pdfUrl(bytes), fileName);
    }
  }
  return openOrDownload(url, fileName);
}
