// @vitest-environment jsdom
// One icon, one meaning: «Duplicar» has the same icon in the piece toolbar,
// the context menu and «Proyectos», and the list's «Se sale de la hoja»
// badge isn't the scissors of «Cortar». (Lucide draws no class per icon: the
// drawings themselves are compared.)
import { act, cleanup, render } from '@testing-library/react';
import { CopyPlus, Scissors } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { PieceToolbar } from '../../src/components/canvas/PieceToolbar.tsx';
import ProjectsDialog from '../../src/components/dialogs/ProjectsDialog.tsx';
import { PieceList } from '../../src/components/pieces-panel/PieceList.tsx';
import { Icon } from '../../src/components/ui/Icon.tsx';
import { emptyDoc } from '../../src/core/projectstore.js';
import { setDocument } from '../../src/state/document.ts';
import { useProjectList } from '../../src/state/actions/dialogs.ts';
import { useProject } from '../../src/state/project.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

vi.mock('../../src/services/projects.ts', () => ({ duplicate: vi.fn(), projectSession: () => ({ record: null }), rename: vi.fn(), list: async () => [], estimate: async () => null }));

/** The drawing of an icon (its shapes, without the outer <svg>). */
const drawing = (svg: Element | null | undefined) => svg?.innerHTML ?? '';
const drawn = (glyph: typeof CopyPlus) => {
  const holder = document.createElement('div');
  holder.innerHTML = renderToStaticMarkup(<Icon icon={glyph} />);
  return drawing(holder.querySelector('svg'));
};

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});
beforeEach(() => resetState());
afterEach(cleanup);

describe('one icon, one meaning', () => {
  test('«Duplicar» in the piece toolbar and in a project card is the same «copy plus» icon', () => {
    const photo = fakeImage();
    act(() => setDocument({ items: [piece(1, photo, 20, 20)], selection: [1] }));
    render(<PieceToolbar />);
    expect(drawing(document.querySelector('[data-action="duplicate"] svg'))).toBe(drawn(CopyPlus));
    cleanup();
    useProject.setState({ id: 'p1', name: 'Uno', status: 'saved', storage: true });
    useProjectList.setState({ records: [{ id: 'p1', name: 'Uno', created: 1, modified: 1, opened: 1, version: 5, doc: emptyDoc(), counts: { sheets: 1, pieces: 0 }, thumb: null, damaged: false }], usage: null });
    render(<ProjectsDialog />);
    expect(drawing(document.querySelector('[data-act="duplicate"] svg'))).toBe(drawn(CopyPlus));
  });

  test('a piece off the sheet gets a badge that isn’t the scissors of «Cortar»', () => {
    const photo = fakeImage();
    render(<PieceList />);
    act(() => setDocument({ items: [piece(1, photo, -40, 20)] }));
    const badge = document.querySelector('.row-badge[data-kind="cut"] svg');
    expect(badge).not.toBeNull();
    expect(drawing(badge)).not.toBe(drawn(Scissors));
  });
});
