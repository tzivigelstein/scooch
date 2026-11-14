// @vitest-environment jsdom
// Usage tips on the real stores (src/state/tips.ts): what each report counts
// toward, by route; the repetitions watched (copies of one piece, pieces
// dragged one by one, the same position typed, a file added again); the
// session's limits with a fake clock; and what this browser keeps.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { TIPS_STORAGE } from '../../src/config.ts';
import { TIP_LIMITS } from '../../src/core/tips.js';
import { usePrefs } from '../../src/state/prefs.ts';
import { addedAgain, closeTip, control, draggedPiece, neverShow, resetTips, restoreTips, setTipsOn, tipShown, typedPosition, used, useTips } from '../../src/state/tips.ts';
import { duplicate } from '../../src/state/actions/pieces.ts';
import { select } from '../../src/state/actions/selection.ts';
import { fakeImageMm, piece, resetState } from '../support/state.ts';

const due = () => useTips.getState().tip;
const plain = (text = '') => text.replace(/[  ]/g, ' ');
const stored = () => JSON.parse(localStorage.getItem(TIPS_STORAGE) ?? 'null');
const times = (n: number, run: () => void) => {
  for (let i = 0; i < n; i++) run();
};
/** Shows the tip that is due and closes it, as the notice area would. */
const seen = () => {
  tipShown();
  closeTip();
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-14T12:00:00Z'));
  localStorage.clear();
  document.body.innerHTML = '';
  resetState();
  resetTips();
});
afterEach(() => vi.useRealTimers());

describe('reports by route', () => {
  test('the undo button three times offers its shortcut, with the keys this device shows', () => {
    times(2, () => used('undo', 'pointer'));
    expect(due()).toBe(null);
    used('undo', 'pointer');
    expect(due()).toMatchObject({ id: 'undoKey', shown: false, action: null });
    expect(plain(due()!.text)).toBe('También puedes deshacer con Ctrl+Z');
  });

  test('undoing with the shortcut doesn’t count, and the shortcut tip never comes after it', () => {
    times(3, () => used('undo', 'shortcut'));
    expect(due()).toBe(null);
    times(6, () => used('undo', 'pointer'));
    expect(due()).toBe(null);
  });

  test('a control activated with the keyboard counts; a tap doesn’t (no keyboard at hand)', () => {
    const undo = vi.fn();
    const onClick = control('undo', undo);
    const tap = new PointerEvent('pointerdown', { pointerType: 'touch' } as PointerEventInit);
    times(3, () => {
      document.dispatchEvent(tap);
      onClick({ detail: 1 });
    });
    expect(undo).toHaveBeenCalledTimes(3);
    expect(due()).toBe(null);
    times(3, () => onClick({ detail: 0 }));
    expect(due()?.id).toBe('undoKey');
  });

  test('zoom buttons: clicked, the wheel; tapped, two fingers; once the wheel was used, neither', () => {
    times(5, () => used('zoomIn', 'pointer'));
    expect(plain(due()?.text)).toBe('También puedes acercar o alejar la vista con Ctrl+rueda o pellizcando el trackpad');
    resetTips();
    times(5, () => used('zoomOut', 'touch'));
    expect(due()?.text).toBe('También puedes acercar o alejar la vista pellizcando con dos dedos');
    localStorage.clear();
    resetTips();
    used('zoomGesture', 'gesture');
    times(10, () => used('zoomIn', 'pointer'));
    expect(due()).toBe(null);
  });

  test('a single-key shortcut with those keys off: the tip says where to turn them on and opens Preferencias', () => {
    usePrefs.setState({ singleKeys: false });
    times(4, () => used('rotateRight', 'pointer'));
    expect(due()).toMatchObject({ id: 'rotateKeysOff', topic: 'singleKeysOff', action: { label: 'Abrir Preferencias' } });
    expect(due()!.text).toBe('Si activas los atajos de 1 tecla en Preferencias, puedes rotar con R y Shift+R');
  });

  test('the same action in the context menu, with no shortcut shown for it, offers the palette', () => {
    times(2, () => used('moveToNewSheet', 'menu'));
    used('addSheet', 'menu');
    expect(due()).toBe(null);
    used('moveToNewSheet', 'menu');
    expect(due()).toMatchObject({ id: 'palette', text: 'Busca cualquier acción con Ctrl+K', action: { label: 'Buscar acciones' } });
  });

  test('with tips off, nothing counts', () => {
    setTipsOn(false);
    times(5, () => used('undo', 'pointer'));
    setTipsOn(true);
    expect(due()).toBe(null);
    used('undo', 'pointer');
    expect(due()).toBe(null);
  });
});

