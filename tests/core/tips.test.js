// Usage tips (src/core/tips.js): what counts toward each tip, by action and
// route, and which tip is due given the counts, the limits, what was
// dismissed or is known, and the device.
import { describe, expect, test } from 'vitest';
import { TIP_LIMITS, decideTip, forgetCounts, noteUse } from '../../src/core/tips.js';

const slow = ['pointer', 'keyboard', 'menu'];

/** A small table shaped like the app's: a shortcut tip, its variant without single keys, a repetition, a menu tip. */
const TIPS = [
  { id: 'undoKey', when: { actions: ['undo'], routes: slow }, session: 3, total: 8, keys: true, knownBy: [{ actions: ['undo'], routes: ['shortcut'] }] },
  { id: 'rotateKey', when: { actions: ['rotateLeft', 'rotateRight'], routes: slow }, session: 4, keys: true, singleKeys: true, knownBy: [{ actions: ['rotateLeft', 'rotateRight'], routes: ['shortcut'] }] },
  { id: 'rotateKeysOff', topic: 'singleKeysOff', when: { actions: ['rotateLeft', 'rotateRight'], routes: slow }, session: 4, keys: true, singleKeys: false, knownBy: [{ actions: ['rotateLeft', 'rotateRight'], routes: ['shortcut'] }] },
  { id: 'duplicateMany', when: { pattern: 'duplicateSame' }, session: 3, knownBy: [{ actions: ['duplicateMany'] }] },
  { id: 'zoomPinch', topic: 'zoom', when: { actions: ['zoomIn'], routes: ['touch'] }, session: 5 },
  { id: 'palette', when: { routes: ['menu'], each: true, keyless: true }, session: 3, keys: true, knownBy: [{ actions: ['palette'] }] },
];

const none = { session: {}, total: {}, known: [] };

/** The counts after these events, from none. */
const after = (...events) => events.reduce((counts, event) => noteUse(TIPS, counts, event), none);
const times = (n, event) => Array.from({ length: n }, () => event);

const state = (overrides = {}) => ({
  on: true,
  dismissed: [],
  known: [],
  session: {},
  total: {},
  shown: [],
  lastShownAt: null,
  now: 1_000_000,
  touchOnly: false,
  singleKeys: true,
  ...overrides,
});
const due = (overrides) => decideTip(TIPS, state(overrides))?.id ?? null;

describe('counting uses by route', () => {
  test('an action reached the slow way counts, in the session and (for a tip that says so) in total', () => {
    const counts = after({ action: 'undo', route: 'pointer' }, { action: 'undo', route: 'keyboard' }, { action: 'rotateRight', route: 'menu' });
    expect(counts.session).toEqual({ undoKey: 2, rotateKey: 1, rotateKeysOff: 1 });
    expect(counts.total).toEqual({ undoKey: 2 });
  });

  test('the same action by its shortcut doesn’t count, and makes its topic known', () => {
    const counts = after(...times(5, { action: 'undo', route: 'shortcut' }));
    expect(counts.session).toEqual({});
    expect(counts.total).toEqual({});
    expect(counts.known).toEqual(['undoKey']);
  });

  test('routes a tip doesn’t list don’t count: a tap isn’t a slow way to a key, nor the palette', () => {
    expect(after({ action: 'undo', route: 'touch' }, { action: 'undo', route: 'palette' }, { action: 'undo', route: 'gesture' })).toBe(none);
  });

  test('a shortcut used once silences every tip of its topic, including the variant without single keys', () => {
    expect(after({ action: 'rotateLeft', route: 'shortcut' }).known).toEqual(['rotateKey', 'singleKeysOff']);
  });

  test('a repetition sets its tip’s count to its length; it can go back down', () => {
    expect(after({ pattern: 'duplicateSame', n: 3 }).session).toEqual({ duplicateMany: 3 });
    expect(after({ pattern: 'duplicateSame', n: 3 }, { pattern: 'duplicateSame', n: 1 }).session).toEqual({ duplicateMany: 1 });
  });

  test('«the same action again and again» counts each action apart and takes the highest', () => {
    const menu = (action) => ({ action, route: 'menu', keyed: false });
    const counts = after(menu('moveToNewSheet'), menu('addSheet'), menu('moveToNewSheet'), menu('addSheet'), menu('moveToNewSheet'));
    expect(counts.session.palette).toBe(3);
    expect(counts.session['palette:addSheet']).toBe(2);
  });

  test('it skips actions shown with their shortcut and actions another tip counts', () => {
    expect(after(...times(4, { action: 'copy', route: 'menu', keyed: true })).session.palette).toBeUndefined();
    expect(after(...times(4, { action: 'rotateRight', route: 'menu', keyed: false })).session.palette).toBeUndefined();
  });

  test('nothing changed: the same counts come back (nothing to save)', () => {
    const counts = after({ action: 'undo', route: 'pointer' });
    expect(noteUse(TIPS, counts, { action: 'print', route: 'pointer' })).toBe(counts);
    const known = after({ action: 'undo', route: 'shortcut' });
    expect(noteUse(TIPS, known, { action: 'undo', route: 'shortcut' })).toBe(known);
  });

  test('once a tip shows, its counts start over; the others’ stay', () => {
    const counts = after(...times(3, { action: 'undo', route: 'pointer' }), ...times(2, { action: 'moveToNewSheet', route: 'menu', keyed: false }));
    const undo = forgetCounts(TIPS[0], counts);
    expect(undo.session).toEqual({ palette: 2, 'palette:moveToNewSheet': 2 });
    expect(undo.total).toEqual({});
    expect(forgetCounts(TIPS[5], counts).session).toEqual({ undoKey: 3 });
  });
});

