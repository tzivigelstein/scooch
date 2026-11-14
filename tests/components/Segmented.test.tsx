// @vitest-environment jsdom
// The segmented control (ui/Segmented.tsx): a native radio group whose thumb
// is placed from the chosen option's index (--index of --count; in the browser
// it is then measured onto the chosen segment's box, see
// e2e/specs/segmented-controls.spec.ts), following clicks, the arrows and
// disabled options.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { Segmented, type SegmentOption } from '../../src/components/ui/Segmented.tsx';

type Choice = 'one' | 'two' | 'three';

const OPTIONS: readonly SegmentOption<Choice>[] = [
  { value: 'one', label: <span>One</span> },
  { value: 'two', label: <span>Two</span> },
  { value: 'three', label: <span>Three</span> },
];

/** The group with its value in state, as the app's call sites keep it in a store. */
function Harness({ initial, options = OPTIONS, fit }: { initial: Choice | null; options?: readonly SegmentOption<Choice>[]; fit?: boolean }) {
  const [value, setValue] = useState(initial);
  return <Segmented name="test" label="Test" value={value} onChange={setValue} options={options} fit={fit} />;
}

const thumb = () => document.querySelector<HTMLElement>('.seg-thumb')!;
const at = () => ({ index: thumb().style.getPropertyValue('--index'), count: thumb().style.getPropertyValue('--count'), hidden: thumb().hidden });
const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;

beforeAll(() => {
  // user-event finds a radio's group with CSS.escape, which jsdom lacks (the names here need no escaping).
  window.CSS ??= { escape: (name: string) => name } as typeof CSS;
});

afterEach(cleanup);

describe('the segmented control', () => {
  test('a named radio group with one thumb, hidden from assistive technology, before the segments', () => {
    render(<Harness initial="one" />);
    const group = screen.getByRole('radiogroup', { name: 'Test' });
    expect(group.className).toBe('segmented');
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['one', 'two', 'three']);
    expect(group.querySelectorAll('.seg-thumb')).toHaveLength(1);
    expect(group.firstElementChild).toBe(thumb());
    expect(thumb().getAttribute('aria-hidden')).toBe('true');
    expect(thumb().textContent).toBe('');
  });

  test('the thumb is at the chosen option and follows a click', async () => {
    const user = userEvent.setup();
    render(<Harness initial="two" />);
    expect(at()).toEqual({ index: '1', count: '3', hidden: false });
    await user.click(radio('Three'));
    expect(radio('Three').checked).toBe(true);
    expect(at()).toEqual({ index: '2', count: '3', hidden: false });
    await user.click(radio('One'));
    expect(at().index).toBe('0');
  });

  test('the arrows choose the next and the previous option, wrapping around, and the thumb follows', async () => {
    const user = userEvent.setup();
    render(<Harness initial="one" />);
    await user.tab();
    expect(document.activeElement).toBe(radio('One'));
    await user.keyboard('{ArrowRight}');
    expect([radio('Two').checked, document.activeElement === radio('Two'), at().index]).toEqual([true, true, '1']);
    await user.keyboard('{ArrowDown}');
    expect(at().index).toBe('2');
    await user.keyboard('{ArrowRight}');
    expect([radio('One').checked, at().index]).toEqual([true, '0']);
    await user.keyboard('{ArrowLeft}');
    expect([radio('Three').checked, at().index]).toEqual([true, '2']);
  });

  test('with nothing chosen the thumb is hidden; choosing shows it there', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    expect(at().hidden).toBe(true);
    expect(screen.getAllByRole('radio').some((r) => (r as HTMLInputElement).checked)).toBe(false);
    await user.click(radio('Two'));
    expect(at()).toEqual({ index: '1', count: '3', hidden: false });
  });

  test('the arrows skip a disabled option, which a click doesn’t choose', async () => {
    const user = userEvent.setup();
    render(<Harness initial="one" options={OPTIONS.map((o) => (o.value === 'two' ? { ...o, input: { disabled: true } } : o))} />);
    expect(radio('Two').disabled).toBe(true);
    await user.click(radio('Two'));
    expect([radio('One').checked, at().index]).toEqual([true, '0']);
    radio('One').focus();
    await user.keyboard('{ArrowRight}');
    expect([radio('Three').checked, at().index]).toEqual([true, '2']);
  });

  test('a disabled group keeps its choice on the thumb', async () => {
    const user = userEvent.setup();
    render(<Harness initial="three" options={OPTIONS.map((o) => ({ ...o, input: { disabled: true } }))} />);
    expect(screen.getAllByRole('radio').every((r) => (r as HTMLInputElement).disabled)).toBe(true);
    expect([radio('Three').checked, at()]).toEqual([true, { index: '2', count: '3', hidden: false }]);
    await user.click(radio('One'));
    expect([radio('Three').checked, at().index]).toEqual([true, '2']);
  });

  test('fewer options: the thumb counts them', () => {
    const { rerender } = render(<Segmented name="test" value="two" onChange={() => {}} options={OPTIONS} />);
    expect(at()).toMatchObject({ index: '1', count: '3' });
    rerender(<Segmented name="test" value="two" onChange={() => {}} options={OPTIONS.slice(1)} />);
    expect(at()).toMatchObject({ index: '0', count: '2' });
  });

  test('`fit` adds the class of segments as wide as their labels', () => {
    render(<Harness initial="one" fit />);
    expect(screen.getByRole('radiogroup').className).toBe('segmented fit');
  });
});
