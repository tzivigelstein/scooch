import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pickSpot, clip, liftOff } from '../../src/core/placement.js';

const r = (x, y, w, h, side) => ({ x, y, w, h, side });
const bounds = r(0, 0, 1000, 800);

describe('clip', () => {
  test('intersección', () => {
    assert.deepEqual(clip(r(0, 0, 10, 10), r(5, 5, 10, 10)), { x: 5, y: 5, w: 5, h: 5 });
  });
  test('tocarse no es intersecarse', () => {
    assert.equal(clip(r(0, 0, 10, 10), r(10, 0, 10, 10)), null);
  });
});

describe('pickSpot', () => {
  const above = r(100, 100, 200, 40, 'above');
  const below = r(100, 400, 200, 40, 'below');
  const left = r(0, 200, 80, 40, 'left');

  test('sin nada que tapar, el primero (arriba)', () => {
    assert.equal(pickSpot([above, below, left], { bounds }).side, 'above');
  });

  test('el que tapa menos piezas', () => {
    const covers = [r(150, 90, 50, 50), r(250, 110, 20, 20)]; // dos piezas bajo «arriba»
    assert.equal(pickSpot([above, below, left], { bounds, covers }).side, 'below');
  });

  test('a igualdad de piezas tapadas, el de más prioridad', () => {
    const covers = [r(150, 90, 50, 50), r(150, 390, 50, 50)]; // una arriba y una abajo
    assert.equal(pickSpot([above, below], { bounds, covers }).side, 'above');
  });

  test('mejor tapar una que dos, aunque sea más abajo en la lista', () => {
    const covers = [r(100, 100, 10, 10), r(200, 100, 10, 10), r(100, 400, 10, 10)];
    assert.equal(pickSpot([above, below], { bounds, covers }).side, 'below');
  });

  test('descarta lo que se sale del área', () => {
    const outside = r(-20, 100, 200, 40, 'above');
    assert.equal(pickSpot([outside, below], { bounds }).side, 'below');
  });

  test('descarta lo que pisa un panel abierto', () => {
    assert.equal(pickSpot([above, below], { bounds, blocked: [r(0, 0, 400, 300)] }).side, 'below');
  });

  test('null si no queda ninguno', () => {
    assert.equal(pickSpot([r(-5, 0, 10, 10)], { bounds }), null);
  });
});

describe('liftOff', () => {
  const over = r(300, 700, 200, 40, 'over');
  const notice = r(250, 720, 400, 44);
  const zoom = r(560, 690, 130, 40);

  test('a spot off everything stays where it is', () => {
    assert.deepEqual(liftOff(over, { bounds, blocked: [zoom], gap: 12 }), over);
  });

  test('on the notice, it goes the gap above it', () => {
    assert.deepEqual(liftOff(over, { bounds, blocked: [notice], gap: 12 }), r(300, 720 - 40 - 12, 200, 40, 'over'));
  });

  test('on two things, above the higher one', () => {
    const wide = r(300, 700, 300, 40, 'over');
    assert.deepEqual(liftOff(wide, { bounds, blocked: [notice, zoom], gap: 12 }), r(300, 690 - 40 - 12, 300, 40, 'over'));
  });

  test('lifted onto something above, it goes above that one too', () => {
    const above = r(320, 640, 100, 30);
    assert.deepEqual(liftOff(over, { bounds, blocked: [notice, above], gap: 12 }), r(300, 640 - 40 - 12, 200, 40, 'over'));
  });

  test('null when lifting it leaves the area', () => {
    assert.equal(liftOff(r(300, 20, 200, 40), { bounds, blocked: [r(0, 30, 1000, 40)], gap: 12 }), null);
  });

  test('null when it is outside the area to begin with', () => {
    assert.equal(liftOff(r(900, 100, 200, 40), { bounds }), null);
  });
});
