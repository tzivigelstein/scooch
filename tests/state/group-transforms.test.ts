// @vitest-environment jsdom
// Two selected pieces as a group, on the real stores: arrows (and the jump over
// a neighbor), rotating, − , the group's X and width, the common scale,
// duplicating and removing, each in one undo step.
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { getDocument, setDocument, type Piece } from '../../src/state/document.ts';
import { historyDepth, undo } from '../../src/state/history.ts';
import { getView } from '../../src/state/view.ts';
import { dims } from '../../src/state/selectors.ts';
import { duplicate, lengthFieldValue, nudge, remove, rotate, scaleBy, setLengthField, setScaleField } from '../../src/state/actions/pieces.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

const W = (531 / 300) * 25.4; // 44.958 mm
const H = (591 / 300) * 25.4; // 50.038 mm

beforeAll(() => {
  URL.revokeObjectURL ??= () => {};
  document.body.innerHTML = '<div id="live-polite"></div><div id="live-assertive"></div>';
});

/** What the polite live region says after `ms` (the pending announcements went out). */
function heard(ms = 1000) {
  vi.advanceTimersByTime(ms);
  return (document.getElementById('live-polite')!.textContent ?? '').replace(/ /g, ' ').trim();
}

const item = (id: number) => getDocument().items.find((other) => other.id === id)!;
const width = (id: number) => dims(item(id))[0];
const center = (p: Piece) => {
  const [w, h] = dims(p);
  return { x: p.x + w / 2, y: p.y + h / 2 };
};

/** Pieces of the same sheet that overlap (more than touching). */
function overlapping(items: readonly Piece[], eps = 0.011) {
  const bad: [number, number][] = [];
  items.forEach((a, i) =>
    items.slice(i + 1).forEach((b) => {
      const [aw, ah] = dims(a);
      const [bw, bh] = dims(b);
      if (a.sheet === b.sheet && a.x < b.x + bw - eps && b.x < a.x + aw - eps && a.y < b.y + bh - eps && b.y < a.y + ah - eps) bad.push([a.id, b.id]);
    })
  );
  return bad;
}

/**
 * Pieces 1 and 2 side by side (20, 20) and (90, 20), selected; piece 3 below
 * the first at (20, 100) unless `third` says otherwise. The grid is on (1 mm),
 * overlaps are not allowed.
 */
function group(third: [number, number] = [20, 100]) {
  const key = fakeImage({ px: [531, 591] });
  resetState({ items: [piece(1, key, 20, 20), piece(2, key, 90, 20), piece(3, key, ...third)], selection: [1, 2] });
  return getDocument().items;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runAllTimers(); // nothing announced leaks into the next test
  vi.useRealTimers();
  for (const id of ['live-polite', 'live-assertive']) document.getElementById(id)!.textContent = '';
});

