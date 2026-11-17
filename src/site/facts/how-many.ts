// «¿Cuántas fotos caben en una hoja?» (how-many), in every language: what the
// calculator starts with, the counts of its table and of its questions.

import { PHOTO_SIZES } from '../../core/crop.js';
import type { PaperId } from '../../core/types.ts';
import type { CalcState } from '../calc.ts';
import { capacity, expect, photo } from '../kit.ts';

/** What the form shows first (and the page shows the result of). */
export const CALC_START: CalcState = { paper: 'A4', landscape: false, photo: '10x15', w: 50, h: 50, margin: 5, gap: 2, rotate: true };

export function howManyFacts() {
  const margin = 5;
  const gap = 2;
  const papers: PaperId[] = ['A4', 'letter', 'legal'];
  const tenByFifteen = photo('10x15');
  const id4 = photo('id-4x4');
  const passport = photo('passport-35x45');
  const onLetter = capacity(passport, { paper: 'letter', margin, gap });
  return {
    margin,
    gap,
    papers,
    rows: PHOTO_SIZES.map((s) => ({ id: s.id, w: s.w, h: s.h, counts: papers.map((paper) => capacity(s, { paper, margin, gap }).count) })),
    tenByFifteen,
    /** 10 × 15 on A4 with 5 mm margins and no gap. */
    a4Wide: capacity(tenByFifteen, { paper: 'A4', margin: 5, gap: 0 }).count,
    /** 10 × 15 on A4 with 3 mm margins and no gap: two upright and one turned below. */
    a4Narrow: expect(capacity(tenByFifteen, { paper: 'A4', margin: 3, gap: 0 }).count, 3, '10 × 15 on A4 with a 3 mm margin'),
    narrowMargin: 3,
    /** 4 × 4 ID photos on A4, with the gap for cutting them and without. */
    id4Cut: capacity(id4, { paper: 'A4', margin, gap }).count,
    id4Tight: capacity(id4, { paper: 'A4', margin, gap: 0 }).count,
    /** Passport photos on Letter: with «Acomodar», and in rows and columns. */
    passport: { w: passport.w, h: passport.h, count: onLetter.count, grid: onLetter.grid.count },
  };
}
