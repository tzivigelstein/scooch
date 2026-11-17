// «Fotos 10 × 15 en una hoja A4» (photos-10x15), in every language: how many
// fit by margin, the layouts its buttons open and the counts its sentences
// rely on (each checked: the build stops if the packer ever says otherwise).

import type { PaperId } from '../../core/types.ts';
import { capacity, editorHref, expect, photo, type Layout } from '../kit.ts';

export function tenByFifteenFacts() {
  const p = photo('10x15');
  const a4: Layout = { paper: 'A4', margin: 3, gap: 0 };
  const letter: Layout = { paper: 'letter', margin: 5, gap: 0 };
  const wideMargin = 5;
  const cutGap = 2;
  const exact = { w: 100, h: 150 };
  const quarter = { w: 105, h: 148 };
  expect(capacity(p, { ...a4, margin: 0 }).count, 3, '10 × 15 on A4 without a margin');
  const margins = [0, 3, 5, 10];
  const papers: PaperId[] = ['A4', 'letter'];
  const gaps = [0, cutGap];
  const onLetter = expect(capacity(p, letter).count, 3, '10 × 15 on Letter with a 5 mm margin');
  return {
    photo: p,
    a4,
    letter,
    wideMargin,
    cutGap,
    /** Two upright side by side and one turned below: only with a narrow margin and no gap. */
    onA4: expect(capacity(p, a4).count, 3, '10 × 15 on A4 with a 3 mm margin and no gap'),
    onA4Wide: expect(capacity(p, { ...a4, margin: wideMargin }).count, 2, '10 × 15 on A4 with a 5 mm margin'),
    onLetter,
    /** Whether a gap for cutting still leaves as many on Letter. */
    sameWithGap: capacity(p, { ...letter, gap: cutGap }).count === onLetter,
    /** 100 × 150 mm photos fit 3 on A4 with 5 mm margins too. */
    exact: { ...exact, count: expect(capacity(exact, { ...a4, margin: wideMargin }).count, 3, '100 × 150 mm on A4 with a 5 mm margin') },
    /** Four A6-sized ones (a quarter of an A4) fit only without margins. */
    quarter: { ...quarter, count: expect(capacity(quarter, { ...a4, margin: 0 }).count, 4, '105 × 148 mm on A4 without a margin') },
    papers,
    gaps,
    rows: margins.map((margin) => ({ margin, counts: papers.flatMap((paper) => gaps.map((gap) => capacity(p, { paper, margin, gap }).count)) })),
    figure: { piece: p, layout: a4 },
    open: {
      a4: editorHref({ paper: 'A4', margin: a4.margin, gap: a4.gap, photo: '10x15' }),
      letter: editorHref({ paper: 'letter', margin: letter.margin, gap: letter.gap, photo: '10x15' }),
    },
  };
}