describe('group transforms', () => {
  test('→ moves the group 1 mm and leaves the others, in one undo step', () => {
    const before = group();
    nudge(1, 0);
    expect([item(1).x, item(2).x, item(3).x]).toEqual([21, 91, 20]);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(before);
  });

  test('↓ until the piece below: the group jumps past it without overlapping, and says so', () => {
    const before = group();
    const said: string[] = [];
    for (let i = 0; i < 31; i++) {
      document.getElementById('live-polite')!.textContent = '';
      nudge(0, 1);
      said.push(heard(100)); // before the delayed position announcement
    }
    expect(overlapping(getDocument().items)).toEqual([]);
    expect(item(1).y).toBeGreaterThanOrEqual(100 + H - 1e-3);
    // One arrow jumps (piece 1 would land on piece 3), and that one says so.
    expect(said.filter(Boolean)).toEqual(['Saltó sobre foto.png.']);
    // A burst of arrows is one undo step.
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(before);
  });

  test('rotating is refused while it would land on the piece below; «Permitir superposición» rotates it', () => {
    // The group's box (20..20 + 70 + W × 20..20 + H) turned around its center reaches y ≈ 102.5: on piece 3.
    const before = group();
    rotate(1);
    const flash = getView().flash;
    expect(flash).toMatchObject({ text: 'No se puede girar: las piezas se superpondrían', warn: true });
    expect(flash?.action?.label).toBe('Permitir superposición');
    expect(getDocument().items).toEqual(before);
    expect(historyDepth().undo).toBe(0);
    flash!.action!.run();
    expect(getDocument().allowOverlap).toBe(true);
    expect([item(1).r, item(2).r]).toEqual([90, 90]);
    expect(historyDepth().undo).toBe(1);
  });

  test('rotating a group with room turns each piece 90° around the box’s center, in one undo step', () => {
    const before = group([150, 200]);
    rotate(1);
    expect(getView().flash).toBeNull();
    expect([item(1).r, item(2).r]).toEqual([90, 90]);
    // The pieces' centers turn around the box's center (20 + (70 + W) / 2, 20 + H / 2).
    const cx = 20 + (70 + W) / 2;
    const cy = 20 + H / 2;
    expect(center(item(1)).x).toBeCloseTo(cx, 2);
    expect(center(item(1)).y).toBeCloseTo(cy - 35, 2);
    expect(center(item(2)).x).toBeCloseTo(cx, 2);
    expect(center(item(2)).y).toBeCloseTo(cy + 35, 2);
    expect(item(3)).toEqual(before[2]);
    expect(heard()).toBe('Se giraron 2 piezas 90° a la derecha.');
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(before);
  });

  test('− shrinks the group 1 % in proportion, in one undo step', () => {
    const before = group();
    scaleBy(-1);
    expect(item(1).scale).toBeCloseTo(99, 9);
    expect(item(2).scale).toBeCloseTo(99, 9);
    expect(width(1)).toBeCloseTo(W * 0.99, 6);
    expect(item(3)).toEqual(before[2]);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(before);
  });

  test('the measure fields show the group’s box: X 20, width 70 + one piece', () => {
    group();
    expect(lengthFieldValue('x')).toBe(20);
    expect(lengthFieldValue('y')).toBe(20);
    expect(lengthFieldValue('width')).toBeCloseTo(70 + W, 9);
    expect(lengthFieldValue('height')).toBeCloseTo(H, 9);
  });

  test('X of the group = 30 moves both, in one undo step', () => {
    const before = group();
    setLengthField('x', 30, { final: true });
    expect(item(1).x).toBeCloseTo(30, 6);
    expect(item(2).x).toBeCloseTo(100, 6);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(before);
  });

  test('width of the group = 60 scales it in proportion from its top left corner, in one undo step', () => {
    const before = group();
    const k = 60 / (70 + W);
    setLengthField('width', 60, { final: true });
    // Scales are kept to 4 decimals.
    expect(width(1)).toBeCloseTo(W * k, 4);
    expect(width(2)).toBeCloseTo(W * k, 4);
    expect(item(1).x).toBeCloseTo(20, 6);
    expect(item(2).x).toBeCloseTo(20 + 70 * k, 4);
    expect(lengthFieldValue('width')).toBeCloseTo(60, 3);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(before);
  });

  test('typing 80 in the scale field puts both at 80 %, each from its own center, in one undo step', () => {
    group();
    // Different scales to begin with (the field shows «Mixta»).
    setDocument({ items: getDocument().items.map((p) => (p.id === 1 ? { ...p, scale: 50 } : p)) });
    const before = getDocument().items;
    const centers = [center(item(1)), center(item(2))];
    setScaleField('scale', 80, { final: true });
    expect([item(1).scale, item(2).scale]).toEqual([80, 80]);
    expect(width(1)).toBeCloseTo(W * 0.8, 6);
    expect(width(2)).toBeCloseTo(W * 0.8, 6);
    expect(center(item(1)).x).toBeCloseTo(centers[0].x, 6);
    expect(center(item(2)).y).toBeCloseTo(centers[1].y, 6);
    expect(historyDepth().undo).toBe(1);
    undo();
    expect(getDocument().items).toEqual(before);
  });

  test('D with two selected: two copies, selected; Delete removes both; each undoes in one step', () => {
    const before = group();
    duplicate();
    const copies = getDocument().items.slice(3);
    expect(getDocument().items).toHaveLength(5);
    expect(getDocument().selection).toEqual(copies.map((copy) => copy.id));
    expect(overlapping(getDocument().items)).toEqual([]);
    const duplicated = getDocument().items;
    remove();
    expect(getDocument().items).toEqual(before);
    expect(heard()).toContain('Se quitaron 2 piezas');
    expect(historyDepth().undo).toBe(2);
    undo();
    expect(getDocument().items).toEqual(duplicated);
    undo();
    expect(getDocument().items).toEqual(before);
    expect(getDocument().selection).toEqual([1, 2]);
  });
});
