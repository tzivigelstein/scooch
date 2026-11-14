// @vitest-environment jsdom
// The advice before printing or downloading, in its dialog: what it says (the
// two choices with the document's paper), its drawing (decorative), the
// button that goes on, Esc and «Cancelar» that don't, focus on the button and
// back to who opened it, and «No volver a mostrar» (Preferencias turns it
// back on).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { Dialogs } from '../../src/components/dialogs/Dialogs.tsx';
import { PrintTipContent } from '../../src/components/dialogs/lazy.ts';
import { askTip, usePrintTip } from '../../src/components/dialogs/printTip.ts';
import { setDocument } from '../../src/state/document.ts';
import { getPrefs } from '../../src/state/prefs.ts';
import { resetState } from '../support/state.ts';

const nb = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');

beforeAll(async () => {
  // jsdom's <dialog> can't show modally.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  await PrintTipContent.preload();
});

beforeEach(() => {
  resetState();
  localStorage.clear();
  document.body.innerHTML = '<button id="print">Imprimir</button>';
  render(<Dialogs />, { container: document.body.appendChild(document.createElement('div')) });
});
afterEach(() => {
  usePrintTip.getState().request?.resolve(false);
  usePrintTip.setState({ request: null });
  cleanup();
});

/** Opens the advice from the Print button; `answer` resolves with how it closed. */
async function open(kind: 'print' | 'download') {
  document.getElementById('print')!.focus();
  const answer = askTip(kind);
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return { answer };
}

describe('the advice before printing', () => {
  test('«Antes de imprimir»: the scale and the document’s paper, as two steps; focus on «Imprimir»', async () => {
    setDocument({ paper: 'letter', landscape: true });
    await open('print');
    const dialog = screen.getByRole('dialog', { name: 'Antes de imprimir' });
    expect(nb(dialog.querySelector('#print-tip-lead')?.textContent)).toBe('En el diálogo de impresión, elige:');
    expect([...dialog.querySelectorAll('#print-tip-steps li')].map((li) => nb(li.textContent))).toEqual(['Escala: «Tamaño real» o «100 %»', 'Papel: Carta horizontal']);
    expect(dialog.getAttribute('aria-describedby')).toBe('print-tip-steps');
    expect(document.activeElement?.id).toBe('print-tip-go');
    expect(document.activeElement?.textContent).toBe('Imprimir');
    // The drawing is decorative: the steps say it.
    expect(dialog.querySelector('svg.tip-drawing')?.getAttribute('aria-hidden')).toBe('true');
    expect(nb(dialog.querySelector('.tip-scale-from')?.textContent)).toBe('Ajustar a la página');
    expect(nb(dialog.querySelector('.tip-scale-to')?.textContent)).toBe('100 %');
  });

  test('downloading: «Antes de descargar», «Cuando lo imprimas…» and «Descargar»', async () => {
    await open('download');
    const dialog = screen.getByRole('dialog', { name: 'Antes de descargar' });
    expect(nb(dialog.querySelector('#print-tip-lead')?.textContent)).toBe('Cuando lo imprimas, elige:');
    expect(screen.getByRole('button', { name: 'Descargar' })).toBe(document.activeElement);
  });

  test('its button goes on; «Cancelar» and Esc don’t; the focus goes back to «Imprimir»', async () => {
    expect(await openAndClick('#print-tip-go')).toBe(true);
    expect(await openAndClick('#print-tip-cancel')).toBe(false);
    const { answer } = await open('print');
    fireEvent(document.getElementById('print-tip')!, new Event('cancel', { cancelable: true }));
    expect(await answer).toBe(false);
    expect(document.activeElement?.id).toBe('print');
  });

  test('«No volver a mostrar» checked turns it off in this browser', async () => {
    const { answer } = await open('print');
    fireEvent.click(screen.getByRole('checkbox', { name: 'No volver a mostrar' }));
    fireEvent.click(document.getElementById('print-tip-go')!);
    expect(await answer).toBe(true);
    expect(getPrefs().printing.tip).toBe(false);
    expect(JSON.parse(localStorage.getItem('scooch:print-preferences')!)).toEqual({ v: 1, tip: false, summary: true });
  });
});

async function openAndClick(selector: string) {
  const { answer } = await open('print');
  fireEvent.click(document.querySelector(selector)!);
  return answer;
}
