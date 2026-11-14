// @vitest-environment jsdom
// The summary after printing, as a dialog: what each line says (and when it
// doesn't show), the milestone, the suggestion with its «Acomodar» link, the
// request for a donation (a real link that opens apart, never again after «No
// volver a mostrar»), «Listo» focused, the ways of closing it and where the
// focus goes back, and «No lo imprimí» (only after printing a PDF that added
// to the total).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PrintSummary } from '../../src/components/feedback/PrintSummary.tsx';
import { showSummary, usePrintSummary, type PrintSummary as Summary } from '../../src/components/feedback/printSummary.ts';
import { arrangeAll } from '../../src/state/actions/edit.ts';

vi.mock('../../src/components/dialogs/donate.ts', () => ({ donateUrl: () => 'https://www.patreon.com/ejemplo', neverAskDonation: vi.fn() }));
vi.mock('../../src/state/actions/edit.ts', () => ({ arrangeAll: vi.fn() }));

const nb = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');
const base: Summary = { kind: 'print', share: 0.82, used: 2, baseline: 7, saved: 5, equivalent: { kind: 'grams', value: 24.9 }, total: 34, milestone: null, suggest: false, ask: false, key: 'pdf-1', added: 5 };
const show = (changes: Partial<Summary> = {}, returnTo: Element | null = document.getElementById('print')) => act(() => showSummary({ ...base, ...changes }, returnTo));
const lines = () => [...document.querySelectorAll('#print-summary p')].map((p) => nb(p.textContent));
const isOpen = () => document.getElementById('print-summary')!.hasAttribute('open');

beforeAll(() => {
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
  test('a dialog named «Resumen del PDF»: usage (with its ring), 2 sheets instead of 7 with the baseline in small print, one equivalent and the total; «Listo» focused', () => {
    show();
    const dialog = screen.getByRole('dialog', { name: 'Resumen del PDF' });
    expect(lines()).toEqual([
      '82 % de las hojas aprovechadas',
      'Usaste 2 hojas en lugar de 7',
      'Comparado con imprimir cada pieza en su propia hoja',
      'Son unos 25 g de papel menos',
      'Llevas 34 hojas ahorradas',
    ]);
    expect(nb(dialog.querySelector('.ring-label')?.textContent)).toBe('82 %');
    // The ring is decorative: the usage line says it, and the dialog is described by those lines.
    expect(dialog.querySelector('.summary-ring')?.getAttribute('aria-hidden')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBe('summary-lines');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Listo' }));
  });

  test('where the PDF went, when not to the print dialog, first (and in the description)', () => {
    show({ kind: 'download', note: 'Se descargó scooch-a4.pdf' });
    expect(lines()[0]).toBe('Se descargó scooch-a4.pdf');
    expect(document.getElementById('print-summary')?.getAttribute('aria-describedby')).toBe('summary-note summary-lines');
  });

  test('the other equivalents: a share of a ream and a stack', () => {
    show({ equivalent: { kind: 'ream', value: 0.01 } });
    expect(lines()).toContain('Es el 1 % de una resma de 500 hojas');
    act(() => usePrintSummary.setState({ summary: { ...base, equivalent: { kind: 'stack', value: 0.5 } } }));
    expect(lines()).toContain('Es una pila de 0,5 mm menos');
  });

  test('nothing saved: no savings, no equivalent, never a scolding; one sheet: «de la hoja»', () => {
    show({ used: 1, baseline: 1, saved: 0, equivalent: null, share: 0.35, total: 0, added: 0 });
    expect(lines()).toEqual(['35 % de la hoja aprovechada']);
  });

  test('a milestone: its own line instead of the total, and the ring says so for its brief glow', () => {
    show({ total: 52, milestone: 50 });
    expect(lines()).toContain('Llegaste a 50 hojas ahorradas');
    expect(lines()).not.toContain('Llevas 52 hojas ahorradas');
    expect(document.querySelector<HTMLElement>('#print-summary .summary-ring')?.dataset.milestone).toBe('50');
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

describe('«No lo imprimí»', () => {
  test('only after printing, and only when this PDF added to the total', () => {
    show();
    expect(screen.getByRole('button', { name: 'No lo imprimí' })).toBeTruthy();
    act(() => usePrintSummary.setState({ summary: { ...base, kind: 'download' } }));
    expect(screen.queryByRole('button', { name: 'No lo imprimí' })).toBeNull();
    act(() => usePrintSummary.setState({ summary: { ...base, added: 0 } }));
    expect(screen.queryByRole('button', { name: 'No lo imprimí' }), 'counted before, or saved nothing').toBeNull();
  });

  test('takes this PDF’s sheets back out of the total and closes, back to «Imprimir»', () => {
    localStorage.setItem('scooch:savings', JSON.stringify({ v: 2, sheets: 34, turn: 3, counted: ['pdf-0', 'pdf-1'] }));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'No lo imprimí' }));
    expect(JSON.parse(localStorage.getItem('scooch:savings')!)).toEqual({ v: 2, sheets: 29, turn: 3, counted: ['pdf-0'] });
    expect(isOpen()).toBe(false);
    expect(document.activeElement?.id).toBe('print');
  });
});