describe('repetitions', () => {
  test('one copy at a time of the same piece, three times, offers «Duplicar ×N»; of different pieces, no', () => {
    const a = fakeImageMm(20, 20);
    const b = fakeImageMm(20, 20, { src: 2 });
    resetState({ items: [piece(1, a, 10, 10), piece(2, b, 100, 10)], selection: [1] });
    const copy = () => {
      duplicate(1);
      used('duplicate', 'pointer');
    };
    copy();
    select(2);
    copy();
    select(1);
    copy();
    expect(due()).toBe(null);
    copy();
    copy();
    expect(due()).toMatchObject({ id: 'duplicateMany', action: { label: 'Ir a Duplicar' } });
  });

  test('five pieces of one sheet dragged one by one offer «Acomodar»; a pause of over a minute starts over', () => {
    times(4, () => draggedPiece(1, 1));
    draggedPiece(2, 1);
    draggedPiece(3, 1);
    draggedPiece(4, 1);
    vi.advanceTimersByTime(61_000);
    draggedPiece(5, 1);
    expect(due()).toBe(null);
    for (const id of [6, 7, 8, 9]) draggedPiece(id, 1);
    expect(due()?.text).toBe('Acomodar ubica todas las piezas de una vez, sin superponerlas');
  });

  test('pieces dragged on different sheets aren’t one tidying, and someone who arranged never gets it', () => {
    for (const id of [1, 2, 3, 4, 5]) draggedPiece(id, id);
    expect(due()).toBe(null);
    used('arrange', 'pointer');
    for (const id of [1, 2, 3, 4, 5]) draggedPiece(id, 1);
    expect(due()).toBe(null);
  });

  test('the same X typed for three pieces offers the align buttons; a different value starts over', () => {
    typedPosition('x', 20, 1);
    typedPosition('x', 20, 1);
    typedPosition('x', 20, 2);
    typedPosition('y', 20, 3);
    expect(due()).toBe(null);
    typedPosition('y', 20.02, 4);
    typedPosition('y', 20, 5);
    expect(due()?.id).toBe('alignButtons');
  });

  test('files already in the project, added again twice, offer «Duplicar» and «Rellenar con copias»', () => {
    addedAgain(1);
    expect(due()).toBe(null);
    addedAgain(1);
    expect(due()).toMatchObject({ id: 'sameFile', action: { label: 'Ir a Duplicar' } });
  });
});

describe('limits', () => {
  test('one tip at a time: while one waits or shows, another due one doesn’t replace it', () => {
    times(3, () => used('undo', 'pointer'));
    times(3, () => used('redo', 'pointer'));
    expect(due()?.id).toBe('undoKey');
    tipShown();
    times(3, () => used('redo', 'pointer'));
    expect(due()?.id).toBe('undoKey');
  });

  test('after a tip shows, the next waits out the cooldown', () => {
    times(3, () => used('undo', 'pointer'));
    seen();
    times(3, () => used('redo', 'pointer'));
    expect(due()).toBe(null);
    vi.advanceTimersByTime(TIP_LIMITS.cooldown);
    used('redo', 'pointer');
    expect(due()?.id).toBe('redoKey');
  });

  test('two tips a session at most', () => {
    for (const id of ['undo', 'redo'] as const) {
      times(3, () => used(id, 'pointer'));
      seen();
      vi.advanceTimersByTime(TIP_LIMITS.cooldown);
    }
    times(3, () => used('remove', 'pointer'));
    expect(due()).toBe(null);
  });

  test('a tip that can’t show within 20 s is dropped', () => {
    times(3, () => used('undo', 'pointer'));
    vi.advanceTimersByTime(20_000);
    expect(due()).toBe(null);
  });

  test('a tip shown once doesn’t come back in the same session, even if due again', () => {
    times(3, () => used('undo', 'pointer'));
    seen();
    vi.advanceTimersByTime(TIP_LIMITS.cooldown);
    times(3, () => used('undo', 'pointer'));
    expect(due()).toBe(null);
  });
});

describe('what this browser keeps', () => {
  test('counts with a total add up across page loads: the undo button twice a session, the 8th time over 4 sessions', () => {
    for (let load = 0; load < 3; load++) {
      resetTips();
      times(2, () => used('undo', 'pointer'));
      expect(due()).toBe(null);
    }
    expect(stored().counts).toEqual({ undoKey: 6 });
    resetTips();
    used('undo', 'pointer');
    expect(due()).toBe(null);
    used('undo', 'pointer');
    expect(due()?.id).toBe('undoKey');
    expect(stored().counts).toEqual({});
  });

  test('«No volver a mostrar» lasts after reloading; «Volver a mostrar los consejos» brings it back', () => {
    times(3, () => used('undo', 'pointer'));
    tipShown();
    neverShow('undoKey');
    expect(due()).toBe(null);
    expect(stored()).toMatchObject({ v: 1, on: true, dismissed: ['undoKey'] });
    resetTips();
    times(3, () => used('undo', 'pointer'));
    expect(due()).toBe(null);
    restoreTips();
    expect(useTips.getState().dismissed).toEqual([]);
    resetTips();
    times(3, () => used('undo', 'pointer'));
    expect(due()?.id).toBe('undoKey');
  });

  test('a shortcut used is remembered: its tip doesn’t come in the next session either', () => {
    used('undo', 'shortcut');
    expect(stored().known).toEqual(['undoKey']);
    resetTips();
    times(9, () => used('undo', 'pointer'));
    expect(due()).toBe(null);
  });

  test('the switch off is kept, and closes a tip that was waiting', () => {
    times(3, () => used('undo', 'pointer'));
    setTipsOn(false);
    expect(due()).toBe(null);
    resetTips();
    expect(useTips.getState().on).toBe(false);
  });
});
