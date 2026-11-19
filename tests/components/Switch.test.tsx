// @vitest-environment jsdom
// The switch (ui/Switch.tsx) alone: its whole row is its label, so a click
// or a tap anywhere on the row toggles it, once, with no dead space between
// the text and the switch; one control to focus, named by its text.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Switch } from '../../src/components/ui/Switch.tsx';

afterEach(cleanup);

/** A switch that keeps its state, reporting each change. */
function Harness({ changed, hint }: { changed: (on: boolean) => void; hint?: string }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      id="grid-snap"
      label={<span>Imán</span>}
      hint={hint}
      checked={on}
      onChange={(value) => {
        changed(value);
        setOn(value);
      }}
    />
  );
}

describe('a switch', () => {
  test('the whole row toggles it: a click on the row, on its text or on the switch changes it once each', () => {
    const changed = vi.fn();
    render(<Harness changed={changed} />);
    const toggle = screen.getByRole('switch');
    const row = toggle.closest('.switch-row') as HTMLElement;
    fireEvent.click(row);
    expect(changed.mock.calls).toEqual([[true]]);
    fireEvent.click(screen.getByText('Imán'));
    expect(changed.mock.calls).toEqual([[true], [false]]);
    fireEvent.click(toggle);
    expect(changed.mock.calls).toEqual([[true], [false], [true]]);
    expect((toggle as HTMLInputElement).checked).toBe(true);
  });

  test('one control to focus, named by its text, with its hint as the description', () => {
    render(<Harness changed={() => {}} hint="Las piezas se ajustan a la grilla al arrastrarlas" />);
    const row = screen.getByRole('switch').closest('.switch-row') as HTMLElement;
    expect([...row.querySelectorAll('input, button, [tabindex]')]).toEqual([screen.getByRole('switch')]);
    expect(screen.getByRole('switch', { name: /^Imán/ })).toHaveProperty('id', 'grid-snap');
    expect(screen.getByRole('switch', { description: 'Las piezas se ajustan a la grilla al arrastrarlas' })).toHaveProperty('id', 'grid-snap');
  });
});
