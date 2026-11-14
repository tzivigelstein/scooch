// @vitest-environment jsdom
// The settings registry (src/state/settings.ts) against the stores: every
// value a store holds is declared with where it lives, and changing each one
// writes exactly where it was declared to live: a document setting changes
// what is saved of the project (and, when declared so, is in the undo
// history) and writes nothing to this browser; a device setting writes its
// localStorage key and nothing else, and never the document; session and
// ephemeral values are written nowhere.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { serialize } from '../../src/core/projectdoc.js';
import { fromPercent } from '../../src/core/zoom.js';
import { SETTINGS, type Setting } from '../../src/state/settings.ts';
import { allAssets } from '../../src/state/assets.ts';
import { getDocument, setDocument, useDocument } from '../../src/state/document.ts';
import { commit, undo } from '../../src/state/history.ts';
import { setCutOptionsOpen, setGrid, setLanguage, setPrinting, setSectionOpen, setSingleKeys, setTheme, setUnit, usePrefs } from '../../src/state/prefs.ts';
import { recordSavings } from '../../src/state/savings.ts';
import { rememberView, setView, useView } from '../../src/state/view.ts';
import { setPaperSide, choosePaper } from '../../src/state/actions/sheets.ts';
import { neverAskDonation } from '../../src/components/dialogs/donate.ts';
import { rememberCommand } from '../../src/components/palette/recents.ts';
import { neverShow, resetTips, setTipsOn, used, useTips } from '../../src/state/tips.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const STORES = { document: useDocument, prefs: usePrefs, view: useView, tips: useTips } as const;

/** How the person changes each setting (through the same calls the app uses). */
const CHANGES: Record<string, () => void> = {
  'document.sheets': () => setDocument({ sheets: [{ id: 1 }, { id: 7 }] }),
  'document.items': () => setDocument({ items: [{ ...getDocument().items[0], x: 99 }] }),
  'document.paper': () => setDocument({ paper: 'A3' }),
  'document.landscape': () => setDocument({ landscape: true }),
  'document.margin': () => setDocument({ margin: 3 }),
  'document.gap': () => setDocument({ gap: 9 }),
  'document.cuts': () => setDocument({ cuts: { ...getDocument().cuts, mode: 'outline' } }),
  'document.allowOverlap': () => setDocument({ allowOverlap: true }),
  'document.rotate': () => setDocument({ rotate: false }),
  'document.selection': () => setDocument({ selection: [1] }),
  'document.busy': () => setDocument({ busy: true }),
  'document.canUndo': () => setDocument({ canUndo: true }),
  'document.canRedo': () => setDocument({ canRedo: true }),
  'prefs.unit': () => setUnit('cm'),
  'prefs.singleKeys': () => setSingleKeys(false),
  'prefs.grid': () => setGrid({ size: 5 }),
  'prefs.sections': () => setSectionOpen('grid', false),
  'prefs.cutOptions': () => setCutOptionsOpen(true),
  'prefs.printing': () => setPrinting({ summary: false }),
  'prefs.theme': () => setTheme('dark'),
  'prefs.language': () => setLanguage('es'),
  'view.zoomMode': () => (setView({ zoomMode: 'width' }), rememberView()),
  'view.zoom': () => (setView({ zoomMode: 'manual', zoom: fromPercent(250) }), rememberView()),
  'view.alignTo': () => (setView({ alignTo: 'sheet' }), rememberView()),
  'view.distribute': () => (setView({ distribute: 'even' }), rememberView()),
  'null.customPaper': () => (choosePaper('custom'), setPaperSide('w', 120, { final: true })),
  'null.donateDismissed': () => neverAskDonation(),
  'null.savings': () => recordSavings(3, 'a-pdf', 'print'),
  'null.paletteRecents': () => rememberCommand('undo'),
  'tips.on': () => setTipsOn(false),
  'tips.dismissed': () => neverShow('undoKey'),
  'null.tipCounts': () => used('undo', 'pointer'),
  'tips.tip': () => useTips.setState({ tip: { id: 'undoKey', topic: 'undoKey', text: 'Un consejo', action: null, shown: true } }),
  'view.sheet': () => setView({ sheet: 7 }),
  'view.pinned': () => setView({ pinned: true }),
  'view.drawer': () => setView({ drawer: 'props' }),
  'view.propsTab': () => setView({ propsTab: 'piece' }),
  'view.flash': () => setView({ flash: { text: 'Un aviso' } }),
  'view.busyText': () => setView({ busyText: 'Cargando…' }),
  'view.animating': () => setView({ animating: true }),
  'view.loading': () => setView({ loading: false }),
  'view.editing': () => setView({ editing: true }),
  'view.cropping': () => setView({ cropping: 1 }),
};

