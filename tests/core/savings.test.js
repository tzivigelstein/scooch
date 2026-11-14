// What a PDF saves (src/core/savings.js): the share of the printable area the
// pieces use, the sheets against one sheet per piece, those sheets in plain
// physical terms, the running total's milestones, when a fuller arrangement
// may be suggested, and counting each PDF once.
import { describe, expect, test } from 'vitest';
import { countPdf, equivalent, milestoneReached, paperFacts, pdfKey, sheetSavings, sheetUsage, suggestArrange, uncountPdf, unionArea } from '../../src/core/savings.js';

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

describe('counting each PDF once', () => {
  const before = { sheets: 8, turn: 4, counted: ['older'] };

  test('pdfKey: the same description gives the same key, any change another one', () => {
    const pdf = { size: [210, 297], pages: [[['file-a', 0, 56, 80, 10, 10, 100, 0, null]]] };
    expect(pdfKey(structuredClone(pdf))).toBe(pdfKey(pdf));
    expect(pdfKey(pdf)).toMatch(/^[0-9a-z]{6,11}$/);
    const moved = { ...pdf, pages: [[['file-a', 0, 56, 80, 10, 10.1, 100, 0, null]]] };
    const otherFile = { ...pdf, pages: [[['file-b', 0, 56, 80, 10, 10, 100, 0, null]]] };
    const otherPaper = { ...pdf, size: [297, 210] };
    expect(new Set([pdf, moved, otherFile, otherPaper].map(pdfKey)).size).toBe(4);
  });

  test('a new PDF adds its sheets to the total and is remembered; the equivalent takes its turn', () => {
    expect(countPdf(before, 'k1', 5)).toEqual({ savings: { sheets: 13, turn: 5, counted: ['older', 'k1'] }, added: 5 });
  });

  test('the same PDF again adds nothing (the equivalent still takes its turn)', () => {
    const { savings } = countPdf(before, 'k1', 5);
    expect(countPdf(savings, 'k1', 5)).toEqual({ savings: { sheets: 13, turn: 6, counted: ['older', 'k1'] }, added: 0 });
  });

  test('a PDF that saves nothing adds nothing and isn’t remembered', () => {
    expect(countPdf(before, 'k1', 0)).toEqual({ savings: { sheets: 8, turn: 5, counted: ['older'] }, added: 0 });
  });

  test('uncounting takes the added sheets back out and forgets the PDF, so it counts again later', () => {
    const { savings, added } = countPdf(before, 'k1', 5);
    const back = uncountPdf(savings, 'k1', added);
    expect(back).toEqual({ sheets: 8, turn: 5, counted: ['older'] });
    expect(countPdf(back, 'k1', 5).added).toBe(5);
    expect(uncountPdf({ sheets: 2, turn: 0, counted: [] }, 'k1', 5).sheets, 'never below 0').toBe(0);
  });
});
