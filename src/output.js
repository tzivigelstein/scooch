// Salida: arma el PDF de la hoja (export.js) y lo descarga o lo manda a
// imprimir. Imprimir usa el mismo PDF que la descarga, cargado en un iframe
// oculto; si el navegador no lo permite, abre el PDF en otra pestaña (o, si
// eso también está bloqueado, lo descarga).

import { APP_NAME } from './config.ts';
import { state, assets, sheetSize, itemsOn, boxOf } from './store.js';
import { cutLines } from './core/cutmarks.js';
import { paperName, paperSlug } from './measure.js';
import { buildPdf } from './export.js';
import { slug } from './util.js';
import { t } from './copy/index.ts';

export const pdfFileName = () => `${slug(APP_NAME, t('print.fallbackName'))}-${paperSlug()}.pdf`;

/**
 * Bytes del PDF: una página del tamaño del papel por hoja, en orden,
 * salteando las vacías, con sus piezas (recortadas y giradas) y, si el
 * documento las pide, sus líneas de corte.
 */
export function makePdf() {
  const [W, H] = sheetSize();
  const piece = (item) => ({ asset: assets.get(item.asset), x: item.x, y: item.y, scale: item.scale, r: item.r, crop: item.crop ?? null });
  const pages = state.sheets
    .map((sheet) => itemsOn(sheet.id))
    .filter((items) => items.length)
    .map((items) => ({
      pieces: items.map(piece),
      lines: cutLines(items.map(boxOf), { ...state.cuts, bounds: { x: 0, y: 0, w: W, h: H } }),
    }));
  return buildPdf({ width: W, height: H, pages, title: t('print.pdfTitle', { paper: paperName() }), creator: APP_NAME });
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
