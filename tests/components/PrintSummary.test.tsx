// @vitest-environment jsdom
// The summary after printing, as a card: what each line says (and when it
// doesn't show), the milestone, the suggestion with its «Acomodar» link, the
// request for a donation at its foot (a real link that opens apart, never
// again after «No volver a mostrar») and closing it.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { PrintSummary } from '../../src/components/feedback/PrintSummary.tsx';
import { usePrintSummary, type PrintSummary as Summary } from '../../src/components/feedback/printSummary.ts';
import { arrangeAll } from '../../src/state/actions/edit.ts';

vi.mock('../../src/components/dialogs/donate.ts', () => ({ donateUrl: () => 'https://www.patreon.com/ejemplo', neverAskDonation: vi.fn() }));
vi.mock('../../src/state/actions/edit.ts', () => ({ arrangeAll: vi.fn() }));

const nb = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');
const base: Summary = { kind: 'print', share: 0.82, used: 2, baseline: 7, saved: 5, equivalent: { kind: 'grams', value: 24.9 }, total: 34, milestone: null, suggest: false, ask: false };
const show = (changes: Partial<Summary> = {}) => act(() => usePrintSummary.setState({ summary: { ...base, ...changes } }));
const lines = () => [...document.querySelectorAll('#print-summary p')].map((p) => nb(p.textContent));

beforeEach(() => {
  document.body.innerHTML = '<button id="print">Imprimir</button>';
  render(<PrintSummary />, { container: document.body.appendChild(document.createElement('div')) });
});
afterEach(() => {
  act(() => usePrintSummary.setState({ summary: null }));
  cleanup();
});

describe('the summary after printing', () => {
  test('a named card: usage (with its ring), 2 sheets instead of 7 with the baseline in small print, one equivalent and the total', () => {
    show();
    expect(screen.getByRole('complementary', { name: 'Resumen del PDF' })).toBeTruthy();
    expect(lines()).toEqual([
      '82 % de las hojas aprovechadas',
      'Usaste 2 hojas en lugar de 7',
      'Comparado con imprimir cada pieza en su propia hoja',
      'Son unos 25 g de papel menos',
      'Llevas 34 hojas ahorradas',
    ]);
    expect(nb(document.querySelector('.summary-ring text')?.textContent)).toBe('82 %');
  });

  test('where the PDF went, when not to the print dialog, first', () => {
    show({ kind: 'download', note: 'Se descargó scooch-a4.pdf' });
    expect(lines()[0]).toBe('Se descargó scooch-a4.pdf');
  });

  test('the other equivalents: a share of a ream and a stack', () => {
    show({ equivalent: { kind: 'ream', value: 0.01 } });
    expect(lines()).toContain('Es el 1 % de una resma de 500 hojas');
    show({ equivalent: { kind: 'stack', value: 0.5 } });
    expect(lines()).toContain('Es una pila de 0,5 mm menos');
  });

  test('nothing saved: no savings, no equivalent, never a scolding; one sheet: «de la hoja»', () => {
    show({ used: 1, baseline: 1, saved: 0, equivalent: null, share: 0.35, total: 0 });
    expect(lines()).toEqual(['35 % de la hoja aprovechada']);
  });

  test('a milestone: its own line instead of the total, and the card says so for its brief glow', () => {
    show({ total: 52, milestone: 50 });
    expect(lines()).toContain('Llegaste a 50 hojas ahorradas');
    expect(lines()).not.toContain('Llevas 52 hojas ahorradas');
    expect(document.getElementById('print-summary')?.dataset.milestone).toBe('50');
  });

  test('the suggestion, only when it surely saves a sheet, with «Acomodar» as a link that arranges', () => {
    show({ suggest: true });
    expect(lines()).toContain('Con Acomodar podrían entrar en una hoja menos');
    fireEvent.click(screen.getByRole('button', { name: 'Acomodar' }));
    expect(arrangeAll).toHaveBeenCalled();
    expect(document.getElementById('print-summary')).toBeNull();
  });

  test('the request for a donation: a link that opens apart, and «No volver a mostrar» that hides it', () => {
    show({ ask: true });
    const link = screen.getByRole('link', { name: 'Aportar en Patreon' });
    expect(link.getAttribute('href')).toBe('https://www.patreon.com/ejemplo');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'No volver a mostrar' }));
    expect(screen.queryByRole('link', { name: 'Aportar en Patreon' })).toBeNull();
    expect(document.activeElement?.id).toBe('summary-close');
  });

  test('without the request, no link', () => {
    show();
    expect(screen.queryByRole('link')).toBeNull();
  });

  test('its close button and Esc close it, back to «Imprimir»', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el resumen' }));
    expect(document.getElementById('print-summary')).toBeNull();
    expect(document.activeElement?.id).toBe('print');
    show();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cerrar el resumen' }), { key: 'Escape' });
    expect(document.getElementById('print-summary')).toBeNull();
  });
});
