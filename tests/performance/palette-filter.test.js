import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { fuzzyFilter, prepare } from '../../src/core/fuzzy.js';

// Time budget of the command palette's search: every key typed filters every
// command again, so 200 commands (more than three times the app's) must
// filter in under 5 ms. The median of 25 runs per query (after warming up)
// keeps one slow run of a loaded machine from deciding it.

const VERBS = ['Agregar', 'Quitar', 'Rotar', 'Alinear', 'Distribuir', 'Cambiar', 'Mostrar', 'Ocultar', 'Ir a', 'Usar'];
const OBJECTS = ['la hoja', 'la pieza', 'el papel', 'la grilla', 'el imán', 'las líneas de corte', 'la vista', 'el tema oscuro', 'la pestaña Proyecto', 'el tamaño real'];
const SIDES = ['', ' a la izquierda', ' a la derecha', ' arriba', ' abajo', ' en horizontal', ' en vertical', ' al centro', ' otra vez', ' de cada hoja'];

const commands = Array.from({ length: 200 }, (_, i) => ({
  name: `${VERBS[i % 10]} ${OBJECTS[Math.floor(i / 10) % 10]}${SIDES[Math.floor(i / 100) * 5 + (i % 5)]}`,
  aliases: 'girar, voltear, borrar, eliminar, configuración, ajustes, cuadrícula, zoom',
}));

const QUERIES = ['r', 'ro', 'rot', 'rotar izq', 'gir', 'pestana proy', 'dpl', 'zzz', 'a la derecha'];

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

describe('palette search time', () => {
  test('folding 200 commands for a search, once when the palette opens, in under 5 ms', async (t) => {
    for (let i = 0; i < 5; i++) commands.map((c) => prepare(c.name, c.aliases));
    const runs = Array.from({ length: 25 }, () => {
      const t0 = performance.now();
      commands.map((c) => prepare(c.name, c.aliases));
      return performance.now() - t0;
    });
    await t.annotate(`prepare 200 commands: median ${median(runs).toFixed(3)} ms`);
    assert.ok(median(runs) < 5, `took ${median(runs).toFixed(2)} ms`);
  });

  test('filtering 200 commands as a key is typed, for each kind of query, in under 5 ms', async (t) => {
    const targets = commands.map((c) => prepare(c.name, c.aliases));
    for (const query of QUERIES) {
      for (let i = 0; i < 5; i++) fuzzyFilter(query, targets);
      const runs = Array.from({ length: 25 }, () => {
        const t0 = performance.now();
        fuzzyFilter(query, targets);
        return performance.now() - t0;
      });
      await t.annotate(`«${query}»: ${fuzzyFilter(query, targets).length} found, median ${median(runs).toFixed(3)} ms`);
      assert.ok(median(runs) < 5, `«${query}» took ${median(runs).toFixed(2)} ms`);
    }
  });
});
