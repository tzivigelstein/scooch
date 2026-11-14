// Every Spanish page, in the order the footer lists the guides.

import { ctaLinks } from '../../guide.ts';
import { app } from '../../kit.ts';
import type { LegalDoc } from '../../legal.ts';
import type { SitePage } from '../../types.ts';
import { howMany } from './cuantas-fotos.ts';
import { idPhotos } from './foto-carnet.ts';
import { tenByFifteen } from './fotos-10x15.ts';
import { legalPage } from './legal.ts';
import { samePhoto } from './misma-foto.ts';
import { PATHS } from './paths.ts';
import { faqPage } from './preguntas.ts';
import { actualSize } from './tamano-real.ts';
import { severalPhotos } from './varias-fotos.ts';

export { chrome, appFacts, llms } from './chrome.ts';

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

export function pages(legal: readonly LegalDoc[]): SitePage[] {
  return [severalPhotos(), howMany(), tenByFifteen(), idPhotos(), samePhoto(), actualSize(), faqPage(), ...legal.map(legalPage), notFound()];
}
