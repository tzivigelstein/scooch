// @vitest-environment jsdom
// A failed action in «Proyectos» says which one failed (and, out of room,
// that there is no room and where to make it), never a message for all of them.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getView, setView } from '../../src/state/view.ts';
import { projectFailed } from '../../src/state/actions/projects.ts';

beforeEach(() => {
  setView({ flash: null });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('a project action that failed', () => {
  test.each([
    ['rename', 'No se pudo cambiar el nombre. Inténtalo de nuevo.'],
    ['duplicate', 'No se pudo duplicar «Tarjetas». Inténtalo de nuevo.'],
    ['delete', 'No se pudo eliminar «Tarjetas». Inténtalo de nuevo.'],
    ['create', 'No se pudo crear el proyecto nuevo. Inténtalo de nuevo.'],
  ] as const)('%s: its own warning', (action, text) => {
    projectFailed(action, 'Tarjetas', new Error('IndexedDB went away'));
    expect(getView().flash).toEqual({ text, warn: true });
  });

  test('out of room, duplicating says so and offers «Ver proyectos»', () => {
    projectFailed('duplicate', 'Tarjetas', { name: 'QuotaExceededError' });
    expect(getView().flash).toMatchObject({
      text: 'No hay espacio para guardar el proyecto. Elimina proyectos que no uses y vuelve a intentarlo.',
      warn: true,
      action: { label: 'Ver proyectos' },
    });
  });
});
