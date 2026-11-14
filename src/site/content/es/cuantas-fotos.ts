// «¿Cuántas fotos caben en una hoja?»: the calculator (calc.ts, run again in
// the browser by calculator.ts) and reference tables.

import { PHOTO_SIZES } from '../../../core/crop.js';
import { PAPER_GROUPS, PAPERS } from '../../../core/papers.js';
import type { PaperId } from '../../../core/types.ts';
import { t, type CopyKey } from '../../../copy/index.ts';
import { calc, type CalcState, type CalcTexts } from '../../calc.ts';
import { guide } from '../../guide.ts';
import { esc, scriptJson } from '../../html.ts';
import { app, capacity, MAX_ITEMS, mm, num, paperName, photo, photoName, size, table, ui } from '../../kit.ts';
import { PATHS } from './paths.ts';

/** What the form shows first (and the page shows the result of). */
export const CALC_START: CalcState = { paper: 'A4', landscape: false, photo: '10x15', w: 50, h: 50, margin: 5, gap: 2, rotate: true };

export const calcTexts = (): CalcTexts => ({
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

const option = (value: string, label: string, selected: boolean) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;

function calculator(state: CalcState) {
  const texts = calcTexts();
  const result = calc(state, texts);
  const papers = PAPER_GROUPS.map(
    (group) =>
      `<optgroup label="${esc(t(`papers.groups.${group}` as CopyKey))}">${PAPERS.filter((p) => p.group === group)
        .map((p) => option(p.id, t('papers.option', { paper: paperName(p.id), size: size(p.w, p.h) }), p.id === state.paper))
        .join('')}</optgroup>`
  ).join('');
  const groups = [...new Set(PHOTO_SIZES.map((s) => s.group))];
  const photos =
    groups
      .map(
        (group) =>
          `<optgroup label="${esc(t(`crop.groups.${group}` as CopyKey))}">${PHOTO_SIZES.filter((s) => s.group === group)
            .map((s) => option(s.id, t('crop.option', { name: photoName(s.id), size: size(s.w, s.h) }), s.id === state.photo))
            .join('')}</optgroup>`
      )
      .join('') + option('custom', 'Otra medida', state.photo === 'custom');
  const number = (id: string, label: string, value: number, [min, max]: [number, number], hiddenBox = false) =>
    `<div class="field"${hiddenBox ? ` id="calc-custom-${id.slice(-1)}" hidden` : ''}><label for="${id}">${esc(label)}</label><input id="${id}" name="${id.slice(5)}" type="number" inputmode="decimal" min="${min}" max="${max}" step="any" value="${value}"></div>`;
  const custom = state.photo !== 'custom';
  return `<section class="calc" aria-label="Calculadora">
<form id="calc" class="calc-form">
<div class="field"><label for="calc-paper">${esc(ui('props.sheet'))}</label><select id="calc-paper" name="paper">${papers}</select></div>
<div class="field"><label for="calc-orientation">${esc(ui('props.orientation'))}</label><select id="calc-orientation" name="orientation">${option('portrait', ui('props.portrait'), !state.landscape)}${option('landscape', ui('props.landscape'), state.landscape)}</select></div>
<div class="field field-wide"><label for="calc-photo">${esc(ui('crop.size'))}</label><select id="calc-photo" name="photo">${photos}</select></div>
${number('calc-w', 'Ancho de la foto, en mm', state.w, [5, 1000], custom)}
${number('calc-h', 'Alto de la foto, en mm', state.h, [5, 1000], custom)}
${number('calc-margin', `${ui('props.margin')}, en mm`, state.margin, [0, 50])}
${number('calc-gap', `${ui('props.gap')} entre fotos, en mm`, state.gap, [0, 50])}
<label class="check"><input id="calc-rotate" name="rotate" type="checkbox"${state.rotate ? ' checked' : ''}>${esc(ui('props.rotate'))}</label>
</form>
<noscript><p>La calculadora necesita JavaScript. Las tablas de abajo tienen las medidas más usadas.</p></noscript>
<div class="calc-result">
<div aria-live="polite" aria-atomic="true"><p id="calc-count" class="calc-count">${result.countHtml}</p><p id="calc-summary" class="calc-summary">${esc(result.summary)}</p></div>
<p id="calc-note" class="calc-note">${esc(result.note)}</p>
<div id="calc-figure">${result.svg}</div>
<a id="calc-open" class="btn btn-primary" href="${esc(result.href)}">Abrir en ${esc(app)} con esta hoja</a>
</div>
</section>
<script type="application/json" id="calc-texts">${scriptJson(texts)}</script>`;
}

/** A fact a sentence below relies on; if the packer ever says otherwise, the build stops instead of publishing a wrong sentence. */
function expect(actual: number, expected: number, what: string) {
  if (actual !== expected) throw new Error(`The calculator page says ${what} is ${expected}, but the packer now says ${actual}: rewrite the sentence`);
  return actual;
}

export function howMany() {
  const margin = 5;
  const gap = 2;
  const papers: PaperId[] = ['A4', 'letter', 'legal'];
  const rows = PHOTO_SIZES.map((s) => [`${photoName(s.id)} <span class="muted">(${size(s.w, s.h)})</span>`, ...papers.map((paper) => num(capacity(s, { paper, margin, gap }).count))]);

  const tenByFifteen = photo('10x15');
  const a4Wide = capacity(tenByFifteen, { paper: 'A4', margin: 5, gap: 0 }).count;
  const a4Narrow = expect(capacity(tenByFifteen, { paper: 'A4', margin: 3, gap: 0 }).count, 3, '10 × 15 on A4 with a 3 mm margin');
  const id4 = photo('id-4x4');
  const id4Cut = capacity(id4, { paper: 'A4', margin, gap }).count;
  const id4Tight = capacity(id4, { paper: 'A4', margin, gap: 0 }).count;
  const passport = capacity(photo('passport-35x45'), { paper: 'letter', margin, gap });

  return guide({
    id: 'how-many',
    lang: 'es',
    path: PATHS.howMany,
    title: `¿Cuántas fotos caben en una hoja? Calculadora · ${app}`,
    description: `Calcula cuántas fotos de 10 × 15, carnet, pasaporte u otra medida caben en una hoja A4, Carta u Oficio con tus márgenes, y abre la hoja en el editor.`,
    h1: '¿Cuántas fotos caben en una hoja?',
    crumb: 'Cuántas fotos caben en una hoja',
    lead: `Elige el papel, la medida de las fotos, el margen y la separación. La calculadora usa el mismo método que el botón ${ui('bar.arrange')} de ${app}, así que el número es el que vas a obtener en el editor.`,
    ctas: [],
    feature: calculator(CALC_START),
    scripts: ['calculator'],
    sections: [
      {
        h2: 'Fotos por hoja en los papeles más usados',
        html: table(
          [{ head: 'Foto' }, ...papers.map((p) => ({ head: paperName(p), num: true }))],
          rows,
          `Con márgenes de ${mm(margin)}, ${mm(gap)} de separación entre fotos y ${ui('props.rotate')}. Es lo que pone ${ui('bar.arrange')}.`
        ),
      },
      {
        h2: 'Qué cambia el resultado',
        html: `<ul>
<li><strong>El margen.</strong> Muchas impresoras no imprimen hasta el borde del papel. Con un margen más pequeño entran más fotos, pero solo si tu impresora llega hasta ahí.</li>
<li><strong>La separación.</strong> Unos milímetros entre fotos hacen más fácil cortarlas, aunque a veces entra una menos.</li>
<li><strong>La rotación.</strong> Con ${ui('props.rotate')}, ${app} puede rotar algunas fotos para que entren más.</li>
<li><strong>La medida exacta.</strong> En ${app}, la foto ${photoName('10x15')} mide ${size(tenByFifteen.w, tenByFifteen.h)}: la medida real de las copias de laboratorio, 4 × 6 pulgadas. Unos milímetros cambian el resultado.</li>
</ul>`,
      },
    ],
    faq: [
      {
        q: `¿Cuántas fotos ${photoName('10x15')} entran en una hoja A4?`,
        a: `Con márgenes de ${mm(5)}, ${num(a4Wide)}. Con márgenes de ${mm(3)} o menos y sin separación, ${num(a4Narrow)}: dos verticales y una horizontal debajo.`,
      },
      {
        q: '¿Cuántas fotos carnet de 4 × 4 caben en una hoja A4?',
        a: `${num(id4Cut)}, con márgenes de ${mm(margin)} y ${mm(gap)} de separación para cortarlas. Sin separación, ${num(id4Tight)}.`,
      },
      {
        q: '¿Cuántas fotos tamaño pasaporte caben en una hoja Carta?',
        a: `De ${size(35, 45)}, con márgenes de ${mm(margin)} y ${mm(gap)} de separación: ${num(passport.count)}${passport.grid.count < passport.count ? `, mezclando fotos derechas y rotadas; en filas y columnas, ${num(passport.grid.count)}` : ''}.`,
      },
      {
        q: '¿Por qué otras calculadoras dan otro número?',
        a: 'Porque suponen otros márgenes, otra separación u otra medida exacta, o no rotan fotos. Aquí puedes cambiar cada dato y ver cómo quedan las fotos en la hoja.',
      },
    ],
  });
}
