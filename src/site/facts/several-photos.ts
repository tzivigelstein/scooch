// «Varias fotos en una hoja» (several-photos), in every language: the layout
// its buttons open, the sheet it shows and the counts of its table.

import type { PaperId } from '../../core/types.ts';
import { capacity, editorHref, photo, type Layout } from '../kit.ts';

export function severalPhotosFacts() {
  const layout = { margin: 5, gap: 3 };
  const papers: PaperId[] = ['A4', 'letter', 'legal'];
  const figureLayout: Layout = { paper: 'A4', ...layout };
  const shown = photo('9x13');
  return {
    layout,
    papers,
    /** Copies of `figure.photo` on A4, where «Acomodar» puts them. */
    figure: { photo: shown.id, piece: shown, layout: figureLayout, count: capacity(shown, figureLayout).count },
    rows: ['10x15', '13x18', '9x13', '10x10'].map((id) => {
      const p = photo(id);
      return { id, w: p.w, h: p.h, counts: papers.map((paper) => capacity(p, { paper, ...layout }).count) };
    }),
    open: { a4: editorHref({ paper: 'A4', ...layout }), letter: editorHref({ paper: 'letter', ...layout }) },
  };
}
