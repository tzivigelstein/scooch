// @vitest-environment jsdom
// The summary after printing, as a dialog: its title (the sheets saved, or
// that the PDF is ready), the share of paper saved, the comparison drawn with
// sheets (capped, with «+N»), what each line says and when it doesn't show,
// the equivalent (with the total, only when big enough to picture), the
// milestone, the suggestion with its «Acomodar» link, the request for a
// donation (a real link that opens apart, never again after «No volver a
// mostrar»), «Listo» focused, and the ways of closing it and where the focus
// goes back.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PrintSummary } from '../../src/components/feedback/PrintSummary.tsx';
import { showSummary, SummaryContent, usePrintSummary, type PrintSummary as Summary } from '../../src/components/feedback/printSummary.ts';
import { arrangeAll } from '../../src/state/actions/edit.ts';

vi.mock('../../src/components/dialogs/donate.ts', () => ({ donateUrl: () => 'https://www.patreon.com/ejemplo', neverAskDonation: vi.fn() }));
vi.mock('../../src/state/actions/edit.ts', () => ({ arrangeAll: vi.fn() }));

const nb = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');
const base: Summary = {
  kind: 'print',
  share: 0.82,
  used: 2,
  baseline: 7,
  saved: 5,
  equivalent: { kind: 'grams', value: 25 },
  total: 34,
  totalEquivalent: { kind: 'grams', value: 170 },
  milestone: null,
  suggest: false,
  ask: false,
  key: 'pdf-1',
  added: 5,
};
const show = (changes: Partial<Summary> = {}, returnTo: Element | null = document.getElementById('print')) => act(() => showSummary({ ...base, ...changes }, returnTo));
const update = (changes: Partial<Summary>) => act(() => usePrintSummary.setState({ summary: { ...base, ...changes } }));
/** The paragraphs that show (not the one only for screen readers). */
const lines = () => [...document.querySelectorAll('#print-summary p:not(.sr-only)')].map((p) => nb(p.textContent));
const isOpen = () => document.getElementById('print-summary')!.hasAttribute('open');
/** A row of the comparison: its name, count, sheets drawn full and saved, and its «+N». */
const row = (which: 'is-baseline' | 'is-app') => {
  const el = document.querySelector(`#print-summary .compare-row.${which}`)!;
  return {
    name: el.querySelector('.compare-name')?.textContent,
    count: el.querySelector('.compare-count')?.textContent,
    full: el.querySelectorAll('.paper:not(.is-saved)').length,
    saved: el.querySelectorAll('.paper.is-saved').length,
    more: el.querySelector('.compare-more')?.textContent ?? null,
  };
};

beforeAll(async () => {
  // What it says loads when the app is idle: loaded here, it shows at once.
  await SummaryContent.preload();
  // jsdom's <dialog> can't show modally.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '<button id="print">Imprimir</button><button id="export">Descargar PDF</button><div class="piece" tabindex="0"></div>';
  render(<PrintSummary />, { container: document.body.appendChild(document.createElement('div')) });
});
afterEach(() => {
  act(() => usePrintSummary.setState({ summary: null }));
  cleanup();
});