const id = (s: Setting) => `${s.store}.${s.key}`;
/** What is saved of the project now (as services/projects.ts saves it). */
const savedDocument = () => {
  const { sheets, items, paper, landscape, margin, gap, cuts, rotate, allowOverlap } = getDocument();
  return JSON.stringify(serialize({ sheets, items, paper, landscape, margin, gap, cuts, rotate, allowOverlap }, allAssets()));
};

let writes: string[] = [];

beforeEach(() => {
  localStorage.clear();
  resetState({ items: [piece(1, fakeImageMm(40, 30), 20, 20)] });
  setView({ zoomMode: 'fit', zoom: fromPercent(100), alignTo: 'selection', distribute: 'gap' });
  rememberView();
  resetTips();
  localStorage.clear();
  writes = [];
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    writes.push(key);
    return setItem.call(this, key, value);
  });
});
afterEach(() => vi.restoreAllMocks());

describe('the settings registry', () => {
  test('every value of every store is declared once, with where it lives', () => {
    for (const [name, store] of Object.entries(STORES)) {
      const keys = Object.keys(store.getState()).filter((key) => typeof (store.getState() as unknown as Record<string, unknown>)[key] !== 'function');
      const declared = SETTINGS.filter((s) => s.store === name).map((s) => s.key);
      expect(keys.sort(), `${name}: declared in src/state/settings.ts`).toEqual([...declared].sort());
    }
    const ids = SETTINGS.map(id);
    expect(new Set(ids).size, 'no setting declared twice').toBe(ids.length);
    for (const s of SETTINGS) expect(!!s.storage, `${id(s)}: a device setting says where it is kept, and only it`).toBe(s.lives === 'device');
  });

  test('the test changes every declared setting (a new one needs its change here)', () => {
    const changeable = SETTINGS.filter((s) => s.key !== 'lastProject' && s.key !== 'journal').map(id);
    expect(Object.keys(CHANGES).sort()).toEqual(changeable.sort());
  });

  for (const setting of SETTINGS.filter((s) => CHANGES[id(s)])) {
    test(`${id(setting)} (${setting.lives}) is kept where it was declared`, () => {
      const before = savedDocument();
      if (setting.undo) commit();
      CHANGES[id(setting)]();
      const changedDocument = savedDocument() !== before;
      if (setting.lives === 'document') {
        expect(changedDocument, 'what is saved of the project changes').toBe(true);
        expect(writes, 'nothing in this browser').toEqual([]);
        if (setting.undo) {
          undo();
          expect(savedDocument(), 'undo brings it back').toBe(before);
        }
      } else if (setting.lives === 'device') {
        expect(writes.length, 'written to this browser').toBeGreaterThan(0);
        expect([...new Set(writes)], `only ${setting.storage}`).toEqual([setting.storage]);
        // A custom paper is a document change too; its last size is the preference.
        if (setting.key !== 'customPaper') expect(changedDocument, 'not the project').toBe(false);
      } else {
        expect(writes, 'written nowhere').toEqual([]);
        expect(changedDocument, 'not the project').toBe(false);
      }
    });
  }
});
