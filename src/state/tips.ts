// Usage tips: when someone does something the slow way again and again, the
// faster way, once, in the notice area (components/feedback/UsageTip.tsx),
// with «No volver a mostrar». Counting lives here: the buttons, menus, palette,
// keys, gestures and fields report which action they ran and by which route
// (`used` and the reports below); the table says what counts toward each tip,
// and core/tips.js decides which one is due. The switch of «Consejos de uso»
// in Preferencias turns them off; on again, the dismissed ones come back.

import { create } from 'zustand';
import { TIPS_STORAGE } from '../config.ts';
import { parseTipPrefs, serializeTipPrefs } from '../core/storedprefs.js';
import { decideTip, forgetCounts, noteUse, topicOf, type ActionRule, type Route, type TipCounts, type TipRule, type UsageEvent } from '../core/tips.js';
import { choiceParts, keyLabel, t, type CopyKey } from '../copy/index.ts';
import { announce } from '../components/feedback/announcer.ts';
import { SHORTCUTS } from '../hooks/shortcuts.ts';
import { storageJson, storageSet } from '../services/storage/local.ts';
import type { CommandId } from './commands.ts';
import { flushUi } from './flush.ts';
import { getPrefs } from './prefs.ts';
import { currentSheet, primaryItem, selectedItems } from './selectors.ts';
import { openPalette, openPrefs } from './actions/dialogs.ts';
import { revealPanel } from './actions/drawers.ts';
import { pieceNode, sheetNode } from './actions/focus.ts';
import { showPropsTab } from './actions/panels.ts';

export type { Route };

/** What is reported: the commands, and what isn't one (copies ×N, filling, opening the palette, zooming with the wheel or two fingers). */
export type UsageId = CommandId | 'duplicateMany' | 'fill' | 'palette' | 'zoomGesture';

interface Tip extends TipRule {
  text: () => string;
  action?: { label: CopyKey; run: () => void };
}

/** A tip on its way to the notice area, or in it. */
export interface ShownTip {
  id: string;
  topic: string;
  text: string;
  action: { label: string; run: () => void } | null;
  /** On screen (until then it waits for the notice area to be free). */
  shown: boolean;
}

// ---------- The tips ----------

/** The slow ways to an action that has keys (a tap isn't one: no keyboard at hand). */
const SLOW: readonly Route[] = ['pointer', 'keyboard', 'menu'];
const ROTATE: readonly UsageId[] = ['rotateLeft', 'rotateRight'];
const ZOOM: readonly UsageId[] = ['zoomIn', 'zoomOut'];
const ALIGN: readonly UsageId[] = ['alignLeft', 'alignCenterX', 'alignRight', 'alignTop', 'alignCenterY', 'alignBottom'];
const byKeys = (actions: readonly UsageId[]): ActionRule[] => [{ actions, routes: ['shortcut'] }];

/** Alternatives as the language says them («Supr o Retroceso»). */
const either = (...combos: string[]) =>
  choiceParts(combos.map(keyLabel))
    .map((part) => part.value)
    .join('');

/**
 * The pieza tab with «Duplicar ×N»'s count focused, and the panel open where
 * it collapses; when the panel closes, the focus goes back to the piece.
 */
function goToDuplicate() {
  revealPanel('props', pieceNode(primaryItem()?.id) ?? sheetNode(currentSheet()));
  showPropsTab('piece');
  flushUi();
  const field = document.getElementById('dup-count') as HTMLInputElement | null;
  if (!field || field.closest('[hidden]')) return;
  field.scrollIntoView({ block: 'nearest' });
  field.focus({ preventScroll: true });
  field.select();
}

