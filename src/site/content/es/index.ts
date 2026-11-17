// The Spanish pages, in the order the footer lists the guides. Spanish is the
// site's first language: its pages are the reference for the others
// (tests/site/languages.test.ts), and it also has the error page and the
// texts of the editor's page and of llms.txt.

import { ctaLinks } from '../../guide.ts';
import { app } from '../../kit.ts';
import type { SiteLanguage, SitePage } from '../../types.ts';
import { actualSize } from './actual-size.ts';
import { chrome, llmsSections } from './chrome.ts';
import { faqPage } from './faq.ts';
import { howMany } from './how-many.ts';
import { idPhotos } from './id-photos.ts';
import { LEGAL_MARKERS, legalPage } from './legal.ts';
import { PATHS } from './paths.ts';
import { tenByFifteen } from './photos-10x15.ts';
import { samePhoto } from './same-photo.ts';
import { severalPhotos } from './several-photos.ts';

export { appFacts, llmsIntro } from './chrome.ts';

/** What a missing address shows (404.html; never indexed). */
function notFound(): SitePage {
  return {
    id: 'not-found',
    lang: 'es',
    path: '/404',
    title: `Página no encontrada · ${app}`,
    description: `Esta dirección no lleva a ninguna página de ${app}. Abre el editor o mira las guías y las preguntas frecuentes.`,
    h1: 'No encontramos esta página',
    crumb: 'Página no encontrada',
    kind: 'error',
    indexable: false,
    body: `<p class="lead">Puede que la dirección esté mal escrita o que la página ya no exista.</p>\n${ctaLinks([
      { label: `Abrir ${app}`, href: '/' },
      { label: 'Ver las preguntas frecuentes', href: PATHS.faq },
    ])}`,
  };
}

export const es: SiteLanguage = {
  lang: 'es',
  units: { mm: 'mm', cm: 'cm', in: 'pulgadas' },
  paths: PATHS,
  legalMarkers: LEGAL_MARKERS,
  chrome,
  llms: llmsSections,
  pages: (k, legal) => [severalPhotos(k), howMany(k), tenByFifteen(k), idPhotos(k), samePhoto(k), actualSize(k), faqPage(k), ...legal.map((doc) => legalPage(k, doc)), notFound()],
};
