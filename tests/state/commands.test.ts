// @vitest-environment jsdom
// The registry of commands (src/state/commands.ts) on the real stores: every
// command has a name, an icon and either something to do or choices; its keys
// are in the shortcut table; it says why it can't run (the reasons the menus
// and the panel already show), and running it does what its button or key does.
import { act } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { LANGUAGES } from '../../src/core/language.js';
import { CATALOGUES } from '../../src/copy/all.ts';
import es from '../../src/copy/es.ts';
import { setTexts } from '../../src/copy/index.ts';
import { LANGUAGE_NAMES } from '../../src/copy/languages.ts';
import { SHORTCUTS } from '../../src/hooks/shortcuts.ts';
import { COMMAND_IDS, SECTIONS, command, commands, isCommandId, type CommandId } from '../../src/state/commands.ts';
import { getDocument, setDocument } from '../../src/state/document.ts';
import { commit } from '../../src/state/history.ts';
import { getPrefs } from '../../src/state/prefs.ts';
import { useProject } from '../../src/state/project.ts';
import { getView, setView } from '../../src/state/view.ts';
import { copySelection } from '../../src/state/actions/clipboard.ts';
import { duplicate } from '../../src/services/projects.ts';
import { fakeImageMm, fakeQr, heard, listen, piece, resetState } from '../support/state.ts';

vi.mock('../../src/services/projects.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../src/services/projects.ts')>()), duplicate: vi.fn() }));

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
});

