import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { pickSpot, clip } from '../../src/core/placement.js';

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
