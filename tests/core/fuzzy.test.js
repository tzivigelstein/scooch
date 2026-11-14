// The palette's search: every word typed has to be found in the name or in its
// other words, without minding case, accents or order; the matched parts of
// the name come back to be highlighted, and the best match comes first.
import { describe, expect, test } from 'vitest';
import { fold, fuzzyFilter, fuzzyMatch, prepare } from '../../src/core/fuzzy.js';

const parts = (name, ranges) => ranges.map(([from, to]) => name.slice(from, to));
const names = (query, list) => fuzzyFilter(query, list.map(([name, aliases]) => prepare(name, aliases))).map((r) => list[r.index][0]);

describe('folding', () => {
  test('lowercase, without accents, any space a plain one, and the same length', () => {
    for (const [text, folded] of [
      ['Rotación automática', 'rotacion automatica'],
      ['Año ÑANDÚ', 'ano nandu'],
      ['100 %', '100 %'],
      ['210 × 297 mm', '210 × 297 mm'],
      ['Ir a la pestaña Proyecto', 'ir a la pestana proyecto'],
    ]) {
      expect(fold(text)).toBe(folded);
      expect(fold(text)).toHaveLength(text.length);
    }
  });
});

describe('what a query finds', () => {
  test.each([
    ['rotar', 'Rotar a la derecha', ['Rotar']],
    ['ROTÁR', 'Rotar a la derecha', ['Rotar']],
    ['derecha rotar', 'Rotar a la derecha', ['Rotar', 'derecha']],
    ['agr hoja', 'Agregar hoja', ['Agr', 'hoja']],
    ['pestana', 'Ir a la pestaña Proyecto', ['pestaña']],
    ['dpl', 'Duplicar', ['D', 'pl']],
    ['la derecha', 'Rotar a la derecha', ['la derecha']],
    ['cortar', 'Recortar', ['cortar']],
    ['100 %', 'Zoom al 100 %', ['100 %']],
  ])('«%s» finds «%s», marking %j', (query, name, marked) => {
    const match = fuzzyMatch(query, prepare(name));
    expect(match).not.toBeNull();
    expect(parts(name, match.ranges)).toEqual(marked);
  });

  test.each([
    ['rotar x', 'Rotar a la derecha'],
    ['zz', 'Duplicar'],
    // Letters in order only count from the start of a word.
    ['upl', 'Duplicar', true],
    ['plc', 'Duplicar'],
  ])('«%s» against «%s»', (query, name, found = false) => {
    expect(fuzzyMatch(query, prepare(name)) !== null).toBe(found);
  });

  test('another word for it finds it, without marking anything in the name', () => {
    const match = fuzzyMatch('girar', prepare('Rotar a la derecha', 'girar, voltear'));
    expect(match).not.toBeNull();
    expect(match.ranges).toEqual([]);
    expect(fuzzyMatch('girar izq', prepare('Rotar a la izquierda', 'girar, voltear')).ranges).toEqual([[11, 14]]);
  });

  test('an empty query (or only spaces) finds everything, in its order', () => {
    expect(fuzzyMatch('  ', prepare('Deshacer'))).toEqual({ score: 0, ranges: [] });
    expect(names('', [['Deshacer'], ['Rehacer'], ['Imprimir']])).toEqual(['Deshacer', 'Rehacer', 'Imprimir']);
  });
});

describe('the order of the results', () => {
  test('the start of the name, then the start of a later word, inside a word, the start of another word for it, and letters in order', () => {
    expect(
      names('re', [
        ['Rotar el espejo', 'girar'],
        ['Quitar la hoja actual'],
        ['Agregar recorte'],
        ['Rehacer'],
        ['Abrir Preferencias'],
        ['Deshacer', 'revertir'],
      ])
    ).toEqual(['Rehacer', 'Agregar recorte', 'Abrir Preferencias', 'Deshacer', 'Rotar el espejo']);
  });

  test('a tie goes to the shorter name, then to the first one', () => {
    expect(names('dup', [['Duplicar el proyecto'], ['Duplicar'], ['Duplicado']])).toEqual(['Duplicar', 'Duplicado', 'Duplicar el proyecto']);
  });

  test('the name counts more than the other words', () => {
    expect(names('girar', [['Rotar a la derecha', 'girar'], ['Girar la vista']])).toEqual(['Girar la vista', 'Rotar a la derecha']);
  });
});
