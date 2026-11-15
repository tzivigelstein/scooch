// A focus moved while a key is handled asks to be visible (src/hooks/keyboardFocus.ts).
import { expect, test, vi } from 'vitest';
import { showFocusMovedByKeys } from '../../src/hooks/keyboardFocus.ts';

test('while a key is handled focus() asks to be visible; after a click, or once the key is over, it is left as asked', async () => {
  const native = vi.spyOn(HTMLElement.prototype, 'focus');
  showFocusMovedByKeys();
  document.body.innerHTML = '<div id="piece" tabindex="0"></div><button id="tool"></button>';
  const piece = document.getElementById('piece')!;
  const tool = document.getElementById('tool')!;
  piece.addEventListener('keydown', (e) => {
    e.preventDefault();
    tool.focus({ preventScroll: true });
  });
  tool.addEventListener('click', () => piece.focus());

  piece.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect(native).toHaveBeenLastCalledWith({ preventScroll: true, focusVisible: true });

  await new Promise((resolve) => setTimeout(resolve));
  tool.click();
  expect(native).toHaveBeenLastCalledWith(undefined);
});
