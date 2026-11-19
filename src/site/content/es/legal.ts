// The Spanish legal pages: the documents as they are written (legal.ts), with
// a Spanish title and introduction for the license texts, which are in English.

import { esc } from '../../html.ts';
import { app, type Kit } from '../../kit.ts';
import type { LegalDoc, LegalId, LegalMarkers } from '../../legal.ts';
import { legalPage as page, type LegalPageTexts } from '../../legal-page.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export const LEGAL_MARKERS: LegalMarkers = { draft: '_Borrador.', analytics: 'Analítica', pending: 'PENDIENTE' };

const texts = ({ ui }: Kit): Readonly<Record<LegalId, LegalPageTexts>> => ({
  terms: {
    h1: ui('legal.terms'),
    description: `Las condiciones para usar ${app}, una herramienta web gratuita que acomoda imágenes y páginas de PDF en hojas a tamaño real.`,
  },
  privacy: {
    h1: ui('legal.privacy'),
    description: `Qué guarda ${app} en tu navegador, cómo borrarlo y qué datos técnicos recibe el alojamiento del sitio. Tus archivos no salen de tu dispositivo.`,
  },
  notices: {
    h1: 'Licencias de terceros',
    description: `Las bibliotecas y la fuente de terceros que incluye ${app}, con sus licencias y avisos de copyright.`,
    intro: `${app} incluye software de terceros, cada uno con su propia licencia. Este es el detalle, en inglés, como los textos de esas licencias.`,
  },
  license: {
    h1: 'Licencia del código',
    description: `El texto de la licencia PolyForm Noncommercial 1.0.0, bajo la que se publica el código fuente de ${app}.`,
    intro: `El código fuente de ${app} se publica bajo la licencia PolyForm Noncommercial 1.0.0. Este es su texto, en inglés; los <a href="${PATHS['legal-terms']}">${esc(ui('legal.terms'))}</a> explican qué permite, y que usar ${app} en este sitio está permitido para cualquier fin, también comercial.`,
  },
});

const LEGAL = { terms: PATHS['legal-terms'], privacy: PATHS['legal-privacy'], notices: PATHS['legal-notices'], license: PATHS['legal-license'] };

export const legalPage = (k: Kit, doc: LegalDoc): SitePage => page(doc, texts(k)[doc.id], LEGAL);
