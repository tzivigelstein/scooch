// «Fotos 10 × 15 en una hoja A4»: how many fit by margin, and how to print them.

import type { PaperId } from '../../../core/types.ts';
import { guide } from '../../guide.ts';
import { app, capacity, editorHref, link, mm, num, paperName, paragraphs, photo, photoName, sheetFigure, size, steps, table, ui, type Layout } from '../../kit.ts';
import { PATHS } from './paths.ts';

/** A fact a sentence below relies on: if the packer ever says otherwise, the build stops instead of publishing a wrong sentence. */
function expect(actual: number, expected: number, what: string) {
  if (actual !== expected) throw new Error(`The 10 × 15 page says ${what} is ${expected}, but the packer now says ${actual}: rewrite the sentence`);
  return actual;
}

export function tenByFifteen() {
  const p = photo('10x15');
  const name = photoName('10x15');
  const a4: Layout = { paper: 'A4', margin: 3, gap: 0 };
  const letter: Layout = { paper: 'letter', margin: 5, gap: 0 };
  // Two upright side by side and one turned below: only with a narrow margin and no gap.
  const onA4 = expect(capacity(p, a4).count, 3, '10 × 15 on A4 with a 3 mm margin and no gap');
  const onA4Wide = expect(capacity(p, { ...a4, margin: 5 }).count, 2, '10 × 15 on A4 with a 5 mm margin');
  const onLetter = expect(capacity(p, letter).count, 3, '10 × 15 on Carta with a 5 mm margin');
  const onLetterCut = capacity(p, { ...letter, gap: 2 }).count;
  // 100 × 150 mm photos fit 3 on A4 with 5 mm margins too; four A6-sized ones only without margins.
  const exact = expect(capacity({ w: 100, h: 150 }, { ...a4, margin: 5 }).count, 3, '100 × 150 mm on A4 with a 5 mm margin');
  const quarter = expect(capacity({ w: 105, h: 148 }, { ...a4, margin: 0 }).count, 4, '105 × 148 mm on A4 without a margin');
  expect(capacity(p, { ...a4, margin: 0 }).count, 3, '10 × 15 on A4 without a margin');

  const margins = [0, 3, 5, 10];
  const papers: PaperId[] = ['A4', 'letter'];
  const columns = [{ head: 'Margen' }, ...papers.flatMap((paper) => [0, 2].map((gap) => ({ head: `${paperName(paper)}, ${gap ? `${mm(gap)} de separación` : 'sin separación'}`, num: true })))];
  const rows = margins.map((margin) => [mm(margin), ...papers.flatMap((paper) => [0, 2].map((gap) => num(capacity(p, { paper, margin, gap }).count)))]);

  return guide({
    id: 'photos-10x15',
    lang: 'es',
    path: PATHS.tenByFifteen,
    title: `Imprimir fotos ${name} en una hoja A4 o Carta · ${app}`,
    description: `En una hoja A4 entran ${num(onA4)} fotos ${name} con márgenes de ${mm(a4.margin)}, y en Carta con ${mm(letter.margin)}. Acomódalas a tamaño real y descarga el PDF, gratis.`,
    h1: `Fotos ${name} en una hoja A4`,
    crumb: `Fotos ${name} en A4`,
    lead: `En una hoja A4 entran ${num(onA4)} fotos ${name} a tamaño real si tu impresora deja un margen de ${mm(a4.margin)} o menos y las fotos van sin separación: dos verticales arriba y una horizontal abajo. Con márgenes de ${mm(5)} entran ${num(onA4Wide)}. ${app} las acomoda solas y las deja listas para imprimir.`,
    ctas: [
      { label: `Abrir ${app} con fotos ${name} en A4`, href: editorHref({ paper: 'A4', margin: a4.margin, gap: a4.gap, photo: '10x15' }) },
      { label: 'Abrir con hoja Carta', href: editorHref({ paper: 'letter', margin: letter.margin, gap: letter.gap, photo: '10x15' }) },
    ],
    feature: sheetFigure(p, a4, `${num(onA4)} fotos ${name} en una hoja A4 con márgenes de ${mm(a4.margin)}`),
    sections: [
      {
        h2: 'Cómo hacerlo',
        html: steps([
          `Abre ${app} con el botón de arriba: la hoja queda en A4, con márgenes de ${mm(a4.margin)} y sin separación entre fotos.`,
          `Agrega tus fotos con ${ui('bar.add')} o suéltalas sobre la hoja. Cada una queda recortada a ${name}, centrada; las horizontales, a 15 × 10.`,
          `Si alguna no quedó bien encuadrada, haz doble clic sobre ella para recortarla y mueve la imagen.`,
          `Presiona ${ui('bar.arrange')}: entran ${num(onA4)} por hoja, y ${app} suma las hojas que hagan falta.`,
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
          `En ${app}, la foto ${name} mide ${size(p.w, p.h)}: es la medida real de las copias de laboratorio, 4 × 6 pulgadas.`,
          `Si necesitas ${size(100, 150)} justos, elige ${name} y después escribe ${mm(100)} de ancho en ${ui('props.title')}: el alto queda en ${mm(150)}. Con esa medida entran ${num(exact)} en una hoja A4 también con márgenes de ${mm(5)}.`
        ),
      },
    ],
    faq: [
      {
        q: `¿Cuántas fotos ${name} entran en una hoja A4?`,
        a: `${num(onA4)} si el margen es de ${mm(a4.margin)} o menos y no hay separación entre las fotos; con márgenes de ${mm(5)}, ${num(onA4Wide)}.`,
      },
      {
        q: `¿Se pueden imprimir 4 fotos ${name} en una hoja A4?`,
        a: `A ${name}, no: no hay forma de ubicar 4 sin recortarlas. Lo que sí entra son ${num(quarter)} fotos de ${size(105, 148)}, un poco más pequeñas (la cuarta parte de una hoja A4), y solo si la impresora imprime sin márgenes.`,
      },
      {
        q: `¿Cuántas fotos ${name} entran en una hoja Carta?`,
        a: `${num(onLetter)} con márgenes de ${mm(letter.margin)}${onLetterCut === onLetter ? `, aun con ${mm(2)} de separación entre ellas` : ''}.`,
      },
      {
        q: '¿Qué papel uso?',
        a: 'Papel fotográfico A4 o Carta que acepte tu impresora, brillante o mate. En el diálogo de impresión, elige ese tipo de papel para que la impresora use la calidad que corresponde.',
      },
      { q: '¿Y si mis fotos tienen otras medidas?', a: `Usa la ${link(PATHS.howMany, 'calculadora de cuántas fotos caben en una hoja')}: elige la medida y el margen, y abre la hoja en ${app}.` },
    ],
  });
}
