// @vitest-environment jsdom
// Choosing another language in Preferences: the app shows it at once, without
// a reload, and nothing else changes: the selection, the document and its
// undo history stay as they were. (The language before the first paint, and
// each language on screen, are in e2e/specs/languages.spec.ts.)
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PiecesPanel } from '../../src/components/pieces-panel/PiecesPanel.tsx';
import { PropertiesPanel } from '../../src/components/properties-panel/PropertiesPanel.tsx';
import es from '../../src/copy/es.ts';
import { setTexts, textsLanguage } from '../../src/copy/index.ts';
import { followLanguage } from '../../src/services/language.ts';
import { getDocument } from '../../src/state/document.ts';
import { undo } from '../../src/state/history.ts';
import { useTextsLanguage } from '../../src/state/language.ts';
import { setLanguage } from '../../src/state/prefs.ts';
import { rotate } from '../../src/state/actions/pieces.ts';
import { setSelection } from '../../src/state/actions/selection.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

/** What App does at its root: a new language renders everything below again. */
function Root() {
  useTextsLanguage();
  return (
    <>
      <PiecesPanel />
      <PropertiesPanel />
    </>
  );
}

let stop: (() => void) | undefined;

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  localStorage.clear();
  resetState({ items: [piece(1, fakeImageMm(40, 30, { name: 'card.png', src: 1 }), 10, 10), piece(2, fakeImageMm(50, 50, { name: 'photo.jpg', src: 2 }), 70, 10)] });
});
afterEach(() => {
  cleanup();
  stop?.();
  stop = undefined;
  setTexts(es);
});

describe('switching the language', () => {
  test('the visible texts change at once; the selection, the document and undo stay', async () => {
    setLanguage('es');
    const follow = followLanguage();
    stop = follow.stop;
    await follow.ready;
    setSelection([2]);
    act(() => rotate(1));
    const before = structuredClone(getDocument().items);
    render(<Root />);
    expect(screen.getByRole('tab', { name: 'Pieza' })).toBeTruthy();
    expect(document.getElementById('piece-total')?.textContent).toBe('2 piezas');

    await act(async () => {
      setLanguage('en');
      await vi.waitFor(() => expect(textsLanguage()).toBe('en'));
    });
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('tab', { name: 'Item' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Project' })).toBeTruthy();
    expect(document.getElementById('piece-total')?.textContent).toBe('2 items');
    expect(document.body.textContent).not.toMatch(/Pieza|Propiedades|piezas|Papel|Distribución/);

    expect(getDocument().selection).toEqual([2]);
    expect(getDocument().items).toEqual(before);
    expect(getDocument().canUndo).toBe(true);
    act(() => undo());
    expect(getDocument().items.find((item) => item.id === 2)?.r).toBe(0);
  });
});
