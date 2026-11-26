// @vitest-environment jsdom
// A QR code's fields in the Item tab (QrFields.tsx): each control named by
// its label (the colors and the shapes under their titles), what each one
// changes on the piece, the background's color hidden while it is
// transparent, the logo's buttons, and nothing with anything else selected.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import QrFields from '../../src/components/properties-panel/QrFields.tsx';
import type { QrAsset } from '../../src/services/assets.ts';
import { buildQr } from '../../src/services/qr.ts';
import { addAsset, getAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { historyDepth } from '../../src/state/history.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

const qr = () => getAsset(getDocument().items[0].asset) as QrAsset;

beforeEach(async () => {
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:qr/${++n}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({ measureText: () => ({ width: 10 }) }, { get: (target, key) => (target as Record<PropertyKey, unknown>)[key] ?? (() => {}) }) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
  resetState();
  const key = addAsset(await buildQr({ text: 'https://scooch.app', color: '#000000', background: '#ffffff', dots: 'square', eyes: 'square', caption: '', logo: null }, 40));
  setDocument({ items: [piece(1, key, 20, 20)], selection: [1] });
  render(<QrFields />);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the QR code’s fields', () => {
  test('each control is named by its label; colors and shapes are groups under their titles', () => {
    expect(screen.getByLabelText('Contenido')).toHaveProperty('value', 'https://scooch.app');
    expect(screen.getByLabelText('Texto debajo')).toHaveProperty('value', '');
    const colors = screen.getByRole('group', { name: 'Colores' });
    expect(within(colors).getByRole('group', { name: 'Código' })).toBeTruthy();
    expect(within(colors).getByRole('group', { name: 'Fondo' })).toBeTruthy();
    const shape = screen.getByRole('group', { name: 'Forma' });
    expect(within(shape).getAllByRole('radio', { checked: true }).map((radio) => radio.closest('label')!.textContent)).toEqual(['Cuadrados', 'Cuadrados']);
    expect(within(screen.getByRole('radiogroup', { name: 'Puntos' })).getAllByRole('radio').map((radio) => radio.closest('label')!.textContent)).toEqual(['Cuadrados', 'Redondeados', 'Círculos']);
    expect(within(screen.getByRole('radiogroup', { name: 'Ojos' })).getAllByRole('radio')).toHaveLength(2);
    expect(screen.getByRole('switch', { name: 'Transparente' })).toHaveProperty('checked', false);
    expect(screen.getByRole('button', { name: 'Agregar logo' })).toBeTruthy();
  });

  test('typing the content changes the code as it is typed, in one undo step', async () => {
    const field = screen.getByLabelText('Contenido');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'https://scooch.app/e' } });
    fireEvent.change(field, { target: { value: 'https://scooch.app/es' } });
    await waitFor(() => expect(qr().text).toBe('https://scooch.app/es'));
    expect(historyDepth().undo).toBe(1);
    expect(field).toHaveProperty('value', 'https://scooch.app/es');
  });

  test('the shapes, the caption and a transparent background change the code; while transparent the background has no color to pick', async () => {
    fireEvent.click(screen.getByRole('radio', { name: 'Círculos' }));
    await waitFor(() => expect(qr().dots).toBe('circle'));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Ojos' })).getByRole('radio', { name: 'Redondeados' }));
    await waitFor(() => expect(qr().eyes).toBe('rounded'));
    fireEvent.change(screen.getByLabelText('Texto debajo'), { target: { value: 'Menú' } });
    await waitFor(() => expect(qr().caption).toBe('Menú'));
    const background = screen.getByRole('group', { name: 'Fondo' });
    expect(within(background).getByLabelText('Elegir color')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Transparente' }));
    await waitFor(() => expect(qr().background).toBeNull());
    expect(within(background).queryByLabelText('Elegir color')).toBeNull();
  });

  test('a code’s color typed in hexadecimal changes it once confirmed', async () => {
    const hex = within(screen.getByRole('group', { name: 'Código' })).getByRole('textbox');
    fireEvent.change(hex, { target: { value: '#1F3A93' } });
    fireEvent.keyDown(hex, { key: 'Enter' });
    await waitFor(() => expect(qr().color).toBe('#1f3a93'));
  });

  test('with anything but one QR code selected there are none', () => {
    act(() => setDocument({ items: [...getDocument().items, piece(2, fakeImage(), 100, 20)], selection: [2] }));
    expect(document.getElementById('qr-fields')).toBeNull();
    act(() => setDocument({ selection: [1, 2] }));
    expect(document.getElementById('qr-fields')).toBeNull();
  });
});
