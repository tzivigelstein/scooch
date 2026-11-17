// «Preguntas frecuentes»: about the tool itself (each guide has its own).

import { app, link, MAX_ITEMS, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { papersSentence, photoSizesSentence } from './chrome.ts';
import { PATHS } from './paths.ts';

export function faqPage(k: Kit): SitePage {
  const { ui, num } = k;
  return {
    id: 'faq',
    lang: 'es',
    path: PATHS.faq,
    title: `Preguntas frecuentes sobre ${app}`,
    description: `Qué es ${app}, cuánto cuesta, dónde quedan tus archivos, qué papeles y tamaños de foto trae y cómo imprimir a tamaño real.`,
    h1: 'Preguntas frecuentes',
    crumb: 'Preguntas frecuentes',
    kind: 'faq',
    indexable: true,
    body: `<p class="lead">Lo que más conviene saber antes de usar ${app}. Para cada caso, como varias fotos en una hoja o fotos carnet, hay una guía con sus propias preguntas.</p>`,
    faq: [
      {
        q: `¿Qué es ${app}?`,
        a: `${app} es una herramienta web gratuita que acomoda imágenes y páginas de PDF en hojas de papel a tamaño real y crea un PDF para descargar o imprimir. Funciona en el navegador, sin instalar nada.`,
      },
      { q: '¿Cuánto cuesta?', a: `Nada. ${app} es gratis, no pide cuenta y no agrega marcas de agua ni anuncios.` },
      {
        q: '¿Mis archivos se suben a algún servidor?',
        a: `No. Las imágenes y los PDF se abren y se procesan en tu navegador, y el PDF también se crea ahí. Más detalles en la ${link(PATHS['legal-privacy'], ui('legal.privacy'))}.`,
      },
      {
        q: '¿Dónde se guardan mis proyectos?',
        a: `En tu navegador, en ese dispositivo. Se guardan solos mientras trabajas, y puedes abrirlos o eliminarlos en ${ui('projects.title')}. Si borras los datos del sitio en el navegador, se pierden: conserva tus archivos originales.`,
      },
      {
        q: '¿Qué archivos puedo agregar?',
        a: 'Imágenes que tu navegador pueda abrir (JPG, PNG, WebP…) y PDF. Cada página de un PDF es una pieza.',
      },
      { q: '¿Qué papeles trae?', a: `${papersSentence(k)}.` },
      { q: '¿Qué tamaños de foto trae?', a: `${photoSizesSentence(k)}. También puedes escribir cualquier ancho y alto.` },
      {
        q: '¿Cómo imprimo a tamaño real?',
        a: `Presiona ${ui('bar.print')} o ${ui('bar.download')} y, en el diálogo de impresión, elige «Tamaño real» o «100 %». Hay más detalles en la guía para ${link(PATHS['actual-size'], 'imprimir una imagen a tamaño real')}.`,
      },
      { q: '¿Funciona en el celular?', a: 'Sí, en el navegador del celular o de la tableta, sin instalar nada.' },
      { q: '¿Cuántas piezas puedo poner?', a: `Hasta ${num(MAX_ITEMS)} piezas por proyecto, en las hojas que hagan falta.` },
      {
        q: '¿Sirve para fotos de trámites?',
        a: `Sí, para recortarlas e imprimirlas a la medida. Pero cada trámite define sus requisitos (medida, fondo, encuadre) y ${app} no los revisa: consulta siempre a la entidad que pide la foto. Mira la guía de ${link(PATHS['id-photos'], 'foto carnet para imprimir')}.`,
      },
      {
        q: `¿Puedo abrir ${app} ya configurado desde un enlace?`,
        a: `Sí. Las guías tienen botones que abren el editor con el papel, el margen y el tamaño de foto listos. Siempre se crea un proyecto nuevo: los que tenías siguen guardados en ${ui('projects.title')}.`,
      },
      {
        q: '¿El código es abierto?',
        a: `El código fuente se publica bajo la licencia PolyForm Noncommercial 1.0.0: puedes usarlo, estudiarlo y modificarlo con fines no comerciales. El texto completo está en la ${link(PATHS['legal-license'], 'licencia del código')}.`,
      },
    ],
  };
}
