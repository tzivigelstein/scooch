// What a PDF saves (src/core/savings.js): the share of the printable area the
// pieces use, the sheets against one sheet per piece, those sheets in plain
// physical terms, the running total's milestones, when a fuller arrangement
// may be suggested, counting each PDF once, and a print joining the total
// only once it settles.
import { describe, expect, test } from 'vitest';
import { countPdf, equivalent, milestoneReached, paperFacts, pdfKey, settlePending, sheetSavings, sheetUsage, suggestArrange, unionArea } from '../../src/core/savings.js';

const r = (x, y, w, h) => ({ x, y, w, h });
const A4_AREA = r(10, 10, 190, 277); // A4 with a 10 mm margin

describe('unionArea', () => {
  test.each([
    ['nothing', [], 0],
    ['one rectangle', [r(0, 0, 10, 20)], 200],
    ['two apart', [r(0, 0, 10, 10), r(20, 0, 10, 10)], 200],
    ['two overlapping: the shared part once', [r(0, 0, 10, 10), r(5, 5, 10, 10)], 175],
    ['one inside another', [r(0, 0, 10, 10), r(2, 2, 3, 3)], 100],
    ['touching edges', [r(0, 0, 10, 10), r(10, 0, 10, 10)], 200],
    ['empty ones count nothing', [r(0, 0, 0, 10), r(0, 0, 10, -1)], 0],
  ])('%s', (_, rects, area) => {
    expect(unionArea(rects)).toBeCloseTo(area, 9);
  });
});

describe('sheetUsage', () => {
  test('the pieces’ footprints over the printable area of the sheets that print', () => {
    // Half the printable area on one sheet.
    expect(sheetUsage([[r(10, 10, 95, 277)]], A4_AREA)).toBeCloseTo(0.5, 9);
  });

  test('several sheets: their areas together (a nearly empty sheet weighs like the paper it is)', () => {
    const full = [r(10, 10, 190, 277)];
    const tenth = [r(10, 10, 19, 277)];
    expect(sheetUsage([full, tenth], A4_AREA)).toBeCloseTo(0.55, 9);
    expect(sheetUsage([full, [], tenth], A4_AREA), 'an empty sheet doesn’t print').toBeCloseTo(0.55, 9);
  });

  test('overlapping pieces count once, and what sticks out of the printable area doesn’t count', () => {
    expect(sheetUsage([[r(10, 10, 95, 277), r(10, 10, 95, 277)]], A4_AREA)).toBeCloseTo(0.5, 9);
    expect(sheetUsage([[r(-50, -50, 155, 337)]], A4_AREA)).toBeCloseTo(0.5, 9);
  });

  test('never more than all of it; nothing to print: null', () => {
    expect(sheetUsage([[r(0, 0, 500, 500)]], A4_AREA)).toBe(1);
    expect(sheetUsage([[], []], A4_AREA)).toBeNull();
  });
});

describe('sheetSavings', () => {
  test('against one sheet per piece', () => {
    expect(sheetSavings(7, 2)).toEqual({ used: 2, baseline: 7, saved: 5 });
    expect(sheetSavings(1, 1)).toEqual({ used: 1, baseline: 1, saved: 0 });
    expect(sheetSavings(2, 3).saved, 'more sheets than pieces saves nothing (never negative)').toBe(0);
  });
});

describe('paperFacts and the equivalent that takes its turn', () => {
  test('5 A4 sheets: about 25 g at 80 g/m², 1 % of a ream of 500, a stack of 0.5 mm', () => {
    const facts = paperFacts(5, 210, 297);
    expect(facts.grams).toBeCloseTo(24.948, 3);
    expect(facts.ream).toBeCloseTo(0.01, 9);
    expect(facts.stack).toBeCloseTo(0.5, 9);
  });

  test('they take turns: grams, the ream, the stack, and again', () => {
    const facts = paperFacts(5, 210, 297);
    expect([0, 1, 2, 3].map((turn) => equivalent(turn, facts).kind)).toEqual(['grams', 'ream', 'stack', 'grams']);
    expect(equivalent(2, facts)).toEqual({ kind: 'stack', value: facts.stack });
  });
});

describe('milestoneReached', () => {
  test.each([
    [0, 9, null],
    [9, 10, 10],
    [8, 12, 10],
    [10, 11, null],
    [45, 120, 100],
    [499, 500, 500],
    [500, 900, null],
  ])('from %d to %d: %s', (before, after, milestone) => {
    expect(milestoneReached(before, after)).toBe(milestone);
  });
});

describe('suggestArrange', () => {
  test('only with little of the area used and a packing that surely takes fewer sheets', () => {
    expect(suggestArrange(0.3, 3, 2)).toBe(true);
    expect(suggestArrange(0.3, 3, 3), 'not one sheet fewer').toBe(false);
    expect(suggestArrange(0.3, 3, null), 'the check couldn’t place them').toBe(false);
    expect(suggestArrange(0.7, 3, 2), 'well used already').toBe(false);
    expect(suggestArrange(null, 3, 2)).toBe(false);
  });
});

