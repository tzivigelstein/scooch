// «¿Cuántas fotos caben en una hoja?»: the calculator (calc-form.ts, run
// again in the browser by calculator.ts) and reference tables.

import { PHOTO_SIZES } from '../../../core/crop.js';
import { PAPERS } from '../../../core/papers.js';
import type { CalcTexts } from '../../calc.ts';
import { calculatorHtml } from '../../calc-form.ts';
import { CALC_START, howManyFacts } from '../../facts/how-many.ts';
import { guide } from '../../guide.ts';
import { app, MAX_ITEMS, table, type Kit } from '../../kit.ts';
import type { SitePage } from '../../types.ts';
import { PATHS } from './paths.ts';

export const calcTexts = ({ ui, paperName, photoName }: Kit): CalcTexts => ({
  locale: 'es',
  max: MAX_ITEMS,
  papers: Object.fromEntries(PAPERS.map((p) => [p.id, paperName(p.id)])),
  photos: Object.fromEntries(PHOTO_SIZES.map((s) => [s.id, photoName(s.id)])),
  orientation: { portrait: 'vertical', landscape: 'horizontal' },
  count: { one: 'foto por hoja', other: 'fotos por hoja', capped: 'más de {n}' },
  photoPreset: '{name} ({size})',
  summary: '{photo} en {paper}, con margen de {margin} y separación de {gap}',
  noRotate: `, sin ${ui('props.rotate').toLowerCase()}`,
  noteNone: 'La foto no entra en el área útil de la hoja. Reduce el margen o elige un papel más grande.',
  noteSame: {
    one: `Agrega tu foto y presiona ${ui('bar.arrange')} para ubicarla.`,
    other: `Agrega tu foto y usa ${ui('props.fill')}: pone las {n} de una vez.`,
  },
  noteMore: `${ui('props.fill')} pone {grid}, todas en la misma dirección. Para llegar a {n}, duplica la foto hasta tener {n} y presiona ${ui('bar.arrange')}: ${app} rota las que hagan falta.`,
  noteCapped: 'Un proyecto admite hasta {max} piezas.',
  figure: { one: '{n} foto en una hoja {paper}', other: '{n} fotos en una hoja {paper}' },
});

export function howMany(k: Kit): SitePage {
  const { ui, num, mm, size, photoName, paperName } = k;
  const f = howManyFacts();
  const calculator = calculatorHtml(k, CALC_START, calcTexts(k), {
    name: 'Calculadora',
    custom: 'Otra medida',
    width: 'Ancho de la foto, en mm',
    height: 'Alto de la foto, en mm',
    margin: `${ui('props.margin')}, en mm`,
    gap: `${ui('props.gap')} entre fotos, en mm`,
    noscript: 'La calculadora necesita JavaScript. Las tablas de abajo tienen las medidas más usadas.',
    open: `Abrir en ${app} con esta hoja`,
  });

  return guide({
    id: 'how-many',
    lang: 'es',
    path: PATHS['how-many'],
    title: `¿Cuántas fotos caben en una hoja? Calculadora · ${app}`,
    description: `Calcula cuántas fotos de ${photoName('10x15')}, carnet, pasaporte u otra medida caben en una hoja A4, Carta u Oficio con tus márgenes, y abre la hoja en el editor.`,
    h1: '¿Cuántas fotos caben en una hoja?',
    crumb: 'Cuántas fotos caben en una hoja',
    lead: `Elige el papel, la medida de las fotos, el margen y la separación. La calculadora usa el mismo método que el botón ${ui('bar.arrange')} de ${app}, así que el número es el que vas a obtener en el editor.`,
    ctas: [],
    feature: calculator,
    scripts: ['calculator'],
    sections: [
      {
        h2: 'Fotos por hoja en los papeles más usados',
        html: table(
          [{ head: 'Foto' }, ...f.papers.map((p) => ({ head: paperName(p), num: true }))],
          f.rows.map((r) => [`${photoName(r.id)} <span class="muted">(${size(r.w, r.h)})</span>`, ...r.counts.map((n) => num(n))]),
          `Con márgenes de ${mm(f.margin)}, ${mm(f.gap)} de separación entre fotos y ${ui('props.rotate')}. Es lo que pone ${ui('bar.arrange')}.`
        ),
      },
      {
        h2: 'Qué cambia el resultado',
        html: `<ul>
<li><strong>El margen.</strong> Muchas impresoras no imprimen hasta el borde del papel. Con un margen más pequeño entran más fotos, pero solo si tu impresora llega hasta ahí.</li>
<li><strong>La separación.</strong> Unos milímetros entre fotos hacen más fácil cortarlas, aunque a veces entra una menos.</li>
<li><strong>La rotación.</strong> Con ${ui('props.rotate')}, ${app} puede rotar algunas fotos para que entren más.</li>
<li><strong>La medida exacta.</strong> En ${app}, la foto ${photoName('10x15')} mide ${size(f.tenByFifteen.w, f.tenByFifteen.h)}: la medida real de las copias de laboratorio, ${size(4, 6, 'in')}. Unos milímetros cambian el resultado.</li>
</ul>`,
      },
    ],
    faq: [
      {
        q: `¿Cuántas fotos ${photoName('10x15')} entran en una hoja A4?`,
        a: `Con márgenes de ${mm(5)}, ${num(f.a4Wide)}. Con márgenes de ${mm(f.narrowMargin)} o menos y sin separación, ${num(f.a4Narrow)}: dos verticales y una horizontal debajo.`,
      },
      {
        q: '¿Cuántas fotos carnet de 4 × 4 caben en una hoja A4?',
        a: `${num(f.id4Cut)}, con márgenes de ${mm(f.margin)} y ${mm(f.gap)} de separación para cortarlas. Sin separación, ${num(f.id4Tight)}.`,
      },
      {
        q: '¿Cuántas fotos tamaño pasaporte caben en una hoja Carta?',
        a: `De ${size(f.passport.w, f.passport.h)}, con márgenes de ${mm(f.margin)} y ${mm(f.gap)} de separación: ${num(f.passport.count)}${f.passport.grid < f.passport.count ? `, mezclando fotos derechas y rotadas; en filas y columnas, ${num(f.passport.grid)}` : ''}.`,
      },
      {
        q: '¿Por qué otras calculadoras dan otro número?',
        a: 'Porque suponen otros márgenes, otra separación u otra medida exacta, o no rotan fotos. Aquí puedes cambiar cada dato y ver cómo quedan las fotos en la hoja.',
      },
    ],
  });
}