// In order: when two are due at once, the first shows.
const TIPS: readonly Tip[] = [
  {
    id: 'duplicateMany',
    when: { pattern: 'duplicateSame' },
    session: 3,
    knownBy: [{ actions: ['duplicateMany'] }],
    text: () => t('tips.duplicateMany'),
    action: { label: 'tips.showDuplicate', run: () => goToDuplicate() },
  },
  { id: 'undoKey', when: { actions: ['undo'], routes: SLOW }, session: 3, total: 8, keys: true, knownBy: byKeys(['undo']), text: () => t('tips.undoKey', { keys: keyLabel(SHORTCUTS.undo.kbd) }) },
  { id: 'redoKey', when: { actions: ['redo'], routes: SLOW }, session: 3, total: 8, keys: true, knownBy: byKeys(['redo']), text: () => t('tips.redoKey', { keys: keyLabel(SHORTCUTS.redo.kbd) }) },
  {
    id: 'removeKey',
    when: { actions: ['remove'], routes: SLOW },
    session: 3,
    total: 8,
    keys: true,
    knownBy: byKeys(['remove']),
    text: () => t('tips.removeKey', { keys: either(SHORTCUTS.remove.kbd, SHORTCUTS.removeAlt.kbd) }),
  },
  {
    id: 'rotateKey',
    when: { actions: ROTATE, routes: SLOW },
    session: 4,
    total: 10,
    keys: true,
    singleKeys: true,
    knownBy: byKeys(ROTATE),
    text: () => t('tips.rotateKey', { right: keyLabel(SHORTCUTS.rotateRight.kbd), left: keyLabel(SHORTCUTS.rotateLeft.kbd) }),
  },
  {
    id: 'rotateKeysOff',
    topic: 'singleKeysOff',
    when: { actions: ROTATE, routes: SLOW },
    session: 4,
    total: 10,
    keys: true,
    singleKeys: false,
    knownBy: byKeys(ROTATE),
    text: () => t('tips.rotateKeysOff', { right: keyLabel(SHORTCUTS.rotateRight.kbd), left: keyLabel(SHORTCUTS.rotateLeft.kbd) }),
    action: { label: 'tips.openPrefs', run: () => openPrefs() },
  },
  {
    id: 'arrangeKey',
    when: { actions: ['arrange'], routes: SLOW },
    session: 3,
    total: 8,
    keys: true,
    singleKeys: true,
    knownBy: byKeys(['arrange']),
    text: () => t('tips.arrangeKey', { keys: keyLabel(SHORTCUTS.arrange.kbd) }),
  },
  {
    id: 'arrangeKeysOff',
    topic: 'singleKeysOff',
    when: { actions: ['arrange'], routes: SLOW },
    session: 3,
    total: 8,
    keys: true,
    singleKeys: false,
    knownBy: byKeys(['arrange']),
    text: () => t('tips.arrangeKeysOff', { keys: keyLabel(SHORTCUTS.arrange.kbd) }),
    action: { label: 'tips.openPrefs', run: () => openPrefs() },
  },
  // Pieces of one sheet dragged one at a time, by someone who never used «Acomodar».
  { id: 'arrangeAll', when: { pattern: 'dragTidy' }, session: 5, knownBy: [{ actions: ['arrange'] }], text: () => t('tips.arrangeAll') },
  {
    id: 'zoomWheel',
    topic: 'zoom',
    when: { actions: ZOOM, routes: ['pointer'] },
    session: 5,
    total: 12,
    keys: true,
    knownBy: [...byKeys(ZOOM), { actions: ['zoomGesture'] }],
    text: () => t('tips.zoomWheel', { keys: keyLabel('Mod+Wheel') }),
  },
  {
    id: 'zoomPinch',
    topic: 'zoom',
    when: { actions: ZOOM, routes: ['touch'] },
    session: 5,
    total: 12,
    knownBy: [...byKeys(ZOOM), { actions: ['zoomGesture'] }],
    text: () => t('tips.zoomPinch'),
  },
  // The same X or Y typed for several pieces, one by one.
  { id: 'alignButtons', when: { pattern: 'sameTyped' }, session: 3, knownBy: [{ actions: ALIGN }], text: () => t('tips.alignButtons') },
  {
    id: 'sameFile',
    when: { pattern: 'fileAgain' },
    session: 2,
    knownBy: [{ actions: ['duplicate', 'duplicateMany', 'fill'] }],
    text: () => t('tips.sameFile'),
    action: { label: 'tips.showDuplicate', run: () => goToDuplicate() },
  },
  // The same action chosen in the context menu again and again, where no shortcut is shown for it.
  {
    id: 'palette',
    when: { routes: ['menu'], each: true, keyless: true },
    session: 3,
    keys: true,
    knownBy: [{ actions: ['palette'] }],
    text: () => t('tips.palette', { keys: keyLabel(SHORTCUTS.palette.kbd) }),
    action: { label: 'tips.openPalette', run: () => openPalette() },
  },
];

