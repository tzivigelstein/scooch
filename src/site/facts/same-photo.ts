// «La misma foto varias veces» (same-photo), in every language: the sizes of
// its table (photo sizes of the app, a label and a sticker), how many copies
// of each fit, and the layouts its buttons open.

import type { PaperId } from '../../core/types.ts';
import { capacity, editorHref, photo, type Layout } from '../kit.ts';

/** A row of the table: one of the app's photo sizes, or a piece the page names itself. */
export type Copy = { kind: 'photo'; id: string; w: number; h: number } | { kind: 'label' | 'sticker'; w: number; h: number };

export function samePhotoFacts() {
  const layout = { margin: 5, gap: 2 };
  const papers: PaperId[] = ['A4', 'letter'];
  const label = { w: 50, h: 30 };
  const figureLayout: Layout = { paper: 'A4', ...layout };
  const copies: Copy[] = [
    ...['10x10', '9x13', 'visa-5x5', 'id-4x4'].map((id) => ({ kind: 'photo' as const, id, w: photo(id).w, h: photo(id).h })),
    { kind: 'label', ...label },
    { kind: 'sticker', w: 25, h: 25 },
  ];
  return {
    layout,
    papers,
    label,
    figure: { piece: label, layout: figureLayout, fill: true, count: capacity(label, figureLayout).grid.count },
    rows: copies.map((copy) => ({ copy, counts: papers.map((paper) => capacity(copy, { paper, ...layout }).grid.count) })),
    open: {
      a4: editorHref({ paper: 'A4', ...layout, cutMode: 'outline' }),
      letter: editorHref({ paper: 'letter', ...layout, cutMode: 'outline' }),
    },
  };
}
