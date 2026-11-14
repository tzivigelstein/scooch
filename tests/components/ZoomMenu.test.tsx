// @vitest-environment jsdom
// The zoom control's menu: its items, where the focus goes, choosing a level
// with the keyboard and closing it with Esc. (Where it opens on screen and the
// fits themselves are in e2e/specs/zoom-and-pan.spec.ts and floating-controls.)
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ZoomControl } from '../../src/components/canvas/ZoomControl.tsx';
import { useZoomMenu } from '../../src/components/canvas/zoomMenu.ts';
import { fromPercent, toPercent } from '../../src/core/zoom.js';
import { getView, setView } from '../../src/state/view.ts';
import { resetState } from '../support/state.ts';

const level = () => document.getElementById('zoom-level')!;
const live = () => document.getElementById('live-polite')!.textContent ?? '';
const plain = (s: string | null) => String(s ?? '').replace(/\s/g, ' ').trim();

beforeEach(() => {
  resetState();
  useZoomMenu.setState({ at: null });
  setView({ zoom: fromPercent(60), zoomMode: 'fit' });
  // zoomTo needs the stage and the sheets' column to exist (it measures them).
  render(
    <>
      <div id="canvas">
        <div id="stage">
          <div id="sheets" />
        </div>
        <ZoomControl />
      </div>
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
});
afterEach(cleanup);

async function openWithKeyboard() {
  const user = userEvent.setup();
  level().focus();
  await user.keyboard('{Enter}');
  const menu = await screen.findByRole('menu');
  return { user, menu };
}

describe('zoom menu', () => {
  test('lists Ver la hoja entera, Ver el ancho de la hoja, 50 %, 100 % and 200 %', async () => {
    const { menu } = await openWithKeyboard();
    const labels = within(menu)
      .getAllByRole('menuitem')
      .map((item) => plain(item.querySelector('.menu-label')!.textContent));
    expect(labels).toEqual(['Ver la hoja entera', 'Ver el ancho de la hoja', '50 %', '100 %', '200 %']);
  });

  test('opens with the focus on its first item and the button expanded', async () => {
    expect(level().getAttribute('aria-expanded')).toBe('false');
    await openWithKeyboard();
    await waitFor(() => expect(document.activeElement?.id).toBe('zoom-menu-fit'));
    expect(level().getAttribute('aria-expanded')).toBe('true');
    expect(level().getAttribute('aria-controls')).toBe('zoom-menu');
  });

  test('choosing 200 % from the keyboard zooms to 200 %, shows it, says it and gives the focus back', async () => {
    const { user } = await openWithKeyboard();
    await waitFor(() => expect(document.activeElement?.id).toBe('zoom-menu-fit'));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(document.activeElement?.id).toBe('zoom-menu-level-200');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(toPercent(getView().zoom)).toBeCloseTo(200, 6);
    expect(getView().zoomMode).toBe('manual');
    expect(plain(level().textContent)).toBe('200 %');
    expect(document.activeElement).toBe(level());
    await waitFor(() => expect(plain(live())).toMatch(/^Zoom 200 %/));
  });

  test('Esc closes it without zooming, and the focus goes back to the button', async () => {
    const { user } = await openWithKeyboard();
    await waitFor(() => expect(document.activeElement?.id).toBe('zoom-menu-fit'));
    await user.keyboard('{ArrowDown}{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(level());
    expect(level().getAttribute('aria-expanded')).toBe('false');
    expect(toPercent(getView().zoom)).toBeCloseTo(60, 6);
  });
});