describe('the summary after printing', () => {
  test('titled with the sheets saved, over the share of paper saved as the big figure, then the usage and the total with its equivalent; «Listo» focused', () => {
    show();
    const dialog = screen.getByRole('dialog', { name: 'Ahorraste 5 hojas' });
    expect(lines()).toEqual(['71 % menos papel', '82 % de las hojas aprovechadas', 'Llevas 34 hojas ahorradas: unos 170 g de papel']);
    expect(nb(dialog.querySelector('.figure-value')?.textContent), '5 of 7, rounded down').toBe('71 %');
    expect(nb(dialog.querySelector('.sr-only')?.textContent)).toBe('Usaste 2 hojas en lugar de 7');
    expect(dialog.getAttribute('aria-describedby')).toBe('summary-figure summary-lines');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Listo' }));
  });

  test('the comparison: one sheet per piece against the sheets used, the saved ones as ghosts, with the counts in text; decorative', () => {
    show();
    expect(row('is-baseline')).toEqual({ name: 'Una pieza por hoja', count: '7 hojas', full: 7, saved: 0, more: null });
    expect(row('is-app')).toEqual({ name: 'Con Scooch', count: '2 hojas', full: 2, saved: 5, more: null });
    expect(document.querySelector('#print-summary .summary-compare')?.getAttribute('aria-hidden')).toBe('true');
  });

  test.each([
    [12, 1, { full: 12, saved: 0, more: null }, { full: 1, saved: 11, more: null }],
    [30, 4, { full: 12, saved: 0, more: '+18' }, { full: 4, saved: 8, more: null }],
    [40, 15, { full: 12, saved: 0, more: '+28' }, { full: 12, saved: 0, more: '+3' }],
  ])('%d pieces on %d sheets: at most 12 sheets drawn a row, the rest as «+N»', (baseline, used, baselineRow, appRow) => {
    show({ baseline, used, saved: baseline - used });
    expect(row('is-baseline')).toMatchObject({ count: `${baseline} hojas`, ...baselineRow });
    expect(row('is-app')).toMatchObject({ count: used === 1 ? '1 hoja' : `${used} hojas`, ...appRow });
  });

  test('where the PDF went, when not to the print dialog, first in the body (and in the description)', () => {
    show({ kind: 'download', note: 'Se descargó scooch-a4.pdf' });
    expect(lines()[1]).toBe('Se descargó scooch-a4.pdf');
    expect(document.getElementById('print-summary')?.getAttribute('aria-describedby')).toBe('summary-figure summary-note summary-lines');
  });

  test('the equivalent goes with the total; this PDF’s shows only without a total, and none when too small to picture', () => {
    show();
    expect(lines()).not.toContain('Equivale a unos 25 g de papel');
    update({ total: 0, totalEquivalent: null });
    expect(lines()).toContain('Equivale a unos 25 g de papel');
    update({ total: 0, totalEquivalent: null, equivalent: null });
    expect(lines().filter((line) => line.startsWith('Equivale'))).toEqual([]);
    update({ total: 1, totalEquivalent: null, equivalent: null });
    expect(lines()).toContain('Llevas 1 hoja ahorrada');
  });

  test.each([
    [{ kind: 'kg', value: 2.5 }, 'Llevas 34 hojas ahorradas: unos 2,5 kg de papel'],
    [{ kind: 'stack', value: 1.4 }, 'Llevas 34 hojas ahorradas: una pila de papel de 1,4 cm'],
    [{ kind: 'reams', value: 1 }, 'Llevas 34 hojas ahorradas: 1 resma de 500 hojas'],
    [{ kind: 'reams', value: 1.2 }, 'Llevas 34 hojas ahorradas: 1,2 resmas de 500 hojas'],
  ] as const)('the other equivalents: %o', (totalEquivalent, line) => {
    show({ totalEquivalent });
    expect(lines()).toContain(line);
  });

  test('a first print, whose sheets aren’t in the total yet: its own figures, and no total line while the total is 0', () => {
    show({ total: 0, totalEquivalent: null });
    expect(lines()).toEqual(['71 % menos papel', '82 % de las hojas aprovechadas', 'Equivale a unos 25 g de papel']);
  });

  test('nothing saved: titled that the PDF is ready, with no figure, comparison or equivalent, never a scolding; one sheet: «de la hoja»', () => {
    show({ used: 1, baseline: 1, saved: 0, equivalent: null, share: 0.35, total: 0, totalEquivalent: null, added: 0 });
    expect(screen.getByRole('dialog', { name: 'El PDF está listo' })).toBeTruthy();
    expect(lines()).toEqual(['35 % de la hoja aprovechada']);
    expect(document.querySelector('#print-summary .summary-compare, #summary-figure, #print-summary .sr-only')).toBeNull();
  });

  test('a milestone: a badge of its own, with the total', () => {
    show({ total: 52, totalEquivalent: null, milestone: 50 });
    expect(lines()).toEqual(expect.arrayContaining(['Llegaste a 50 hojas ahorradas', 'Llevas 52 hojas ahorradas']));
    expect(document.getElementById('summary-milestone')?.className).toBe('summary-milestone');
  });

  test('the suggestion, only when it surely saves a sheet, with «Acomodar» as a link that arranges', () => {
    show({ suggest: true });
    expect(lines()).toContain('Con Acomodar podrían entrar en una hoja menos');
    fireEvent.click(screen.getByRole('button', { name: 'Acomodar' }));
    expect(arrangeAll).toHaveBeenCalled();
    expect(isOpen()).toBe(false);
  });

  test('the request for a donation: a link that opens apart, and «No volver a mostrar» that hides it', () => {
    show({ ask: true });
    expect(screen.getByRole('region', { name: '¿Te ahorró tiempo y papel?' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Aportar en Patreon' });
    expect(link.getAttribute('href')).toBe('https://www.patreon.com/ejemplo');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'No volver a mostrar' }));
    expect(screen.queryByRole('link', { name: 'Aportar en Patreon' })).toBeNull();
    expect(document.activeElement?.id).toBe('summary-done');
  });

  test('without the request, no link', () => {
    show();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('closing the summary', () => {
  test('«Listo», Esc and a click on the backdrop close it, and the focus goes back to who started it', () => {
    const piece = document.querySelector('.piece')!;
    show({}, piece);
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(piece);

    show();
    fireEvent(document.getElementById('print-summary')!, new Event('cancel', { cancelable: true }));
    expect(isOpen()).toBe(false);
    expect(document.activeElement?.id).toBe('print');

    show();
    // Outside the box (jsdom lays nothing out: the box is 0 × 0 at the corner).
    fireEvent.click(document.getElementById('print-summary')!, { clientX: 300, clientY: 300 });
    expect(isOpen()).toBe(false);
    expect(document.activeElement?.id).toBe('print');
  });

  test('with nothing to go back to (a click that didn’t focus), the focus goes to the button of what went out', () => {
    show({ kind: 'download' }, document.body);
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(document.activeElement?.id).toBe('export');
  });
});
