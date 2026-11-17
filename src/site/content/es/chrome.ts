// The frame of the Spanish pages and what the site says about the tool
// (structured data, llms.txt). Copy rules: docs/copy.md.

import { CUSTOM_MAX, CUSTOM_MIN, PAPERS } from '../../../core/papers.js';
import { PHOTO_SIZES } from '../../../core/crop.js';
import { app, MAX_ITEMS, type Kit } from '../../kit.ts';
import type { Chrome } from '../../layout.ts';
import type { AppFacts } from '../../seo.ts';
import { PATHS } from './paths.ts';

export const chrome = ({ ui }: Kit): Chrome => ({
  skip: 'Ir al contenido',
  open: `Abrir ${app}`,
  crumbs: 'Ruta de navegación',
  guides: 'Guías',
  legal: 'Información legal',
  languages: 'Idioma',
  about: `${app} es gratis, no pide cuenta y tus archivos no salen del navegador.`,
  faq: 'Preguntas frecuentes',
  imageAlt: `${app}: fotos acomodadas en una hoja a tamaño real`,
  legalLinks: [
    [ui('legal.terms'), PATHS['legal-terms']],
    [ui('legal.privacy'), PATHS['legal-privacy']],
    ['Licencias de terceros', PATHS['legal-notices']],
    ['Licencia del código', PATHS['legal-license']],
  ],
});

const photoPapers = PAPERS.filter((p) => p.group === 'photo');
const otherPapers = PAPERS.filter((p) => p.group !== 'photo');

/** «A0, …, Tabloide y papel fotográfico de 9 × 13, …» */
export const papersSentence = ({ paperName, list, num, mm }: Kit) =>
  `${otherPapers.map((p) => paperName(p.id)).join(', ')} y papel fotográfico de ${list(photoPapers.map((p) => paperName(p.id).replace(/^Foto /, '')))}, además de medidas personalizadas de ${num(CUSTOM_MIN)} a ${mm(CUSTOM_MAX)} por lado`;

/** «9 × 13, 10 × 15, …, Visa 5 × 5 e Instantánea» */
export const photoSizesSentence = ({ photoName, list }: Kit) => list(PHOTO_SIZES.map((s) => photoName(s.id)));

/** The tool, for the structured data of the editor's page (in Spanish, as the editor's page). */
export const appFacts = (k: Kit): AppFacts => ({
  lang: 'es',
  description: k.ui('app.description'),
  requirements: 'Requiere JavaScript y un navegador actualizado',
  features: [
    'Acomoda imágenes y páginas de PDF en hojas de papel a tamaño real',
    'Papeles de las series A y B, Carta, Oficio, Folio, Tabloide, papel fotográfico y medidas personalizadas',
    `Tamaños de foto: ${photoSizesSentence(k)}`,
    'Rellena una hoja con copias de una foto',
    'Líneas de corte',
    'Descarga o imprime un PDF a tamaño real',
    'Los proyectos se guardan en el navegador; los archivos no se suben a ningún servidor',
  ],
});

/** What llms.txt says before the list of pages (in Spanish, the site's first language). */
export const llmsIntro = (k: Kit) => ({
  summary: `${app} es una herramienta web gratuita que acomoda imágenes y páginas de PDF en hojas de papel a tamaño real y crea un PDF para descargar o imprimir. Todo pasa en el navegador: los archivos no se suben a ningún servidor.`,
  facts: (url: string) => [
    'Gratis, sin cuenta, sin anuncios ni marcas de agua.',
    `Papeles: ${papersSentence(k)}.`,
    `Tamaños de foto: ${photoSizesSentence(k)}.`,
    `Hasta ${MAX_ITEMS} piezas (imágenes o páginas de PDF) por proyecto, en las hojas que hagan falta.`,
    `El editor se abre configurado con parámetros en la dirección, por ejemplo ${url}/?paper=A4&margin=5&gap=2&photo=passport-35x45 (papel, orientación, margen y separación en mm, tamaño de foto, líneas de corte y rotación automática). Siempre crea un proyecto nuevo.`,
  ],
});

export const llmsSections = { guides: 'Guías', faq: 'Preguntas frecuentes', legal: 'Información legal' };
