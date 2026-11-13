// @vitest-environment jsdom
// The cut lines as document settings: the gap the corner marks need (and the
// one-click fix that offers to arrange), and their place in the undo history.
import { beforeEach, describe, expect, test } from 'vitest';
import { getDocument } from '../../src/state/document.ts';
import { historyDepth, redo, undo } from '../../src/state/history.ts';
import { getView } from '../../src/state/view.ts';
import { gapForCuts, setCuts, useGapForCuts } from '../../src/state/actions/sheets.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const cuts = () => getDocument().cuts;

beforeEach(() => resetState());

describe('the gap the corner marks need', () => {
  test.each([
    { offset: 1.5, length: 4, gap: 5.5 },
    { offset: 0, length: 0.5, gap: 0.5 },
    { offset: 1.25, length: 4, gap: 5.3 }, // rounded up to 0.1 mm
    { offset: 2, length: 3.01, gap: 5.1 },
    { offset: 10, length: 20, gap: 30 },
  ])('offset $offset + length $length mm: $gap mm', ({ offset, length, gap }) => {
    resetState({ cuts: { ...cuts(), mode: 'corners', offset, length } });
    expect(gapForCuts()).toBe(gap);
  });

  test('gap 5 mm < 4 + 1,5: the fix sets the gap to 5,5 mm in one undo step and offers to arrange', () => {
    resetState({ gap: 5, items: [piece(1, fakeImageMm(50, 30), 20, 20), piece(2, fakeImageMm(50, 30), 75, 20)], cuts: { ...cuts(), mode: 'corners' } });
    const items = getDocument().items;
    useGapForCuts();
    expect(getDocument().gap).toBe(5.5);
    expect(getDocument().items).toEqual(items); // it only offers to arrange
    const flash = getView().flash!;
    expect(flash.text.replace(/\u00a0/g, ' ')).toBe('Se cambió la separación a 5,5 mm. Acomoda las piezas para aplicarla.');
    expect(flash.action?.label).toBe('Acomodar');
    expect(historyDepth().undo).toBe(1);
    // The offer arranges with the new gap: the pieces end up 5,5 mm apart.
    flash.action!.run();
    const [a, b] = getDocument().items.toSorted((p, q) => p.x - q.x || p.y - q.y);
    const apart = Math.max(b.x - (a.x + 50), b.y - (a.y + 30), a.y - (b.y + 30));
    expect(apart).toBeGreaterThanOrEqual(5.5 - 1e-6);
    undo();
    undo();
    expect(getDocument().gap).toBe(5);
    expect(getDocument().items).toEqual(items);
  });
});

describe('cut lines in the undo history', () => {
  test('each choice is one step: undo takes back the last one (dotted → solid), redo brings it back', () => {
    setCuts({ mode: 'corners' });
    setCuts({ weight: 'medium' });
    setCuts({ color: '#12a0ff' }, { final: true });
    setCuts({ dash: 'dotted' });
    expect(historyDepth().undo).toBe(4);
    undo();
    expect(cuts()).toMatchObject({ mode: 'corners', weight: 'medium', color: '#12a0ff', dash: 'solid' });
    redo();
    expect(cuts()).toMatchObject({ mode: 'corners', weight: 'medium', color: '#12a0ff', dash: 'dotted' });
  });

  test('typing in a field (a keyed change) is one step until it is confirmed; choosing the same value adds none', () => {
    setCuts({ mode: 'outline' });
    for (const margin of [1, 2, 3]) setCuts({ margin }, { key: 'cuts:margin' });
    setCuts({ margin: 3 }, { key: 'cuts:margin', final: true });
    expect(historyDepth().undo).toBe(2);
    setCuts({ mode: 'outline' });
    expect(historyDepth().undo).toBe(2);
    undo();
    expect(cuts()).toMatchObject({ mode: 'outline', margin: 0 });
    undo();
    expect(cuts().mode).toBe('none');
  });

  test('turning the cut lines off is one step that moves no piece; undo brings them back as they were', () => {
    resetState({ items: [piece(1, fakeImageMm(50, 30), 20, 20), piece(2, fakeImageMm(50, 30), 76, 20)] });
    const items = getDocument().items;
    setCuts({ mode: 'outline' });
    setCuts({ margin: 3 }, { final: true });
    setCuts({ mode: 'none' });
    expect(getDocument().items).toEqual(items);
    expect(historyDepth().undo).toBe(3);
    undo();
    expect(cuts()).toMatchObject({ mode: 'outline', margin: 3 });
    expect(getDocument().items).toEqual(items);
  });
});