let card = '';
beforeEach(() => {
  document.body.innerHTML = '';
  listen();
  card = fakeImageMm(80, 50);
  resetState();
  act(() => useProject.setState({ id: 'p1', name: 'Tarjetas', status: 'saved', storage: true }));
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

/** Two cards on sheet 1, apart from each other, and a third on sheet 2. */
const twoSheets = (selection: number[] = []) =>
  resetState({ sheets: [{ id: 1 }, { id: 2 }], items: [piece(1, card, 10, 10), piece(2, card, 10, 100), piece(3, card, 10, 10, { sheet: 2 })], selection });

describe('the registry', () => {
  test('ids are unique; each command has a name, an icon, a section in order, and one of something to do, choices or a page to open', () => {
    expect(new Set(COMMAND_IDS).size).toBe(COMMAND_IDS.length);
    for (const c of commands()) {
      expect(c.label, c.id).toMatch(/\S/);
      expect(c.icon, c.id).toBeTruthy();
      expect(SECTIONS, c.id).toContain(c.section);
      expect([c.run, c.choices, c.href].filter(Boolean), `${c.id}: run, choices or href, only one`).toHaveLength(1);
    }
    // Listed section by section.
    const order = commands().map((c) => SECTIONS.indexOf(c.section));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  test('their keys are entries of the shortcut table, each with the keys it shows', () => {
    for (const c of commands()) for (const name of c.keys) expect((SHORTCUTS[name] as { kbd?: string }).kbd, `${c.id}: ${name}`).toBeTruthy();
  });

  test('names are distinct, so the palette never lists two the same', () => {
    const labels = commands().map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('a recent id saved by an older version that no longer exists isn’t a command', () => {
    expect(isCommandId('undo')).toBe(true);
    expect(isCommandId('toString')).toBe(false);
    expect(isCommandId('rotate')).toBe(false);
  });

  test('every unit and theme of Preferences has its command, which shows when it is the one in use', () => {
    expect(['unitMm', 'unitCm', 'unitIn'].map((id) => command(id as CommandId).label)).toEqual(['Medir en milímetros', 'Medir en centímetros', 'Medir en pulgadas']);
    expect(command('unitMm').current).toBe(true);
    expect(command('themeAuto').current).toBe(true);
    command('unitIn').run!();
    command('themeDark').run!();
    expect([getPrefs().unit, getPrefs().theme]).toEqual(['in', 'dark']);
    expect([command('unitMm').current, command('unitIn').current, command('themeDark').current]).toEqual([false, true, true]);
  });
});

describe('why a command can’t run', () => {
  const reasons = (ids: CommandId[]) => Object.fromEntries(ids.map((id) => [id, command(id).disabled]));

  test('without pieces: what needs them says there are none; adding and the rest can run', () => {
    expect(reasons(['arrange', 'print', 'download', 'selectAll', 'clearAll'])).toEqual({
      arrange: 'Todavía no hay piezas',
      print: 'Todavía no hay piezas',
      download: 'Todavía no hay piezas',
      selectAll: 'Todavía no hay piezas',
      clearAll: 'Todavía no hay piezas',
    });
    expect(reasons(['add', 'addSheet', 'gotoSheet', 'paper', 'grid', 'zoomFit', 'prefs', 'newProject'])).toEqual(
      Object.fromEntries(['add', 'addSheet', 'gotoSheet', 'paper', 'grid', 'zoomFit', 'prefs', 'newProject'].map((id) => [id, null]))
    );
  });

  test('without a selection, what acts on it asks for one first', () => {
    twoSheets();
    const ids: CommandId[] = ['duplicate', 'remove', 'rotateLeft', 'rotateRight', 'actualSize', 'selectSame', 'copy', 'cut', 'alignLeft', 'alignBottom', 'distributeX', 'fit', 'center', 'front', 'crop', 'moveToNewSheet'];
    expect(new Set(Object.values(reasons(ids)))).toEqual(new Set(['Primero selecciona una pieza']));
  });

  test('with two pieces, what works on one says so; distributing evenly needs three; two sheets can’t move to one new sheet', () => {
    twoSheets([1, 3]);
    expect(reasons(['fit', 'center', 'front', 'crop', 'moveToNewSheet', 'distributeX'])).toEqual({
      fit: 'Disponible con una sola pieza seleccionada',
      center: 'Disponible con una sola pieza seleccionada',
      front: 'Disponible con una sola pieza seleccionada',
      crop: 'Disponible con una sola pieza seleccionada',
      moveToNewSheet: 'Disponible cuando las piezas están en una misma hoja',
      distributeX: 'Selecciona 2 piezas o más de una misma hoja para distribuir',
    });
    twoSheets([1, 2]);
    expect(reasons(['distributeY', 'moveToNewSheet', 'rotateRight'])).toEqual({ distributeY: null, moveToNewSheet: null, rotateRight: null });
    setView({ distribute: 'even' });
    expect(command('distributeY').disabled).toBe('Selecciona 3 piezas o más de una misma hoja para repartir parejo');
  });

  test('cropping a QR code: it never is, and says so', () => {
    const qr = fakeQr();
    resetState({ items: [piece(1, qr, 10, 10), piece(2, card, 100, 10)], selection: [1] });
    expect(command('crop').disabled).toBe('Un código QR no se recorta');
    setDocument({ selection: [2] });
    expect(command('crop').disabled).toBeNull();
  });

  test('bringing to front, only over another piece', () => {
    twoSheets([1]);
    expect(command('front').disabled).toBe('Disponible cuando se superpone con otra pieza');
    setDocument({ items: [piece(1, card, 10, 10), piece(2, card, 20, 20)], selection: [1] });
    expect(command('front').disabled).toBeNull();
  });

  test('undo and redo with nothing to undo or redo; pasting with nothing copied; removing the only sheet', () => {
    resetState({ items: [piece(1, card, 10, 10)], selection: [1] });
    expect(reasons(['undo', 'redo', 'paste', 'removeSheet'])).toEqual({
      undo: 'No hay cambios para deshacer',
      redo: 'No hay cambios para rehacer',
      paste: 'Primero copia piezas. Para pegar una imagen copiada en otra app, usa Ctrl+V.',
      removeSheet: 'Disponible con 2 hojas o más',
    });
    commit();
    setDocument({ items: [piece(1, card, 30, 10)] });
    void copySelection({ quiet: true });
    expect(reasons(['undo', 'paste'])).toEqual({ undo: null, paste: null });
  });

  test('duplicating or renaming the project where this browser can’t save projects', () => {
    act(() => useProject.setState({ id: null, name: null, status: 'off', storage: false }));
    expect(reasons(['duplicateProject', 'renameProject'])).toEqual({ duplicateProject: 'Este navegador no permite guardar proyectos', renameProject: 'Este navegador no permite guardar proyectos' });
  });
});

describe('running a command does what its button or key does', () => {
  test('rotating, duplicating and removing the selection', () => {
    resetState({ items: [piece(1, card, 10, 10)], selection: [1] });
    command('rotateRight').run!();
    expect(getDocument().items[0].r).toBe(90);
    command('rotateLeft').run!();
    expect(getDocument().items[0].r).toBe(0);
    command('duplicate').run!();
    expect(getDocument().items).toHaveLength(2);
    command('remove').run!();
    expect(getDocument().items).toHaveLength(1);
  });

  test('adding a sheet and removing the current one, in one undo step each', () => {
    command('addSheet').run!();
    expect(getDocument().sheets).toHaveLength(2);
    expect(getDocument().canUndo).toBe(true);
    command('removeSheet').run!();
    expect(getDocument().sheets).toHaveLength(1);
  });

  test('going to a sheet: one choice per sheet, the current one marked; choosing one makes it current', () => {
    twoSheets();
    const choices = command('gotoSheet').choices!();
    expect(choices.map((c) => [c.label, !!c.current])).toEqual([
      ['Hoja 1 de 2', true],
      ['Hoja 2 de 2', false],
    ]);
    choices[1].run();
    expect(getView().sheet).toBe(2);
    expect(getDocument().selection).toEqual([3]);
  });

  test('the paper: every preset by its series and «Personalizado» last, A4 marked; choosing A3 changes it', () => {
    const choices = command('paper').choices!();
    expect(choices.find((c) => c.current)?.id).toBe('A4');
    expect(choices.at(-1)).toMatchObject({ id: 'custom', label: 'Personalizado', current: false });
    const a3 = choices.find((c) => c.id === 'A3')!;
    expect([plain(a3.label), a3.group]).toEqual(['A3 (297 × 420 mm)', 'Serie A']);
    choices.find((c) => c.id === 'A3')!.run();
    expect(getDocument().paper).toBe('A3');
  });

  test('the cut lines: the four modes, the one in use marked; choosing one sets it', () => {
    const choices = command('cutLines').choices!();
    expect(choices.map((c) => c.label)).toEqual(['Ninguna', 'Esquinas', 'Contorno', 'Silueta']);
    expect(choices.find((c) => c.current)?.id).toBe(getDocument().cuts.mode);
    choices.find((c) => c.id === 'contour')!.run();
    expect(getDocument().cuts.mode).toBe('contour');
  });

  test('the language: «Automático» and each language by its own name (marked with it), the one chosen marked; choosing one saves it', () => {
    const choices = command('language').choices!();
    expect(choices.map((c) => [c.id, c.lang])).toEqual([['auto', undefined], ...LANGUAGES.map((language) => [language, language])]);
    expect(choices.slice(1).map((c) => c.label)).toEqual(LANGUAGES.map((language) => LANGUAGE_NAMES[language]));
    expect(choices.find((c) => c.current)?.id).toBe('auto');
    choices.at(-1)!.run();
    expect(getPrefs().language).toBe(LANGUAGES.at(-1));
    expect(command('language').choices!().find((c) => c.current)?.id).toBe(LANGUAGES.at(-1));
  });

  test('the orientation, the grid and the magnet switch, and the grid and the magnet say so', () => {
    command('orientation').run!();
    expect(getDocument().landscape).toBe(true);
    command('grid').run!();
    expect(getPrefs().grid.show).toBe(true);
    expect(heard()).toMatch(/Grilla visible/);
    command('snap').run!();
    expect(getPrefs().grid.snap).toBe(false);
    expect(heard()).toBe('Imán desactivado.');
    command('snap').run!();
    expect(heard()).toBe('Imán activado.');
  });

  test('duplicating the project: it stays open, and a notice says so and offers to see the projects; if it fails, the notice says which', async () => {
    vi.mocked(duplicate).mockResolvedValueOnce({ id: 'p2', name: 'Tarjetas (copia)' } as Awaited<ReturnType<typeof duplicate>>);
    command('duplicateProject').run!();
    await vi.waitFor(() => expect(getView().flash?.text).toBe('Se duplicó «Tarjetas»'));
    expect(duplicate).toHaveBeenCalledWith('p1');
    expect(getView().flash?.action?.label).toBe('Ver proyectos');
    vi.mocked(duplicate).mockRejectedValueOnce(new Error('disk'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    command('duplicateProject').run!();
    await vi.waitFor(() => expect(getView().flash).toMatchObject({ text: 'No se pudo duplicar «Tarjetas». Inténtalo de nuevo.', warn: true }));
  });

  test('renaming the project starts editing its name in the top bar', () => {
    const name = document.body.appendChild(Object.assign(document.createElement('button'), { id: 'project-name' }));
    const click = vi.fn();
    name.addEventListener('click', click);
    command('renameProject').run!();
    expect(click).toHaveBeenCalledTimes(1);
  });

  test('a unit already in use isn’t announced again; another one is', () => {
    command('unitMm').run!();
    expect(heard()).toBe('');
    command('unitCm').run!();
    expect(heard()).toBe('Medidas en centímetros.');
  });
});

describe('the questions', () => {
  afterEach(() => setTexts(es));

  test('a link to the site’s questions, after the keyboard shortcuts, with no keys; «ayuda», «guías», «preguntas» and «help» find it', () => {
    const c = command('faq');
    expect({ section: c.section, label: c.label, href: c.href, run: c.run, choices: c.choices, keys: c.keys }).toEqual({
      section: 'general',
      label: 'Ver las preguntas frecuentes',
      href: '/es/preguntas-frecuentes',
      run: null,
      choices: null,
      keys: [],
    });
    expect(COMMAND_IDS[COMMAND_IDS.indexOf('shortcuts') + 1]).toBe('faq');
    expect(c.aliases.split(', ')).toEqual(expect.arrayContaining(['ayuda', 'guías', 'preguntas', 'help']));
  });

  test.each([
    ['en', 'Show frequently asked questions', '/en/faq'],
    ['zh-Hans', '查看常见问题', '/zh-hans/faq'],
    ['hi', 'अक्सर पूछे जाने वाले सवाल देखें', '/hi/faq'],
    ['fr', 'Voir les questions fréquentes', '/fr/questions-frequentes'],
  ] as const)('in %s, the page of that language', (language, label, href) => {
    setTexts(CATALOGUES[language]);
    expect([command('faq').label, command('faq').href]).toEqual([label, href]);
  });
});