describe('which tip is due', () => {
  test('a tip is due from its session threshold on, or from its total threshold on', () => {
    expect(due({ session: { undoKey: 2 } })).toBe(null);
    expect(due({ session: { undoKey: 3 } })).toBe('undoKey');
    expect(due({ session: { undoKey: 1 }, total: { undoKey: 7 } })).toBe(null);
    expect(due({ session: { undoKey: 1 }, total: { undoKey: 8 } })).toBe('undoKey');
    // Without a total threshold, the total never makes it due.
    expect(due({ total: { duplicateMany: 50 } })).toBe(null);
  });

  test('two due at once: the first in the table', () => {
    expect(due({ session: { duplicateMany: 3, undoKey: 3 } })).toBe('undoKey');
  });

  test('none within the cooldown after the last tip; one again once it has passed', () => {
    const counts = { session: { undoKey: 3 } };
    expect(due({ ...counts, lastShownAt: 1_000_000 - TIP_LIMITS.cooldown + 1 })).toBe(null);
    expect(due({ ...counts, lastShownAt: 1_000_000 - TIP_LIMITS.cooldown })).toBe('undoKey');
  });

  test('none once the session had its share, even with a long time since', () => {
    expect(due({ session: { undoKey: 3 }, shown: ['zoom', 'palette'], lastShownAt: 0 })).toBe(null);
    expect(decideTip(TIPS, state({ session: { undoKey: 3 }, shown: ['zoom', 'palette'] }), { cooldown: 0, perSession: 3 })?.id).toBe('undoKey');
  });

  test('a topic shown this session doesn’t show again in it', () => {
    expect(due({ session: { undoKey: 3 }, shown: ['undoKey'] })).toBe(null);
  });

  test('a dismissed topic never shows, whichever of its tips is due', () => {
    expect(due({ session: { undoKey: 30 }, total: { undoKey: 80 }, dismissed: ['undoKey'] })).toBe(null);
    expect(due({ session: { rotateKeysOff: 4 }, singleKeys: false, dismissed: ['singleKeysOff'] })).toBe(null);
  });

  test('a known topic never shows', () => {
    expect(due({ session: { undoKey: 3 }, known: ['undoKey'] })).toBe(null);
  });

  test('with tips off, none', () => {
    expect(due({ on: false, session: { undoKey: 3, duplicateMany: 3 } })).toBe(null);
  });

  test('on a touch-only device, no keyboard tip; the others still show', () => {
    expect(due({ session: { undoKey: 3 }, touchOnly: true })).toBe(null);
    expect(due({ session: { undoKey: 3, zoomPinch: 5 }, touchOnly: true })).toBe('zoomPinch');
  });

  test('a single-key shortcut is suggested only with those keys on; with them off, its variant suggests turning them on', () => {
    expect(due({ session: { rotateKey: 4, rotateKeysOff: 4 }, singleKeys: true })).toBe('rotateKey');
    expect(due({ session: { rotateKey: 4, rotateKeysOff: 4 }, singleKeys: false })).toBe('rotateKeysOff');
  });
});
