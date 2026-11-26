// @vitest-environment jsdom
// «Agregar código QR» is where things are added: next to «Agregar» in the
// top bar and under the drop zone of the «Piezas» panel. Both add one.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { PiecesPanel } from '../../src/components/pieces-panel/PiecesPanel.tsx';
import { Topbar } from '../../src/components/topbar/Topbar.tsx';
import { addQrCode } from '../../src/state/actions/files.ts';
import { resetState } from '../support/state.ts';

vi.mock('../../src/state/actions/files.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/state/actions/files.ts')>()), addQrCode: vi.fn() }));

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.mocked(addQrCode).mockClear();
});

describe('«Agregar código QR»', () => {
  test('in the top bar right after «Agregar», an icon button named and with its tooltip', () => {
    resetState();
    render(<Topbar />);
    const button = screen.getByRole('button', { name: 'Agregar código QR' });
    expect(button.dataset.tip).toBe('Agregar código QR');
    expect(button.previousElementSibling?.id).toBe('add');
    fireEvent.click(button);
    expect(addQrCode).toHaveBeenCalledTimes(1);
  });

  test('in the «Piezas» panel under the zone to add files', () => {
    resetState();
    render(<PiecesPanel />);
    const button = screen.getByRole('button', { name: 'Agregar código QR' });
    expect(button.previousElementSibling?.id).toBe('addzone');
    fireEvent.click(button);
    expect(addQrCode).toHaveBeenCalledTimes(1);
  });
});
