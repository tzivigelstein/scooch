// «Fotos 10 × 15 en una hoja A4»: how many fit by margin, and how to print them.

import { tenByFifteenFacts } from '../../facts/photos-10x15.ts';
import { guide } from '../../guide.ts';
import { app, link, paragraphs, sheetFigure, steps, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export function tenByFifteen({ ui, num, mm, size, photoName, paperName }: Kit): SitePage {
  const f = tenByFifteenFacts();
  const p = f.photo;
  const name = photoName('10x15');
  const columns = [{ head: 'Margen' }, ...f.papers.flatMap((paper) => f.gaps.map((gap) => ({ head: `${paperName(paper)}, ${gap ? `${mm(gap)} de separación` : 'sin separación'}`, num: true })))];
  const rows = f.rows.map((r) => [mm(r.margin), ...r.counts.map((n) => num(n))]);

  return guide({
    id: 'photos-10x15',
    lang: 'es',
    path: PATHS['photos-10x15'],
    title: `Imprimir fotos ${name} en una hoja A4 o Carta · ${app}`,
    description: `En una hoja A4 entran ${num(f.onA4)} fotos ${name} con márgenes de ${mm(f.a4.margin)}, y en Carta con ${mm(f.letter.margin)}. Acomódalas a tamaño real y descarga el PDF, gratis.`,
    h1: `Fotos ${name} en una hoja A4`,
    crumb: `Fotos ${name} en A4`,
    lead: `En una hoja A4 entran ${num(f.onA4)} fotos ${name} a tamaño real si tu impresora deja un margen de ${mm(f.a4.margin)} o menos y las fotos van sin separación: dos verticales arriba y una horizontal abajo. Con márgenes de ${mm(f.wideMargin)} entran ${num(f.onA4Wide)}. ${app} las acomoda solas y las deja listas para imprimir.`,
    ctas: [
      { label: `Abrir ${app} con fotos ${name} en A4`, href: f.open.a4 },
      { label: 'Abrir con hoja Carta', href: f.open.letter },
    ],
    feature: sheetFigure(f.figure, `${num(f.onA4)} fotos ${name} en una hoja A4 con márgenes de ${mm(f.a4.margin)}`),
    sections: [
      {
        h2: 'Cómo hacerlo',
        html: steps([
          `Abre ${app} con el botón de arriba: la hoja queda en A4, con márgenes de ${mm(f.a4.margin)} y sin separación entre fotos.`,
          `Agrega tus fotos con ${ui('bar.add')} o suéltalas sobre la hoja. Cada una queda recortada a ${name}, centrada; las horizontales, a ${photoName('10x15', { turned: true })}.`,
          `Si alguna no quedó bien encuadrada, haz doble clic sobre ella para recortarla y mueve la imagen.`,
          `Presiona ${ui('bar.arrange')}: entran ${num(f.onA4)} por hoja, y ${app} suma las hojas que hagan falta.`,
          `Si vas a cortarlas, activa las ${ui('cuts.title')} en ${ui('props.title')}, en la pestaña ${ui('props.tabs.project')}.`,
          `Presiona ${ui('bar.print')} y elige «Tamaño real» o «100 %» en el diálogo de impresión.`,
        ]),
      },
      {
        h2: 'Cuántas entran según el margen',
        html:
          paragraphs(`El margen depende de tu impresora: muchas dejan unos milímetros sin imprimir en cada borde. Esto es lo que pone ${ui('bar.arrange')} en cada caso:`) +
          table(columns, rows, `Fotos ${name} (${size(p.w, p.h)}) por hoja, con ${ui('props.rotate')}.`),
      },
      {
        h2: `La medida de una foto ${name}`,
        html: paragraphs(
          `En ${app}, la foto ${name} mide ${size(p.w, p.h)}: es la medida real de las copias de laboratorio, ${size(4, 6, 'in')}.`,
          `Si necesitas ${size(f.exact.w, f.exact.h)} justos, elige ${name} y después escribe ${mm(f.exact.w)} de ancho en ${ui('props.title')}: el alto queda en ${mm(f.exact.h)}. Con esa medida entran ${num(f.exact.count)} en una hoja A4 también con márgenes de ${mm(f.wideMargin)}.`
        ),
      },
    ],
    faq: [
      {
        q: `¿Cuántas fotos ${name} entran en una hoja A4?`,
        a: `${num(f.onA4)} si el margen es de ${mm(f.a4.margin)} o menos y no hay separación entre las fotos; con márgenes de ${mm(f.wideMargin)}, ${num(f.onA4Wide)}.`,
      },
      {
        q: `¿Se pueden imprimir 4 fotos ${name} en una hoja A4?`,
        a: `A ${name}, no: no hay forma de ubicar 4 sin recortarlas. Lo que sí entra son ${num(f.quarter.count)} fotos de ${size(f.quarter.w, f.quarter.h)}, un poco más pequeñas (la cuarta parte de una hoja A4), y solo si la impresora imprime sin márgenes.`,
      },
      {
        q: `¿Cuántas fotos ${name} entran en una hoja Carta?`,
        a: `${num(f.onLetter)} con márgenes de ${mm(f.letter.margin)}${f.sameWithGap ? `, aun con ${mm(f.cutGap)} de separación entre ellas` : ''}.`,
      },
      {
        q: '¿Qué papel uso?',
        a: 'Papel fotográfico A4 o Carta que acepte tu impresora, brillante o mate. En el diálogo de impresión, elige ese tipo de papel para que la impresora use la calidad que corresponde.',
      },
      { q: '¿Y si mis fotos tienen otras medidas?', a: `Usa la ${link(PATHS['how-many'], 'calculadora de cuántas fotos caben en una hoja')}: elige la medida y el margen, y abre la hoja en ${app}.` },
    ],
  });
}
