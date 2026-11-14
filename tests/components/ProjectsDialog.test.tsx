// @vitest-environment jsdom
// «Proyectos» around the list: one short reassurance next to «Nuevo
// proyecto», the empty state only when there are no projects, and the space
// used as a thin bar with its numbers (warning above 80 %, nothing when the
// browser doesn't say). Opening, renaming and deleting cards: e2e/specs/projects.spec.ts.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ProjectsDialog from '../../src/components/dialogs/ProjectsDialog.tsx';
import { emptyDoc } from '../../src/core/projectstore.js';
import { useProjectList } from '../../src/state/actions/dialogs.ts';
import { useProject } from '../../src/state/project.ts';

vi.mock('../../src/services/projects.ts', () => ({ duplicate: vi.fn(), projectSession: () => ({ record: null }), rename: vi.fn(), list: async () => [], estimate: async () => null }));

const nb = (s: string | null | undefined) => String(s ?? '').replace(/ /g, ' ');
const record = (id: string, name: string) => ({ id, name, created: 1, modified: 1, opened: 1, version: 5, doc: emptyDoc(), counts: { sheets: 1, pieces: 0 }, thumb: null, damaged: false });

beforeEach(() => {
  useProject.setState({ id: 'p1', name: 'Uno', status: 'saved', storage: true });
});
afterEach(cleanup);

describe('around the list', () => {
  test('one short reassurance next to «Nuevo proyecto», and no empty note while there are projects', () => {
    useProjectList.setState({ records: [record('p1', 'Uno')], usage: null });
    render(<ProjectsDialog />);
    expect(screen.getByRole('button', { name: 'Nuevo proyecto' })).toBeTruthy();
    expect(document.querySelector('.projects-note')?.textContent).toBe('El proyecto abierto se guarda solo');
    expect((document.getElementById('projects-empty') as HTMLElement).hidden).toBe(true);
  });

  test('with no projects at all: «Todavía no hay proyectos», as plain text', () => {
    useProjectList.setState({ records: [], usage: null });
    render(<ProjectsDialog />);
    const empty = document.getElementById('projects-empty') as HTMLElement;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe('Todavía no hay proyectos');
  });
});

describe('the space used', () => {
  test('a thin bar and «2,3 MB de 10,7 GB usados»; «menos de 1 %» rather than «0 %», with a fill that still shows', () => {
    useProjectList.setState({ records: [record('p1', 'Uno')], usage: { usage: 2_300_000, quota: 10_700_000_000 } });
    render(<ProjectsDialog />);
    const meter = screen.getByRole('meter', { name: 'Espacio usado en este navegador' });
    expect(nb(meter.getAttribute('aria-valuetext'))).toBe('2,3 MB de 10,7 GB usados (menos de 1 %)');
    expect(nb(document.getElementById('projects-usage')?.textContent)).toBe('2,3 MB de 10,7 GB usados');
    expect(nb(document.querySelector('.storage-percent')?.textContent)).toBe('menos de 1 %');
    expect((meter.firstElementChild as HTMLElement).style.width).toBe('2%');
    expect(document.getElementById('storage-low')).toBeNull();
  });

  test('above 80 %: the warning look and a short notice to free space', () => {
    useProjectList.setState({ records: [record('p1', 'Uno')], usage: { usage: 8_600_000_000, quota: 10_000_000_000 } });
    render(<ProjectsDialog />);
    expect(document.getElementById('storage-usage')?.dataset.level).toBe('warning');
    expect(document.getElementById('storage-low')?.textContent).toBe('Queda poco espacio. Elimina proyectos que no uses.');
    expect(nb(document.querySelector('.storage-percent')?.textContent)).toBe('86 %');
  });

  test('when the browser doesn’t say: no bar and no footer', () => {
    useProjectList.setState({ records: [record('p1', 'Uno')], usage: null });
    render(<ProjectsDialog />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(document.querySelector('.dialog-foot')).toBeNull();
  });
});
