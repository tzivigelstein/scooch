// «Imprimir la misma foto varias veces en una hoja»: Rellenar con copias and Duplicar.

import type { PaperId } from '../../../core/types.ts';
import { guide } from '../../guide.ts';
import { app, capacity, editorHref, link, mm, num, paperName, paragraphs, photo, photoName, sheetFigure, size, steps, table, ui, type Layout } from '../../kit.ts';
import { PATHS } from './paths.ts';

export function samePhoto() {
  const layout = { margin: 5, gap: 2 };
  const papers: PaperId[] = ['A4', 'letter'];
  const label = { w: 50, h: 30 };
  const figureLayout: Layout = { paper: 'A4', ...layout };
  const labels = capacity(label, figureLayout).grid.count;
  const sizes = [
    ...['10x10', '9x13', 'visa-5x5', 'id-4x4'].map((id) => ({ name: photoName(id), ...photo(id) })),
    { name: 'Etiqueta', ...label },
    { name: 'Sticker cuadrado', w: 25, h: 25 },
  ];
  const rows = sizes.map((s) => [`${s.name} <span class="muted">(${size(s.w, s.h)})</span>`, ...papers.map((paper) => num(capacity(s, { paper, ...layout }).grid.count))]);

  return guide({
    id: 'same-photo',
    lang: 'es',
    path: PATHS.samePhoto,
    title: `Imprimir la misma foto varias veces en una hoja · ${app}`,
    description: 'Llena una hoja con copias de una foto, un logo o una etiqueta a la medida que elijas, con líneas de corte. Gratis, sin cuenta y sin subir tus archivos.',
    h1: 'Imprimir la misma foto varias veces en una hoja',
    crumb: 'La misma foto varias veces',
    lead: `Elige la medida, y ${app} llena la hoja con copias de tu foto, logo o etiqueta en un solo paso. Cada copia sale a tamaño real, con líneas de corte si las necesitas.`,
    ctas: [
      { label: `Abrir ${app} con hoja A4`, href: editorHref({ paper: 'A4', ...layout, cutMode: 'outline' }) },
      { label: 'Abrir con hoja Carta', href: editorHref({ paper: 'letter', ...layout, cutMode: 'outline' }) },
    ],
    feature: sheetFigure(label, figureLayout, `${num(labels)} etiquetas de ${size(label.w, label.h)} en una hoja A4, con ${mm(layout.gap)} de separación`, { fill: true }),
    sections: [
      {
        h2: 'Cómo hacerlo',
        html:
          steps([
            `Abre ${app} con uno de los botones de arriba y agrega tu imagen con ${ui('bar.add')}.`,
            `Dale la medida de cada copia: elige un ${ui('crop.size')} en ${ui('props.title')} o escribe el ancho y el alto.`,
            `Presiona ${ui('props.fill')}, en la pestaña ${ui('props.tabs.piece')}. Antes de aplicarlo, dice cuántas copias entran. Reemplaza las otras piezas de esa hoja, y puedes deshacerlo.`,
            `¿Quieres una cantidad exacta? Usa ${ui('props.duplicate')}: cada copia va a un hueco libre y, si no hay, a una hoja nueva.`,
            `Presiona ${ui('bar.print')} y elige «Tamaño real» o «100 %». Las ${ui('cuts.title').toLowerCase()} marcan dónde cortar cada copia.`,
          ]) + paragraphs(`Para dejar más espacio entre copias, sube la ${ui('props.gap')} en la pestaña ${ui('props.tabs.sheet')} antes de rellenar la hoja.`),
      },
      {
        h2: 'Cuántas copias entran',
        html:
          table(
            [{ head: 'Copia' }, ...papers.map((p) => ({ head: paperName(p), num: true }))],
            rows,
            `Copias por hoja con ${ui('props.fill')}, con márgenes de ${mm(layout.margin)} y ${mm(layout.gap)} de separación.`
          ) + paragraphs(`Para cualquier otra medida, usa la ${link(PATHS.howMany, 'calculadora de cuántas fotos caben en una hoja')}.`),
      },
    ],
    faq: [
      {
        q: '¿Cuántas copias entran en una hoja?',
        a: `Depende de la medida, del margen y de la separación. ${ui('props.fill')} dice cuántas antes de aplicarlo, y la ${link(PATHS.howMany, 'calculadora')} te lo dice antes de empezar.`,
      },
      {
        q: '¿Puedo hacer copias de varias fotos distintas en la misma hoja?',
        a: `Sí. Selecciona las fotos y usa ${ui('props.duplicate')}: cada una se copia las veces que elijas. Después presiona ${ui('bar.arrange')}.`,
      },
      { q: '¿Las copias pierden calidad?', a: `No. Todas usan el archivo original. Si la imagen tiene poca resolución para la medida elegida, ${app} avisa que puede verse pixelada.` },
      {
        q: '¿Cómo dejo espacio para cortar?',
        a: `Sube la ${ui('props.gap')} en ${ui('props.title')}, en la pestaña ${ui('props.tabs.sheet')}, y activa las ${ui('cuts.title').toLowerCase()}. Con unos milímetros de separación es más fácil cortar.`,
      },
    ],
  });
}
