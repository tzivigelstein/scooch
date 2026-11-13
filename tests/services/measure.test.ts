// What the paper is called, for every preset and for custom papers: the short
// name on the sheet's label (paperTitle), the name in sentences and in the
// PDF's title (paperName), and the slug of the downloaded file's name
// (paperSlug, pdfFileName). A custom paper's names and file name follow the
// unit chosen in «Preferencias».
import { beforeEach, describe, expect, test } from 'vitest';
import { PAPERS } from '../../src/core/papers.js';
import type { PaperId } from '../../src/core/types.ts';
import { pdfFileName } from '../../src/services/export.ts';
import { paperName, paperSlug, paperTitle } from '../../src/services/measure.ts';
import { setDocument } from '../../src/state/document.ts';
import { setUnit } from '../../src/state/prefs.ts';
import { resetState } from '../support/state.ts';

/** Replaces non-breaking spaces with plain ones (the copy uses them between numbers and units). */
const plain = (s: string) => s.replace(/\u00a0/g, ' ');

/** Title, name, slug and file name of the document's paper. */
const names = () => ({ title: plain(paperTitle()), name: plain(paperName()), slug: paperSlug(), file: pdfFileName() });

// Every preset: its visible short name and its slug (what the file is named after).
const PRESETS: Record<PaperId, [string, string]> = {
  A0: ['A0', 'a0'],
  A1: ['A1', 'a1'],
  A2: ['A2', 'a2'],
  A3: ['A3', 'a3'],
  A4: ['A4', 'a4'],
  A5: ['A5', 'a5'],
  A6: ['A6', 'a6'],
  B4: ['B4', 'b4'],
  B5: ['B5', 'b5'],
  letter: ['Carta', 'carta'],
  legal: ['Oficio', 'oficio'],
  folio: ['Folio', 'folio'],
  tabloid: ['Tabloide', 'tabloide'],
  'photo-9x13': ['Foto 9 × 13', 'foto-9-13'],
  'photo-10x15': ['Foto 10 × 15', 'foto-10-15'],
  'photo-13x18': ['Foto 13 × 18', 'foto-13-18'],
  'photo-15x20': ['Foto 15 × 20', 'foto-15-20'],
  'photo-20x30': ['Foto 20 × 30', 'foto-20-30'],
};

beforeEach(() => resetState());

describe('preset papers', () => {
  test('the table covers every preset', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(PAPERS.map((p) => p.id).sort());
  });

  test('every preset, portrait: named by its short name; the file is scooch-<slug>.pdf', () => {
    for (const { id } of PAPERS) {
      const [title, slug] = PRESETS[id];
      setDocument({ paper: id, landscape: false });
      expect(names(), id).toEqual({ title, name: title, slug, file: `scooch-${slug}.pdf` });
    }
  });

  test('every preset, landscape: «<name> horizontal» in sentences; the title and the file name don’t say it', () => {
    for (const { id } of PAPERS) {
      const [title, slug] = PRESETS[id];
      setDocument({ paper: id, landscape: true });
      expect(names(), id).toEqual({ title, name: `${title} horizontal`, slug, file: `scooch-${slug}.pdf` });
    }
  });

  test('the unit changes nothing in a preset’s names', () => {
    setDocument({ paper: 'letter', landscape: true });
    const inMm = names();
    for (const unit of ['cm', 'in'] as const) {
      setUnit(unit);
      expect(names(), unit).toEqual(inMm);
    }
  });
});

describe('custom papers', () => {
  test('123,4 × 170 mm: «Personalizado», named by its size, the file by its size rounded to whole mm', () => {
    setDocument({ paper: { custom: true, w: 123.4, h: 170 }, landscape: false });
    expect(names()).toEqual({ title: 'Personalizado', name: '123,4 × 170 mm', slug: '123x170mm', file: 'scooch-123x170mm.pdf' });
  });

  test('landscape: the size as the sheet lies (width first)', () => {
    setDocument({ paper: { custom: true, w: 123.4, h: 170 }, landscape: true });
    expect(names()).toEqual({ title: 'Personalizado', name: '170 × 123,4 mm', slug: '170x123mm', file: 'scooch-170x123mm.pdf' });
  });

  test('half a millimetre rounds up in the file name', () => {
    setDocument({ paper: { custom: true, w: 100.5, h: 200.49 }, landscape: false });
    expect(paperSlug()).toBe('101x200mm');
  });

  test('a custom paper with the size of a preset is named like it (and its orientation)', () => {
    setDocument({ paper: { custom: true, w: 216, h: 330 }, landscape: false });
    expect(names()).toEqual({ title: 'Folio', name: 'Folio', slug: 'folio', file: 'scooch-folio.pdf' });
    setDocument({ paper: { custom: true, w: 210.3, h: 297 }, landscape: true });
    expect(names()).toEqual({ title: 'A4', name: 'A4 horizontal', slug: 'a4', file: 'scooch-a4.pdf' });
  });

  test('in cm or in: the name and the file name both follow the unit', () => {
    setDocument({ paper: { custom: true, w: 123.4, h: 170 }, landscape: false });
    setUnit('cm');
    expect(names()).toEqual({ title: 'Personalizado', name: '12,34 × 17 cm', slug: '12,34x17cm', file: 'scooch-12,34x17cm.pdf' });
    setUnit('in');
    expect(names().name).toBe('4,858 × 6,693 in');
    expect(pdfFileName()).toBe('scooch-4,858x6,693in.pdf');
  });
});