const before = { sheets: 8, turn: 4, counted: ['older'], pending: null, milestone: null };

describe('counting each PDF once', () => {

  test('pdfKey: the same description gives the same key, any change another one', () => {
    const pdf = { size: [210, 297], pages: [[['file-a', 0, 56, 80, 10, 10, 100, 0, null]]] };
    expect(pdfKey(structuredClone(pdf))).toBe(pdfKey(pdf));
    expect(pdfKey(pdf)).toMatch(/^[0-9a-z]{6,11}$/);
    const moved = { ...pdf, pages: [[['file-a', 0, 56, 80, 10, 10.1, 100, 0, null]]] };
    const otherFile = { ...pdf, pages: [[['file-b', 0, 56, 80, 10, 10, 100, 0, null]]] };
    const otherPaper = { ...pdf, size: [297, 210] };
    expect(new Set([pdf, moved, otherFile, otherPaper].map(pdfKey)).size).toBe(4);
  });

  test('a new PDF downloaded adds its sheets to the total at once and is remembered; the equivalent takes its turn and the milestone shows now', () => {
    expect(countPdf(before, 'k1', 5, 'download')).toEqual({ savings: { sheets: 13, turn: 5, counted: ['older', 'k1'], pending: null, milestone: null }, added: 5, milestone: 10 });
  });

  test.each(['print', 'download'])('the same PDF again, %s, adds nothing (the equivalent still takes its turn)', (how) => {
    const { savings } = countPdf(before, 'k1', 5, 'download');
    expect(countPdf(savings, 'k1', 5, how)).toEqual({ savings: { ...savings, turn: 6 }, added: 0, milestone: null });
  });

  test.each(['print', 'download'])('a PDF that saves nothing, %s, adds nothing and isn’t remembered', (how) => {
    expect(countPdf(before, 'k1', 0, how)).toEqual({ savings: { ...before, turn: 5 }, added: 0, milestone: null });
  });
});

describe('a print joins the total once it settles', () => {
  const printed = countPdf(before, 'k1', 5, 'print').savings;

  test('its sheets wait out of the total, and reach no milestone yet', () => {
    expect(countPdf(before, 'k1', 5, 'print')).toEqual({ savings: { ...before, turn: 5, pending: { key: 'k1', sheets: 5 } }, added: 5, milestone: null });
  });

  test('the same PDF printed again: still one pending print, not settled', () => {
    expect(countPdf(printed, 'k1', 5, 'print')).toEqual({ savings: { ...printed, turn: 6 }, added: 0, milestone: null });
  });

  test.each([
    ['print', { sheets: 13, pending: { key: 'k2', sheets: 3 } }],
    ['download', { sheets: 16, pending: null }],
  ])('another PDF going out (%s) settles it first, and that summary shows the milestone', (how, after) => {
    expect(countPdf(printed, 'k2', 3, how)).toEqual({
      savings: { ...printed, ...after, turn: 6, counted: how === 'print' ? ['older', 'k1'] : ['older', 'k1', 'k2'], milestone: null },
      added: 3,
      milestone: 10,
    });
  });

  test('downloading the pending PDF settles it at once, counted once', () => {
    const downloaded = countPdf(printed, 'k1', 5, 'download');
    expect(downloaded).toEqual({ savings: { sheets: 13, turn: 6, counted: ['older', 'k1'], pending: null, milestone: null }, added: 0, milestone: 10 });
    for (const how of ['print', 'download']) expect(countPdf(downloaded.savings, 'k1', 5, how).savings.sheets, how).toBe(13);
  });

  test('settling on its own (a page load): into the total, with the milestone kept for the next summary, which shows it once', () => {
    const settled = settlePending(printed);
    expect(settled).toEqual({ sheets: 13, turn: 5, counted: ['older', 'k1'], pending: null, milestone: 10 });
    const next = countPdf(settled, 'k1', 5, 'print');
    expect(next).toMatchObject({ added: 0, milestone: 10, savings: { sheets: 13, milestone: null } });
    expect(countPdf(next.savings, 'k1', 5, 'print').milestone, 'not twice').toBeNull();
  });

  test('without a pending print, settling changes nothing', () => {
    expect(settlePending(before)).toBe(before);
  });

  test('a milestone waiting and a higher one reached now: the summary shows the higher', () => {
    const settled = settlePending({ ...before, sheets: 45, pending: { key: 'k1', sheets: 3 } });
    expect(settled.milestone).toBeNull();
    const waiting = settlePending({ ...before, sheets: 7, pending: { key: 'k1', sheets: 38 } });
    expect(waiting).toMatchObject({ sheets: 45, milestone: 10 });
    expect(countPdf(waiting, 'k2', 5, 'download').milestone).toBe(50);
  });
});
