// «Foto carnet y de pasaporte para imprimir»: the app's document photo sizes
// (only those: src/core/crop.js, group 'id'), a sheet of copies, and the
// requirements the app doesn't check. Which size a procedure asks for is the
// office's to say: the page names no country or procedure for a size.

import { PHOTO_SIZES } from '../../../core/crop.js';
import type { PaperId } from '../../../core/types.ts';
import { LEGAL_PATHS } from '../../paths.ts';
import { guide } from '../../guide.ts';
import { app, capacity, editorHref, link, mm, note, num, paperName, paragraphs, photo, photoName, sheetFigure, size, steps, table, ui, type Layout } from '../../kit.ts';
import { PATHS } from './paths.ts';

export function idPhotos() {
  const ids = PHOTO_SIZES.filter((s) => s.group === 'id').map((s) => s.id);
  const layout = { margin: 5, gap: 2 };
  const papers: PaperId[] = ['A4', 'letter'];
  const counts = (id: string, paper: PaperId) => capacity(photo(id), { paper, ...layout });
  const rows = ids.map((id) => {
    const p = photo(id);
    return [photoName(id), size(p.w, p.h), ...papers.map((paper) => num(counts(id, paper).grid.count))];
  });
  // Where «Acomodar» fits more than the grid (mixing upright and turned photos).
  const more = ids.flatMap((id) => papers.filter((paper) => counts(id, paper).count > counts(id, paper).grid.count).map((paper) => `${num(counts(id, paper).count)} de ${photoName(id)} en ${paperName(paper)}`));
  const figureLayout: Layout = { paper: 'A4', ...layout };
  const passport = photo('passport-35x45');
  const onA4 = (id: string) => num(counts(id, 'A4').grid.count);

  return guide({
    id: 'id-photos',
    lang: 'es',
    path: PATHS.idPhotos,
    title: `Foto carnet para imprimir: varias copias en una hoja · ${app}`,
    description: `Recorta tu foto a 4 × 4 cm, 3,5 × 4,5 cm o 2 × 2 pulgadas y llena una hoja A4 o Carta con copias para cortar. Gratis y sin subir la foto.`,
    h1: 'Foto carnet y de pasaporte para imprimir en una hoja',
    crumb: 'Foto carnet para imprimir',
    lead: `Con ${app} recortas tu foto a la medida del trámite y llenas una hoja con copias listas para cortar. Es gratis y la foto no sale de tu dispositivo: todo pasa en el navegador.`,
    ctas: ids.map((id) => ({ label: `Abrir con ${photoName(id)}`, href: editorHref({ paper: 'A4', ...layout, photo: id, cutMode: 'outline' }) })),
    feature:
      note(
        `Cada trámite define sus requisitos: la medida, el fondo, el encuadre, el tamaño de la cara y si acepta fotos impresas en casa. Antes de imprimir, consulta a la entidad que pide la foto. ${app} recorta e imprime a la medida que elijas, pero no revisa esos requisitos.`
      ) + sheetFigure(passport, figureLayout, `${onA4('passport-35x45')} fotos de ${size(passport.w, passport.h)} en una hoja A4, como las pone ${ui('props.fill')}`, { fill: true }),
    sections: [
      {
        h2: `Medidas que trae ${app}`,
        html:
          table(
            [{ head: `Tamaño en ${app}` }, { head: 'Medida' }, ...papers.map((p) => ({ head: `En ${paperName(p)}`, num: true }))],
            rows,
            `Copias por hoja con ${ui('props.fill')}, con márgenes de ${mm(layout.margin)} y ${mm(layout.gap)} de separación para cortarlas.`
          ) +
          paragraphs(
            `La medida la decide la oficina que pide la foto, y cambia según el país y el trámite. Revisa su requisito antes de elegir uno de estos tamaños. Si pide otra medida, elige Otra medida en la ${link(PATHS.howMany, 'calculadora')} y abre la hoja desde ahí.`,
            ...(more.length ? [`Con ${ui('bar.arrange')}, que mezcla fotos derechas y rotadas, a veces entran más: ${more.join(', ')}. La ${link(PATHS.howMany, 'calculadora')} lo muestra para cada medida.`] : [])
          ),
      },
      {
        h2: 'Cómo hacerlo',
        html:
          steps([
            `Abre ${app} con la medida que necesitas, con uno de los botones de arriba. La hoja queda en A4, con márgenes de ${mm(layout.margin)}, ${mm(layout.gap)} de separación y ${ui('cuts.title').toLowerCase()}.`,
            `Agrega tu foto con ${ui('bar.add')}. Queda recortada a esa medida, centrada.`,
            'Si la cara no quedó bien encuadrada, haz doble clic sobre la foto para recortarla y mueve la imagen.',
            `Con la foto seleccionada, presiona ${ui('props.fill')} en ${ui('props.title')}, en la pestaña ${ui('props.tabs.piece')}.`,
            `Presiona ${ui('bar.print')} y elige «Tamaño real» o «100 %». Mide una copia con una regla antes de cortarlas todas.`,
          ]) + paragraphs(`¿Usas papel Carta? Cámbialo en ${ui('props.title')}, en la pestaña ${ui('props.tabs.project')}, antes de rellenar la hoja.`),
      },
    ],
    faq: [
      {
        q: '¿Cuántas fotos carnet caben en una hoja A4?',
        a: `Con ${ui('props.fill')}, márgenes de ${mm(layout.margin)} y ${mm(layout.gap)} de separación: ${onA4('id-4x4')} de 4 × 4 cm, ${onA4('passport-35x45')} de 3,5 × 4,5 cm y ${onA4('visa-5x5')} de 2 × 2 pulgadas.`,
      },
      {
        q: '¿Puedo imprimir la foto carnet en casa?',
        a: `Sí: armas la hoja en ${app} y la imprimes con tu impresora, mejor en papel fotográfico. Si la foto es para un trámite, consulta antes si aceptan fotos impresas en casa.`,
      },
      {
        q: `¿${app} revisa que la foto cumpla los requisitos?`,
        a: `No. Solo la recorta e imprime a la medida que elijas. El fondo, la luz, el encuadre y el tamaño de la cara dependen de la foto que uses. Lo dicen también los ${link(LEGAL_PATHS.terms, ui('legal.terms'))}.`,
      },
      { q: '¿Cuánto mide una foto de 2 × 2 pulgadas?', a: `${size(50.8, 50.8)}, unos 5 × 5 cm. En ${app} es el tamaño ${photoName('visa-5x5')}.` },
      {
        q: '¿Y si necesito otra medida?',
        a: `En la ${link(PATHS.howMany, 'calculadora')}, elige Otra medida, escribe el ancho y el alto y abre la hoja en ${app}: las fotos que agregues se recortan a esa medida.`,
      },
    ],
  });
}
