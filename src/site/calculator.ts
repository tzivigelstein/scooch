// The calculator's script, on «¿Cuántas fotos caben en una hoja?»: reads the
// form, recomputes with calc.ts and updates the result. The page already
// carries the result for the form's first values, so nothing moves on load.

import type { PaperId } from '../core/types.ts';
import { calc, type CalcState, type CalcTexts } from './calc.ts';

const form = document.getElementById('calc') as HTMLFormElement | null;
const data = document.getElementById('calc-texts');

if (form && data) {
  const texts = JSON.parse(data.textContent ?? '{}') as CalcTexts;
  const field = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const select = (id: string) => field<HTMLSelectElement>(id).value;
  // An empty or unreadable number keeps the last value that could be read.
  const last = new Map<string, number>();
  const number = (id: string) => {
    const value = field<HTMLInputElement>(id).valueAsNumber;
    if (Number.isFinite(value)) last.set(id, value);
    return last.get(id) ?? 0;
  };
  const custom = [field<HTMLElement>('calc-custom-w'), field<HTMLElement>('calc-custom-h')];

  const read = (): CalcState => ({
    paper: select('calc-paper') as PaperId,
    landscape: select('calc-orientation') === 'landscape',
    photo: select('calc-photo'),
    w: number('calc-w'),
    h: number('calc-h'),
    margin: number('calc-margin'),
    gap: number('calc-gap'),
    rotate: field<HTMLInputElement>('calc-rotate').checked,
  });

  const update = () => {
    const state = read();
    for (const box of custom) box.hidden = state.photo !== 'custom';
    const result = calc(state, texts);
    const set = (id: string, html: string) => {
      const el = field<HTMLElement>(id);
      if (el.innerHTML !== html) el.innerHTML = html;
    };
    set('calc-count', result.countHtml);
    set('calc-summary', result.summary);
    set('calc-note', result.note);
    set('calc-figure', result.svg);
    field<HTMLAnchorElement>('calc-open').href = result.href;
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  });
  form.addEventListener('change', () => {
    clearTimeout(timer);
    update();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  // The browser may have put back other values (going back to the page).
  update();
}
