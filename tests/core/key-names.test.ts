// How a key combination shows and is said: Ctrl, Alt and Shift joined with «+»
// on Windows, Linux or Android; Apple's symbols in Apple's order on a Mac, an
// iPhone or an iPad, with a name for screen readers.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { keyLabel, keyText } from '../../src/copy/index.ts';

afterEach(() => vi.unstubAllGlobals());

describe('on Windows, Linux or Android', () => {
  test.each([
    ['Mod+Shift+Z', 'Ctrl+Shift+Z'],
    ['Alt+Shift+ArrowLeft', 'Alt+Shift+←'],
    ['Control+Y', 'Ctrl+Y'],
    ['Shift+PageDown', 'Shift+Av Pág'],
    ['Delete', 'Supr'],
    ['Space+Drag', 'Espacio+arrastrar'],
    ['?', '?'],
  ])('%s shows and is said «%s»', (combo, text) => {
    vi.stubGlobal('navigator', { userAgentData: { platform: 'Windows' }, platform: 'Win32' });
    expect(keyText(combo)).toEqual({ shown: text, spoken: text });
    expect(keyLabel(combo)).toBe(text);
  });
});

describe('on Apple devices', () => {
  test.each([
    ['Mod+K', '⌘K', 'Comando+K'],
    ['Mod+Shift+Z', '⇧⌘Z', 'Shift+Comando+Z'],
    ['Shift+Mod+Z', '⇧⌘Z', 'Shift+Comando+Z'],
    ['Alt+Shift+ArrowLeft', '⌥⇧←', 'Opción+Shift+←'],
    ['Control+Y', '⌃Y', 'Control+Y'],
    ['Shift+1', '⇧1', 'Shift+1'],
    ['Delete', 'Supr', 'Supr'],
    ['Space+Drag', 'Espacio+arrastrar', 'Espacio+arrastrar'],
    ['Shift+PageDown', '⇧+Av Pág', 'Shift+Av Pág'],
    ['Mod+Click', '⌘+clic', 'Comando+clic'],
  ])('%s shows «%s» and is said «%s»', (combo, shown, spoken) => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(keyText(combo)).toEqual({ shown, spoken });
  });

  test('Chrome on a Mac, which says «macOS», gets the symbols too', () => {
    vi.stubGlobal('navigator', { userAgentData: { platform: 'macOS' }, platform: 'MacIntel' });
    expect(keyLabel('Mod+E')).toBe('⌘E');
  });

  test('an iPhone gets the symbols too', () => {
    vi.stubGlobal('navigator', { platform: 'iPhone' });
    expect(keyLabel('Mod+Shift+S')).toBe('⇧⌘S');
  });
});
