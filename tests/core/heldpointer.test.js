import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { heldPointer, letGo } from '../../src/core/heldpointer.js';

const mouse = heldPointer({ pointerId: 1, pointerType: 'mouse', button: 0 });
const middle = heldPointer({ pointerId: 1, pointerType: 'mouse', button: 1 });
const finger = heldPointer({ pointerId: 7, pointerType: 'touch', button: 0 });
const event = (type, fields = {}) => ({ type, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0, ...fields });

describe('heldPointer', () => {
  test('keeps the pointer and the bit of the button that pressed', () => {
    assert.deepEqual(mouse, { pointerId: 1, pointerType: 'mouse', bit: 1 });
    assert.equal(middle.bit, 4);
    assert.equal(heldPointer({ pointerId: 1, pointerType: 'mouse', button: 2 }).bit, 2);
    assert.equal(finger.bit, 1);
  });
});

describe('letGo', () => {
  test('a move with its button still pressed (alone or with others): still held', () => {
    assert.equal(letGo(mouse, event('pointermove', { buttons: 1 })), false);
    assert.equal(letGo(mouse, event('pointermove', { buttons: 1 | 2 })), false);
    assert.equal(letGo(middle, event('pointermove', { buttons: 4 })), false);
  });

  test('a move of it without its button: let go unseen', () => {
    assert.equal(letGo(mouse, event('pointermove', { buttons: 0 })), true);
    assert.equal(letGo(mouse, event('pointermove', { buttons: 2 })), true, 'only another button pressed');
    assert.equal(letGo(middle, event('pointermove', { buttons: 1 })), true);
  });

  test('boundary events say nothing (a capture taken at the press is moved with the release’s buttons)', () => {
    for (const type of ['pointerover', 'pointerenter', 'pointerout', 'gotpointercapture']) assert.equal(letGo(mouse, event(type, { buttons: 0 })), false);
  });

  test('another pointer moving says nothing about it', () => {
    assert.equal(letGo(mouse, event('pointermove', { pointerId: 2, pointerType: 'pen' })), false);
    assert.equal(letGo(finger, event('pointermove', { pointerId: 8, pointerType: 'touch', isPrimary: false })), false);
  });

  test('a new press of it, or a new first finger: the old one is gone; a second finger is not', () => {
    assert.equal(letGo(mouse, event('pointerdown', { buttons: 1 })), true);
    assert.equal(letGo(finger, event('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, buttons: 1 })), true);
    assert.equal(letGo(finger, event('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: false, buttons: 1 })), false);
    assert.equal(letGo(mouse, event('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, buttons: 1 })), false, 'a finger while the mouse is held');
  });
});
