// @vitest-environment jsdom
// With Contour cut lines, an image whose line stays its rectangle because it
// has no transparent background says so, in one sentence: a badge in its row
// of the Items list (its tooltip and, for screen readers, the end of the
// row's name) and a note in the Item tab while it is the one selected. A JPEG
// and a PDF page say it at once and a PNG once its trace finds nothing
// transparent; with the other cut lines the rectangle is what was chosen and
// nothing is said. What a trace finds is services/contours.test.ts's.
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { PieceList } from '../../src/components/pieces-panel/PieceList.tsx';
import { PieceSection } from '../../src/components/properties-panel/PieceSection.tsx';
import { DEFAULT_CUTS } from '../../src/core/projectdoc.js';
import type { CutMode } from '../../src/core/types.ts';
import { traceAlpha } from '../../src/services/alpha.ts';
import { setTracer, showShapes } from '../../src/services/contours.ts';
import { getAsset } from '../../src/state/assets.ts';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { disc, maskOf } from '../support/contour.ts';
import { fakeImage, fakePdf, piece, resetState } from '../support/state.ts';

const WHY = 'Sin fondo transparente, la línea de corte es rectangular';

let jpg: Piece;
let pdf: Piece;
/** A PNG of a photo: nothing transparent. */
let flat: Piece;
/** A PNG sticker: a disc on a transparent background. */
let sticker: Piece;

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

beforeEach(() => {
  resetState();
  const flatKey = fakeImage({ name: 'foto.png', src: 3, px: [600, 600] });
  jpg = piece(1, fakeImage({ name: 'foto.jpg', src: 1, format: 'jpg' }), 10, 10);
  pdf = piece(2, fakePdf({ name: 'doc.pdf', src: 2 }), 70, 10, { scale: 20 });
  flat = piece(3, flatKey, 10, 60);
  sticker = piece(4, fakeImage({ name: 'pegatina.png', src: 4, px: [600, 600] }), 70, 60);
  // As the worker traces each image's preview.
  const photo = maskOf(600, 600, () => true);
  const round = maskOf(600, 600, disc(300, 300, 250));
  setTracer(async (request) => traceAlpha(request.source === getAsset(flatKey).preview ? photo : round, request));
});
afterEach(() => {
  cleanup();
  setTracer(null);
});

const show = (items: Piece[], selection: number[] = [], mode: CutMode = 'contour') => act(() => setDocument({ items, selection, cuts: { ...DEFAULT_CUTS, mode } }));

/** Traces what the sheet shows, as its cut lines ask for it, and lets every trace finish. */
async function traced(items: Piece[]) {
  showShapes('sheet', items, getDocument().cuts.margin);
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

const badge = (id: number) => document.querySelector<HTMLElement>(`#piece-list [role="option"][data-id="${id}"] .row-badge[data-kind="opaque"]`);
const note = () => document.getElementById('opaque-note')!;

describe('the badge in the Items list', () => {
  beforeEach(() => {
    render(<PieceList />);
  });

  test('a JPEG and a PDF page get it at once with Contour: the sentence in its tip and in the row’s name', () => {
    show([jpg, pdf, flat, sticker]);
    for (const { id } of [jpg, pdf]) {
      expect(badge(id)!.dataset.tip).toBe(WHY);
      expect(badge(id)!.querySelector('.sr-only')!.textContent).toBe(`. ${WHY}`);
    }
    // Not traced yet: nothing is known of the PNGs.
    expect(badge(flat.id)).toBeNull();
    expect(badge(sticker.id)).toBeNull();
  });

  test('a PNG gets it once its trace finds nothing transparent and a sticker never does', async () => {
    show([flat, sticker]);
    await traced([flat, sticker]);
    expect(badge(flat.id)!.dataset.tip).toBe(WHY);
    expect(badge(sticker.id)).toBeNull();
  });

  test.each([
    { mode: 'none', label: 'None' },
    { mode: 'corners', label: 'Corners' },
    { mode: 'outline', label: 'Outline' },
  ] as const)('with $label chosen instead no row has it', async ({ mode }) => {
    show([jpg, pdf, flat, sticker]);
    await traced([jpg, pdf, flat, sticker]);
    expect(document.querySelectorAll('.row-badge[data-kind="opaque"]')).toHaveLength(3);
    show([jpg, pdf, flat, sticker], [], mode);
    expect(document.querySelectorAll('.row-badge[data-kind="opaque"]')).toHaveLength(0);
  });
});

describe('the note in the Item tab', () => {
  beforeEach(() => {
    render(
      <>
        <PieceSection />
        <div id="live-polite" />
        <div id="live-assertive" />
      </>
    );
  });

  test('says the same of the one image selected and only with Contour', () => {
    show([jpg, sticker], [jpg.id]);
    expect(note().hidden).toBe(false);
    expect(note().textContent).toBe(WHY);
    show([jpg, sticker], [jpg.id], 'outline');
    expect(note().hidden).toBe(true);
    // Of several selected nothing is said: the list says which.
    show([jpg, pdf], [jpg.id, pdf.id]);
    expect(note().hidden).toBe(true);
  });

  test('shows for a PNG once its trace finds nothing transparent and never for a sticker', async () => {
    show([flat, sticker], [flat.id]);
    expect(note().hidden).toBe(true);
    await traced([flat, sticker]);
    expect(note().hidden).toBe(false);
    show([flat, sticker], [sticker.id]);
    expect(note().hidden).toBe(true);
  });
});
