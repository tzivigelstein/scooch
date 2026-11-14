// «Imprimir varias fotos en una hoja»: the main guide.

import { LEGAL_PATHS } from '../../paths.ts';
import { guide } from '../../guide.ts';
import { app, capacity, editorHref, link, MAX_ITEMS, mm, num, paperName, paragraphs, photo, photoName, sheetFigure, size, steps, table, ui, type Layout } from '../../kit.ts';
import type { PaperId } from '../../../core/types.ts';
import { PATHS } from './paths.ts';

export function severalPhotos() {
  const layout = { margin: 5, gap: 3 };
  const papers: PaperId[] = ['A4', 'letter', 'legal'];
  const figureLayout: Layout = { paper: 'A4', ...layout };
  const shown = photo('9x13');
  const shownCount = capacity(shown, figureLayout).count;
  const rows = ['10x15', '13x18', '9x13', '10x10'].map((id) => {
    const p = photo(id);
    return [`${photoName(id)} <span class="muted">(${size(p.w, p.h)})</span>`, ...papers.map((paper) => num(capacity(p, { paper, ...layout }).count))];
  });

  return guide({
    id: 'several-photos',
    lang: 'es',
    path: PATHS.severalPhotos,
    title: `Imprimir varias fotos en una hoja a tamaño real · ${app}`,
    description: `Acomoda varias fotos en una hoja A4, Carta u Oficio a su tamaño real y descarga el PDF o imprímelo. Gratis, sin cuenta y sin subir tus fotos.`,
    h1: 'Imprimir varias fotos en una hoja',
    crumb: 'Varias fotos en una hoja',
    lead: `Con ${app} pones varias fotos en una misma hoja, cada una con su medida real, y las imprimes juntas desde el navegador de la computadora o del celular. Es gratis, no pide cuenta y tus fotos no salen de tu dispositivo.`,
    ctas: [
      { label: `Abrir ${app} con hoja A4`, href: editorHref({ paper: 'A4', ...layout }) },
      { label: 'Abrir con hoja Carta', href: editorHref({ paper: 'letter', ...layout }) },
    ],
    feature: sheetFigure(shown, figureLayout, `${num(shownCount)} fotos ${photoName('9x13')} en una hoja A4, con márgenes de ${mm(layout.margin)}`),
    sections: [
      {
        h2: 'Cómo hacerlo',
        html: steps([
          `Abre ${app} con el papel que vas a usar. Si es otro, cámbialo en ${ui('props.title')}, en la pestaña ${ui('props.tabs.sheet')}: hay A4, Carta, Oficio, papel fotográfico y medidas personalizadas.`,
          `Presiona ${ui('bar.add')} o suelta las fotos sobre la hoja. Puedes agregar varias a la vez, y también PDF: cada página es una pieza más.`,
          `Presiona ${ui('bar.arrange')}: ${app} ubica todas las fotos sin superponerlas y suma las hojas que hagan falta.`,
          `Si quieres que todas tengan la misma medida, selecciónalas y elige un ${ui('crop.size')} (${photoName('10x15')}, ${photoName('13x18')}, ${photoName('id-4x4')}…) o escribe el ancho y el alto.`,
          `Presiona ${ui('bar.print')} o ${ui('bar.download')}. En el diálogo de impresión, elige «Tamaño real» o «100 %» para que cada foto salga con su medida.`,
        ]),
      },
      {
        h2: 'Cuántas fotos entran en una hoja',
        html:
          paragraphs(`Depende de la medida de las fotos, del papel y del margen que deja tu impresora. Estas son las fotos iguales que pone ${ui('bar.arrange')} en cada hoja:`) +
          table(
            [{ head: 'Foto' }, ...papers.map((p) => ({ head: paperName(p), num: true }))],
            rows,
            `Con márgenes de ${mm(layout.margin)}, ${mm(layout.gap)} de separación entre fotos y ${ui('props.rotate')}.`
          ) +
          paragraphs(`Para otras medidas y otros márgenes, usa la ${link(PATHS.howMany, 'calculadora de cuántas fotos caben en una hoja')}.`),
      },
      {
        h2: 'A tamaño real, sin ajustes',
        html: paragraphs(
          `${app} crea un PDF con la medida exacta de la hoja, y cada foto queda con su medida en milímetros, no en píxeles. Lo que puede cambiar el tamaño es el diálogo de impresión: con «Ajustar a la página» o una opción parecida, la impresora reduce todo un poco. Por eso conviene elegir «Tamaño real» o «100 %» e imprimir una prueba antes de imprimir muchas copias.`,
          `Hay más detalles en la guía para ${link(PATHS.actualSize, 'imprimir una imagen a tamaño real')}.`
        ),
      },
      {
        h2: 'Desde el celular',
        html: paragraphs(
          `${app} funciona en el navegador del celular o de la tableta, sin instalar nada. Agrega las fotos desde la galería, presiona ${ui('bar.arrange')} y descarga el PDF para imprimirlo o llevarlo a imprimir.`
        ),
      },
    ],
    faq: [
      { q: '¿Puedo imprimir varias fotos en una hoja desde el celular?', a: `Sí. ${app} funciona en el navegador del celular: agrega las fotos desde la galería, presiona ${ui('bar.arrange')} y descarga el PDF.` },
      { q: '¿Necesito Word u otro programa?', a: 'No. Todo pasa en el navegador: no hay que instalar nada ni crear una cuenta.' },
      {
        q: '¿Por qué las fotos salen más pequeñas al imprimir?',
        a: 'Casi siempre es la escala del diálogo de impresión. Con «Ajustar a la página» o una opción parecida, la impresora reduce la hoja para que entre en su área de impresión. Elige «Tamaño real» o «100 %».',
      },
      {
        q: '¿Se suben mis fotos a algún servidor?',
        a: `No. Las fotos se abren y se procesan en tu navegador, y el PDF también se crea ahí. Lo explica la ${link(LEGAL_PATHS.privacy, ui('legal.privacy'))}.`,
      },
      { q: '¿Puedo mezclar fotos de distintos tamaños, o fotos y páginas de PDF?', a: `Sí. ${ui('bar.arrange')} ubica juntas piezas de cualquier tamaño, y cada página de un PDF es una pieza más.` },
      { q: '¿Hay marca de agua o un límite de fotos?', a: `No hay marca de agua. Un proyecto admite hasta ${num(MAX_ITEMS)} piezas.` },
    ],
  });
}
