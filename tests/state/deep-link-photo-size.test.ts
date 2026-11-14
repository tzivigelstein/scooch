// @vitest-environment jsdom
// What a deep link does after it created its project (state/actions/deeplink.ts):
// images added to that project take the link's photo size, the notice says
// what was set up; and the content pages' calculator counts «Rellenar con
// copias» the way the editor does (core/capacity.js against fillPlan).
import { beforeEach, describe, expect, test } from 'vitest';
import { gridCapacity } from '../../src/core/capacity.js';
import { parseDeepLink } from '../../src/core/deeplink.js';
import type { PaperId } from '../../src/core/types.ts';
import { getDocument } from '../../src/state/document.ts';
import { useProject } from '../../src/state/project.ts';
import { area, dims } from '../../src/state/selectors.ts';
import { getView } from '../../src/state/view.ts';
import { linkOpened } from '../../src/state/actions/deeplink.ts';
import { fillPlan, placeNew } from '../../src/state/actions/layout.ts';
import { fakeImageMm, fakePdf, piece, resetState } from '../support/state.ts';

/** The link's project was just created as `project`. */
function opened(search: string, project = 'p1') {
  useProject.setState({ id: project });
  linkOpened(parseDeepLink(search)!);
}

const round = (v: number) => Math.round(v * 10) / 10;
const sizes = () => getDocument().items.map((item) => dims(item).map(round));
const notice = () => getView().flash?.text.replace(/ /g, ' ');

beforeEach(() => {
  // A link without a photo size: nothing left from the previous test.
  opened('?paper=A4');
  resetState();
});

describe('the photo size of a deep link', () => {
  test('images added to its project take that size exactly, turned like each image', () => {
    // Without «Rotación automática», placing them doesn't turn them either.
    resetState({ rotate: false });
    opened('?photo=10x15');
    placeNew([fakeImageMm(160, 100), fakeImageMm(100, 160, { src: 2 })]);
    expect(sizes()).toEqual([
      [152.4, 101.6],
      [101.6, 152.4],
    ]);
    expect(getDocument().items.every((item) => item.crop !== null)).toBe(true);
  });

  test('a custom size works the same', () => {
    opened('?photo=25x30mm');
    placeNew([fakeImageMm(100, 160)]);
    expect(sizes()).toEqual([[25, 30]]);
  });

  test('it keeps applying to every image added to that project', () => {
    opened('?photo=id-4x4');
    placeNew([fakeImageMm(100, 160)]);
    placeNew([fakeImageMm(160, 100, { src: 2 })]);
    expect(sizes()).toEqual([
      [40, 40],
      [40, 40],
    ]);
  });

  test('PDF pages keep their own size', () => {
    opened('?photo=10x15');
    placeNew([fakePdf({ w: 148, h: 210 })]);
    const [item] = getDocument().items;
    expect(item.crop).toBeNull();
    expect(sizes()).not.toEqual([[101.6, 152.4]]);
  });

  test('once this tab opens another project it stops applying, also back in the first one', () => {
    opened('?photo=10x15', 'p1');
    useProject.setState({ id: 'p2' });
    placeNew([fakeImageMm(100, 160)]);
    useProject.setState({ id: 'p1' });
    placeNew([fakeImageMm(100, 160, { src: 2 })]);
    expect(getDocument().items.every((item) => item.crop === null)).toBe(true);
  });

  test('without a photo size, added images come as usual', () => {
    opened('?paper=letter&margin=5');
    placeNew([fakeImageMm(100, 160)]);
    expect(getDocument().items[0].crop).toBeNull();
  });
});

describe('the notice after a deep link', () => {
  test.each([
    ['?paper=A4', 'Se creó un proyecto nuevo con papel A4'],
    ['?photo=10x15', 'Se creó un proyecto nuevo con papel A4. Las fotos que agregues se recortan a 10 × 15: 101,6 × 152,4 mm.'],
    ['?photo=30x40mm', 'Se creó un proyecto nuevo con papel A4. Las fotos que agregues se recortan a 30 × 40 mm.'],
  ])('%s', (search, text) => {
    opened(search);
    expect(notice()).toBe(text);
  });

  test('the paper is named as the project has it', () => {
    resetState({ paper: 'letter', landscape: true });
    opened('?paper=letter&orientation=landscape');
    expect(notice()).toBe('Se creó un proyecto nuevo con papel Carta horizontal');
  });
});

describe('the calculator counts «Rellenar con copias» like the editor', () => {
  test.each([
    ['A4', false, 10, 5, true, 101.6, 152.4],
    ['A4', false, 0, 0, true, 101.6, 152.4],
    ['letter', false, 5, 0, true, 35, 45],
    ['letter', false, 5, 0, false, 35, 45],
    ['legal', true, 5, 2, true, 40, 40],
    ['A3', false, 5, 2, true, 88, 107],
    ['photo-10x15', false, 3, 2, true, 35, 45],
    ['A5', true, 50, 0, true, 40, 40],
  ] as [PaperId, boolean, number, number, boolean, number, number][])('%s, landscape %s, margin %i, gap %i, rotate %s, %d × %d mm', (paper, landscape, margin, gap, rotate, w, h) => {
    resetState({ paper, landscape, margin, gap, rotate, items: [piece(1, fakeImageMm(w, h), 0, 0)], selection: [1] });
    const item = getDocument().items[0];
    const [pw, ph] = dims(item);
    const { count, cols, rows, rotated } = fillPlan(item);
    expect(gridCapacity({ w: pw, h: ph }, area(), { gap, rotate })).toEqual({ count, cols, rows, rotated });
  });
});
