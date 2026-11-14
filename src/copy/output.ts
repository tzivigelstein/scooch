// What the app writes into its files: the PDF's title and the file's name.
// They don't follow the interface's language, so a project gives the same PDF
// whatever language it is made in; they keep the Spanish names the app has
// always given them. (What the interface shows is in es.ts and the other
// languages' texts.)

import type { PaperId } from '../core/types.ts';

export const OUTPUT_TEXTS = Object.freeze({
  /** Decimal comma, as in a custom size: «Scooch 123,4 × 170 mm». */
  numberLocale: 'es',
  /** The PDF's title: «Scooch A4 horizontal». */
  title: '{app} {paper}',
  landscape: '{paper} horizontal',
  size: '{w} × {h} {unit}',
  /** In the file's name when nothing else can name it. */
  fallbackName: 'hoja',
  papers: {
    A0: 'A0',
    A1: 'A1',
    A2: 'A2',
    A3: 'A3',
    A4: 'A4',
    A5: 'A5',
    A6: 'A6',
    B4: 'B4',
    B5: 'B5',
    letter: 'Carta',
    legal: 'Oficio',
    folio: 'Folio',
    tabloid: 'Tabloide',
    'photo-9x13': 'Foto 9 × 13',
    'photo-10x15': 'Foto 10 × 15',
    'photo-13x18': 'Foto 13 × 18',
    'photo-15x20': 'Foto 15 × 20',
    'photo-20x30': 'Foto 20 × 30',
  } satisfies Record<PaperId, string>,
});

/** An output text with its `{param}`s filled in. */
export const outputText = (template: string, params: Record<string, string>) => template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