// ---------- What is kept ----------

/** How long a tip waits for the notice area to be free before it is dropped (ms). */
const WAIT_MS = 20_000;
/** Pieces dragged further apart than this (ms) don't make one tidying. */
const TIDY_GAP_MS = 60_000;
/** Two typed positions this close (mm) are the same. */
const SAME_MM = 0.05;

export interface TipsState {
  /** The switch of «Consejos de uso» in Preferencias. */
  on: boolean;
  /** The topics with «No volver a mostrar». */
  dismissed: readonly string[];
  /** The tip waiting for the notice area, or in it. */
  tip: ShownTip | null;
}

let saved = parseTipPrefs(storageJson(TIPS_STORAGE));
export const useTips = create<TipsState>()(() => ({ on: saved.on, dismissed: saved.dismissed, tip: null }));

/** The counts (this session's and the saved ones) and the known topics. */
let counts: TipCounts = { session: {}, total: saved.counts, known: saved.known };

// This session: the topics shown, when the last one showed, and the repetitions being watched.
const fresh = () => ({
  shown: [] as string[],
  lastShownAt: null as number | null,
  copies: { asset: null as string | null, n: 0 },
  drags: { sheet: -1, at: 0, ids: new Set<number>() },
  typed: { field: '', mm: 0, ids: new Set<number>() },
  again: 0,
});
let session = fresh();
let waiting: ReturnType<typeof setTimeout> | undefined;

function save() {
  const { on, dismissed } = useTips.getState();
  storageSet(TIPS_STORAGE, JSON.stringify(serializeTipPrefs({ on, dismissed, known: counts.known, counts: counts.total })));
}

/** Only touch: no mouse, trackpad or pen that hovers, nor one that points finely. */
const touchOnly = () => typeof matchMedia === 'function' && !matchMedia('(any-pointer: fine)').matches && !matchMedia('(any-hover: hover)').matches;

// ---------- Counting ----------

function note(event: UsageEvent) {
  const before = counts;
  counts = noteUse(TIPS, counts, event);
  if (counts.total !== before.total || counts.known !== before.known) save();
}

/** Offers the tip that is due, if any and if none is on its way. */
function offer() {
  const { on, dismissed, tip: current } = useTips.getState();
  if (current) return;
  const tip = decideTip(TIPS, {
    on,
    dismissed,
    known: counts.known,
    session: counts.session,
    total: counts.total,
    shown: session.shown,
    lastShownAt: session.lastShownAt,
    now: Date.now(),
    touchOnly: touchOnly(),
    singleKeys: getPrefs().singleKeys,
  });
  if (!tip) return;
  counts = forgetCounts(tip, counts);
  save();
  const action = tip.action ? { label: t(tip.action.label), run: tip.action.run } : null;
  useTips.setState({ tip: { id: tip.id, topic: topicOf(tip), text: tip.text(), action, shown: false } });
  clearTimeout(waiting);
  waiting = setTimeout(() => {
    if (useTips.getState().tip?.shown === false) useTips.setState({ tip: null });
  }, WAIT_MS);
}

/**
 * Action `id` ran, reached by `route`. Call it after running it. `keyed`: a
 * menu showed a shortcut for it (core/tips.js `keyless`).
 */
export function used(id: UsageId, route: Route, { keyed = false } = {}) {
  if (!useTips.getState().on) return;
  const before = counts;
  note({ action: id, route, keyed });
  if (id === 'duplicate' || id === 'duplicateMany') {
    // One copy at a time of the same piece: the copy is selected now, of the same file.
    const items = selectedItems();
    const asset = id === 'duplicate' && items.length === 1 ? items[0].asset : null;
    const { copies } = session;
    session.copies = asset && asset === copies.asset ? { asset, n: copies.n + 1 } : { asset, n: asset ? 1 : 0 };
    note({ pattern: 'duplicateSame', n: session.copies.n });
  }
  if (id === 'arrange') session.drags = fresh().drags;
  // Nothing counted (a wheel zoom many times a second, once known): nothing can be due.
  if (counts !== before) offer();
}

