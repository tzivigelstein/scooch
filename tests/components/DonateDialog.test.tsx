// @vitest-environment jsdom
// The donation dialog (Dialogs + DonateDialog, opened with askDonation): its
// copy, its accessible name and description, the CTA as a real link, and how
// each way of closing it resolves (its «via»). What only a browser does (a
// real :modal, the backdrop's geometry, Esc's focus, the tab that opens) is
// in e2e/specs/donation.spec.ts.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { Dialogs } from '../../src/components/dialogs/Dialogs.tsx';
import { askDonation, finishDonation, isDonationOpen, type DonateVia } from '../../src/components/dialogs/donate.ts';

const PATREON = 'https://www.patreon.com/ejemplo';

// jsdom has no showModal: the open attribute and the close event are enough here.
beforeAll(() => {
  const proto = HTMLDialogElement.prototype;
  proto.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close ??= function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

let asked: Promise<DonateVia>;

beforeEach(async () => {
  window.history.replaceState(null, '', `/?donar=${encodeURIComponent(PATREON)}`);
  render(
    <>
      <button type="button" id="export">
        Descargar PDF
      </button>
      <Dialogs />
    </>
  );
  screen.getByRole('button', { name: 'Descargar PDF' }).focus();
  act(() => {
    asked = askDonation();
  });
  await vi.waitFor(() => expect(document.getElementById('donate-title')).not.toBeNull());
});
afterEach(() => {
  if (isDonationOpen()) act(() => finishDonation('close'));
  cleanup();
});

const dialog = () => document.getElementById('donate') as HTMLDialogElement;
const textOf = (id: string) => document.getElementById(id)!.textContent;

describe('donation dialog: what it says', () => {
  test('title and body, not depending on the gender of a name', () => {
    expect(textOf('donate-title')).toBe('¿Te ahorró tiempo y papel?');
    expect([...document.querySelectorAll('#donate-body p')].map((p) => p.textContent)).toEqual([
      'Scooch es gratis, sin anuncios ni marcas de agua, y no pide cuenta. Se mantiene gracias a personas como tú.',
      'Si te sirvió, con un aporte en Patreon ayudas a que siga siendo gratis y a que mejore.',
    ]);
  });

  test('benefits: no ads, no watermarks, private', () => {
    expect(within(document.getElementById('donate-benefits')!).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Sin anuncios', 'Sin marcas de agua', 'Tus archivos no salen del navegador']);
  });

  test('thanks without guilt, and «Seguir sin aportar» and «No volver a mostrar» offered', () => {
    expect(textOf('donate-thanks')).toBe('Gracias por usar Scooch, con o sin aporte');
    expect(screen.getByRole('button', { name: 'Seguir sin aportar' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'No volver a mostrar en este dispositivo' })).toHaveProperty('checked', false);
  });

  test('the modal’s accessible name is its title and its description the body', () => {
    const modal = screen.getByRole('dialog', { name: '¿Te ahorró tiempo y papel?' });
    expect(modal).toBe(dialog());
    expect(modal.getAttribute('aria-labelledby')).toBe('donate-title');
    expect(modal.getAttribute('aria-describedby')).toBe('donate-body');
  });

  test('the focus starts on the title, not on the link to Patreon', () => {
    expect(document.activeElement?.id).toBe('donate-title');
  });

  test('the CTA is a real link to the URL, in another tab, with noopener noreferrer', () => {
    const cta = screen.getByRole('link', { name: 'Aportar en Patreon' }) as HTMLAnchorElement;
    expect(cta.tagName).toBe('A');
    expect(cta.href).toBe(PATREON);
    expect(cta.target).toBe('_blank');
    expect(cta.rel.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    expect(textOf('donate-note')).toBe('Se abre en otra pestaña y tu PDF sigue en curso');
  });
});

describe('donation dialog: every way of closing it continues, saying how', () => {
  const closed = async (via: DonateVia) => {
    expect(await asked).toBe(via);
    expect(isDonationOpen()).toBe(false);
    expect(dialog().hasAttribute('open')).toBe(false);
  };

  test('the X («Cerrar y seguir sin aportar») closes it, via close, and the focus goes back to who opened it', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar y seguir sin aportar' }));
    await closed('close');
    expect(document.activeElement?.id).toBe('export');
  });

  test('a click on the backdrop closes it and the export goes on', async () => {
    // Outside the box (jsdom's box is empty, at 0, 0).
    fireEvent.click(dialog(), { clientX: 500, clientY: 500 });
    await asked; // what the export waits for (its via: see the next test)
    expect(isDonationOpen()).toBe(false);
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  // Bug: DonateVia and askDonation's doc promise 'backdrop' for a click on the
  // backdrop, but Dialog sends every close but Esc to onClose, which Dialogs
  // wires to finishDonation('close'): nothing ever resolves 'backdrop'.
  test.fails('a click on the backdrop resolves via backdrop, as askDonation documents', async () => {
    fireEvent.click(dialog(), { clientX: 500, clientY: 500 });
    await closed('backdrop');
  });

  test('a click inside the box doesn’t close it', () => {
    fireEvent.click(document.getElementById('donate-body')!, { clientX: 500, clientY: 500 });
    expect(isDonationOpen()).toBe(true);
  });

  test('Esc (the dialog’s cancel) closes it, via esc', async () => {
    fireEvent(dialog(), new Event('cancel', { cancelable: true }));
    await closed('esc');
  });

  test('«Seguir sin aportar» closes it, via skip', async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Seguir sin aportar' }));
    await closed('skip');
  });

  test('the CTA closes it, via cta', async () => {
    const cta = screen.getByRole('link', { name: 'Aportar en Patreon' });
    // jsdom can't open the tab: only the click's handler matters here.
    cta.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(cta);
    await closed('cta');
  });
});
