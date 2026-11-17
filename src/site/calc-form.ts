// The calculator of «¿Cuántas fotos caben en una hoja?» as its page carries
// it: the form, the result for its first values (calc.ts) and the texts the
// calculator's script recomputes with (calculator.ts). The same form in every
// language; only its labels and texts change.

import { PHOTO_SIZES } from '../core/crop.js';
import { LENGTH_RANGE, PHOTO_RANGE } from '../core/deeplink.js';
import { PAPER_GROUPS, PAPERS } from '../core/papers.js';
import type { CopyKey } from '../copy/index.ts';
import { calc, type CalcState, type CalcTexts } from './calc.ts';
import { esc, scriptJson } from './html.ts';
import type { Kit } from './kit.ts';

/** The calculator's own words, besides the app's names for its fields. */
export interface CalcLabels {
  /** The calculator's accessible name. */
  name: string;
  /** The photo size option for a width and height of one's own. */
  custom: string;
  width: string;
  height: string;
  margin: string;
  gap: string;
  /** What shows without JavaScript. */
  noscript: string;
  /** The button that opens the editor with the sheet. */
  open: string;
}

const option = (value: string, label: string, selected: boolean) => `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;

export function calculatorHtml(k: Kit, state: CalcState, texts: CalcTexts, labels: CalcLabels) {
  const { ui, paperName, photoName, size } = k;
  const result = calc(state, texts);
  const papers = PAPER_GROUPS.map(
    (group) =>
      `<optgroup label="${esc(ui(`papers.groups.${group}` as CopyKey))}">${PAPERS.filter((p) => p.group === group)
        .map((p) => option(p.id, ui('papers.option', { paper: paperName(p.id), size: size(p.w, p.h) }), p.id === state.paper))
        .join('')}</optgroup>`
  ).join('');
  const groups = [...new Set(PHOTO_SIZES.map((s) => s.group))];
  const photos =
    groups
      .map(
        (group) =>
          `<optgroup label="${esc(ui(`crop.groups.${group}` as CopyKey))}">${PHOTO_SIZES.filter((s) => s.group === group)
            .map((s) => option(s.id, ui('crop.option', { name: photoName(s.id), size: size(s.w, s.h) }), s.id === state.photo))
            .join('')}</optgroup>`
      )
      .join('') + option('custom', labels.custom, state.photo === 'custom');
  const number = (id: string, label: string, value: number, [min, max]: readonly number[], hiddenBox = false) =>
    `<div class="field"${hiddenBox ? ` id="calc-custom-${id.slice(-1)}" hidden` : ''}><label for="${id}">${esc(label)}</label><input id="${id}" name="${id.slice(5)}" type="number" inputmode="decimal" min="${min}" max="${max}" step="any" value="${value}"></div>`;
  const custom = state.photo !== 'custom';
  return `<section class="calc" aria-label="${esc(labels.name)}">
<form id="calc" class="calc-form">
<div class="field"><label for="calc-paper">${esc(ui('props.sheet'))}</label><select id="calc-paper" name="paper">${papers}</select></div>
<div class="field"><label for="calc-orientation">${esc(ui('props.orientation'))}</label><select id="calc-orientation" name="orientation">${option('portrait', ui('props.portrait'), !state.landscape)}${option('landscape', ui('props.landscape'), state.landscape)}</select></div>
<div class="field field-wide"><label for="calc-photo">${esc(ui('crop.size'))}</label><select id="calc-photo" name="photo">${photos}</select></div>
${number('calc-w', labels.width, state.w, PHOTO_RANGE, custom)}
${number('calc-h', labels.height, state.h, PHOTO_RANGE, custom)}
${number('calc-margin', labels.margin, state.margin, LENGTH_RANGE)}
${number('calc-gap', labels.gap, state.gap, LENGTH_RANGE)}
<label class="check"><input id="calc-rotate" name="rotate" type="checkbox"${state.rotate ? ' checked' : ''}>${esc(ui('props.rotate'))}</label>
</form>
<noscript><p>${esc(labels.noscript)}</p></noscript>
<div class="calc-result">
<div aria-live="polite" aria-atomic="true"><p id="calc-count" class="calc-count">${result.countHtml}</p><p id="calc-summary" class="calc-summary">${esc(result.summary)}</p></div>
<p id="calc-note" class="calc-note">${esc(result.note)}</p>
<div id="calc-figure">${result.svg}</div>
<a id="calc-open" class="btn btn-primary" href="${esc(result.href)}">${esc(labels.open)}</a>
</div>
</section>
<script type="application/json" id="calc-texts">${scriptJson(texts)}</script>`;
}