// The kind of the last pointer pressed: a control's click doesn't say whether it was a tap.
let lastPointer = 'mouse';
if (typeof document !== 'undefined') document.addEventListener('pointerdown', (e) => (lastPointer = e.pointerType), true);

/** Where a control's click came from: a tap, a click, or Enter or Space (no pointer: `detail` 0). */
export const controlRoute = (e: { detail: number }): Route => (e.detail === 0 ? 'keyboard' : lastPointer === 'touch' ? 'touch' : 'pointer');

/** A control's click handler that runs `run` and reports it as action `id`. */
export const control = (id: UsageId, run: () => void) => (e: { detail: number }) => {
  run();
  used(id, controlRoute(e));
};

/** A piece was dragged to another place on `sheet` (alone, not with a group). */
export function draggedPiece(id: number, sheet: number) {
  if (!useTips.getState().on) return;
  const now = Date.now();
  const { drags } = session;
  if (drags.sheet !== sheet || now - drags.at > TIDY_GAP_MS) session.drags = { sheet, at: now, ids: new Set() };
  session.drags.at = now;
  session.drags.ids.add(id);
  note({ pattern: 'dragTidy', n: session.drags.ids.size });
  offer();
}

/** A position (`field` x or y, in mm) was typed for piece `id` alone. */
export function typedPosition(field: 'x' | 'y', mm: number, id: number) {
  if (!useTips.getState().on) return;
  const { typed } = session;
  if (typed.field !== field || Math.abs(typed.mm - mm) > SAME_MM) session.typed = { field, mm, ids: new Set() };
  session.typed.ids.add(id);
  note({ pattern: 'sameTyped', n: session.typed.ids.size });
  offer();
}

/** `n` files just added were already in the project. */
export function addedAgain(n: number) {
  if (!useTips.getState().on || n < 1) return;
  session.again += n;
  note({ pattern: 'fileAgain', n: session.again });
  offer();
}

// ---------- Showing and closing ----------

/** The notice area shows the tip now: it counts for the session's limits and is announced. */
export function tipShown() {
  const tip = useTips.getState().tip;
  if (!tip || tip.shown) return;
  clearTimeout(waiting);
  session.shown.push(tip.topic);
  session.lastShownAt = Date.now();
  useTips.setState({ tip: { ...tip, shown: true } });
  announce(tip.text, { key: 'tip' });
}

/** The tip goes away (its close button, its time, or something else needs the place); it doesn't come back this session. */
export function closeTip() {
  clearTimeout(waiting);
  if (useTips.getState().tip) useTips.setState({ tip: null });
}

/** «No volver a mostrar»: never this topic again, in this browser. */
export function neverShow(topic: string) {
  const { dismissed, tip } = useTips.getState();
  if (!dismissed.includes(topic)) useTips.setState({ dismissed: [...dismissed, topic] });
  if (tip?.topic === topic) closeTip();
  save();
}

/**
 * The switch of «Consejos de uso». Off, no tip shows and nothing counts. On again,
 * every tip is active again: the dismissed ones and the ones already shown
 * this session too. The known topics stay known (that tip isn't needed).
 */
export function setTipsOn(on: boolean) {
  if (on && !useTips.getState().on) {
    session.shown = [];
    session.lastShownAt = null;
    useTips.setState({ on, dismissed: [] });
  } else useTips.setState({ on });
  if (!on) closeTip();
  save();
}

/** Starts over from what is stored, as a new page load would (for tests). */
export function resetTips() {
  clearTimeout(waiting);
  saved = parseTipPrefs(storageJson(TIPS_STORAGE));
  counts = { session: {}, total: saved.counts, known: saved.known };
  session = fresh();
  useTips.setState({ on: saved.on, dismissed: saved.dismissed, tip: null });
}
