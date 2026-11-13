// @vitest-environment jsdom
// «Líneas de corte» in the Hoja tab: the modes, the gap note, the stroke
// options (the custom color and its hex field) and the cut margin field.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CutsSection } from '../../src/components/properties-panel/CutsSection.tsx';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { historyDepth } from '../../src/state/history.ts';
import { getPrefs, usePrefs } from '../../src/state/prefs.ts';
import { resetState } from '../support/state.ts';

const cuts = () => getDocument().cuts;
const setMode = (mode: 'none' | 'corners' | 'outline') => act(() => setDocument({ cuts: { ...cuts(), mode } }));
const byId = (id: string) => document.getElementById(id);
const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const nbsp = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');

beforeEach(() => {
  resetState();
  render(
    <>
      <CutsSection />
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
});
afterEach(cleanup);

describe('«Más opciones»', () => {
  test('opening or closing it is remembered in this browser (not in the document), and it opens as it was left', () => {
    setMode('corners');
    const details = byId('cut-options') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    act(() => {
      details.open = true;
      fireEvent(details, new Event('toggle'));
    });
    expect(getPrefs().cutOptions).toBe(true);
    expect(JSON.parse(localStorage.getItem('scooch:panel-sections')!)).toEqual({ v: 2, cutOptions: true });
    expect(historyDepth().undo).toBe(0);
    act(() => usePrefs.setState({ cutOptions: false }));
    expect(details.open).toBe(false);
    act(() => usePrefs.setState({ cutOptions: true }));
    expect(details.open).toBe(true);
  });
});

describe('cut line modes', () => {
  test('a named radio group with tooltips; none by default, with the options hidden', () => {
    const group = screen.getByRole('radiogroup', { name: 'Líneas de corte' });
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => [r.value, r.dataset.tip])).toEqual([
      ['none', 'Sin líneas de corte'],
      ['corners', 'Marcas en las esquinas de cada pieza'],
      ['outline', 'El contorno de cada pieza'],
    ]);
    expect((within(group).getByRole('radio', { name: 'Ninguna' }) as HTMLInputElement).checked).toBe(true);
    expect(byId('cut-options')!.hidden).toBe(true);
    fireEvent.click(within(group).getByRole('radio', { name: 'Esquinas' }));
    expect(cuts().mode).toBe('corners');
    expect(byId('cut-options')!.hidden).toBe(false);
  });

  test('outline: the marks’ length and distance hide; the cut margin stays', () => {
    setMode('corners');
    expect(field('Largo de las marcas, en milímetros').id).toBe('cut-length');
    expect(field('Distancia de las marcas a la esquina, en milímetros').id).toBe('cut-offset');
    setMode('outline');
    expect(screen.queryByRole('textbox', { name: 'Largo de las marcas, en milímetros' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Distancia de las marcas a la esquina, en milímetros' })).toBeNull();
    expect(field('Margen de corte, en milímetros').id).toBe('cut-margin');
  });
});

describe('the gap the marks need', () => {
  test('gap 5 mm < 4 + 1,5: a note offers 5,5 mm; using it sets the gap and the note goes away', () => {
    act(() => setDocument({ gap: 5 }));
    expect(byId('cut-gap-note')).toBeNull();
    setMode('corners');
    expect(nbsp(byId('cut-gap-note')?.textContent)).toMatch(/^Con una separación menor que 5,5 mm, las marcas tocan las piezas vecinas/);
    fireEvent.click(screen.getByRole('button', { name: /^Usar 5,5\smm$/ }));
    expect(getDocument().gap).toBe(5.5);
    expect(byId('cut-gap-note')).toBeNull();
  });

  test('no note for the outline, nor when the gap is enough', () => {
    act(() => setDocument({ gap: 5 }));
    setMode('outline');
    expect(byId('cut-gap-note')).toBeNull();
    act(() => setDocument({ gap: 5.5 }));
    setMode('corners');
    expect(byId('cut-gap-note')).toBeNull();
  });
});

describe('the stroke color', () => {
  beforeEach(() => setMode('corners'));

  test('«Otro» shows a named color picker and a hex field; a valid code sets the color', () => {
    expect(screen.queryByLabelText('Color de las líneas de corte')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Otro' }));
    const picker = screen.getByLabelText('Color de las líneas de corte') as HTMLInputElement;
    expect(picker.type).toBe('color');
    expect(picker.value).toBe(cuts().color);
    const hex = field('Código hexadecimal del color, por ejemplo #1A2B3C');
    expect(hex.value).toBe(cuts().color.toUpperCase());
    fireEvent.change(hex, { target: { value: '12a0ff' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    expect(cuts().color).toBe('#12a0ff');
    expect(hex.value).toBe('#12A0FF');
  });

  test('an invalid hex code says so and changes nothing; Esc brings back the color', () => {
    fireEvent.click(screen.getByRole('radio', { name: 'Otro' }));
    const color = cuts().color;
    const steps = historyDepth().undo;
    const hex = field('Código hexadecimal del color, por ejemplo #1A2B3C');
    fireEvent.change(hex, { target: { value: 'azul' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    expect(hex.getAttribute('aria-invalid')).toBe('true');
    expect(hex.getAttribute('aria-describedby')).toBe('cut-hex-error');
    expect(byId('cut-hex-error')!.hidden).toBe(false);
    expect(byId('cut-hex-error')!.textContent).toBe('Escribe un color como #1A2B3C');
    expect(cuts().color).toBe(color);
    expect(historyDepth().undo).toBe(steps);
    fireEvent.keyDown(hex, { key: 'Escape' });
    expect(hex.value).toBe(color.toUpperCase());
    expect(hex.hasAttribute('aria-invalid')).toBe(false);
    expect(byId('cut-hex-error')!.hidden).toBe(true);
  });
});

describe('the cut margin field', () => {
  beforeEach(() => setMode('outline'));

  test('named, with its unit, no helper sentence, 0 by default', () => {
    const margin = field('Margen de corte, en milímetros');
    expect(margin.value).toBe('0');
    expect(margin.closest('.num-field')?.querySelector('.num-unit')?.textContent).toBe('mm');
    expect(byId('cut-margin-hint')).toBeNull();
  });

  test('typing applies the value live, clamped to 20 mm; confirmed, it is one undo step', () => {
    const margin = field('Margen de corte, en milímetros');
    fireEvent.input(margin, { target: { value: '4' } });
    expect(cuts().margin).toBe(4);
    fireEvent.input(margin, { target: { value: '99' } });
    expect(cuts().margin).toBe(20);
    fireEvent.keyDown(margin, { key: 'Enter' });
    expect(cuts().margin).toBe(20);
    expect(margin.value).toBe('20');
    expect(historyDepth().undo).toBe(1);
  });
});
