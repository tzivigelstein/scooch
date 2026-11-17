// «Foto carnet para imprimir» (id-photos), in every language: the app's
// document photo sizes (only those: src/core/crop.js, group 'id'), how many
// fit on a sheet and the layouts its buttons open. Which size a procedure
// asks for is the office's to say: no language's page names a country or a
// procedure for a size.

import { PHOTO_SIZES } from '../../core/crop.js';
import type { PaperId } from '../../core/types.ts';
import { capacity, editorHref, photo, type Layout } from '../kit.ts';

export function idPhotosFacts() {
  const ids = PHOTO_SIZES.filter((s) => s.group === 'id').map((s) => s.id);
  const layout = { margin: 5, gap: 2 };
  const papers: PaperId[] = ['A4', 'letter'];
  const counts = (id: string, paper: PaperId) => capacity(photo(id), { paper, ...layout });
  const passport = photo('passport-35x45');
  const figureLayout: Layout = { paper: 'A4', ...layout };
  return {
    ids,
    layout,
    papers,
    rows: ids.map((id) => {
      const p = photo(id);
      return { id, w: p.w, h: p.h, counts: papers.map((paper) => counts(id, paper).grid.count) };
    }),
    /** Where «Acomodar» fits more than the grid of «Rellenar con copias» (mixing upright and turned photos). */
    more: ids.flatMap((id) => papers.filter((paper) => counts(id, paper).count > counts(id, paper).grid.count).map((paper) => ({ id, paper, count: counts(id, paper).count }))),
    /** Copies on A4 with «Rellenar con copias», by size. */
    onA4: Object.fromEntries(ids.map((id) => [id, counts(id, 'A4').grid.count])) as Record<string, number>,
    figure: { photo: passport.id, piece: passport, layout: figureLayout, fill: true },
    open: ids.map((id) => ({ id, href: editorHref({ paper: 'A4', ...layout, photo: id, cutMode: 'outline' }) })),
    /** A 2 × 2 inch photo, in mm. */
    twoInches: 50.8,
  };
}
