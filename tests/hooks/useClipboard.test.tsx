// @vitest-environment jsdom
// Copy, cut and paste on the page: files on the system clipboard are loaded
// (newer than pieces copied before), pieces copied in this tab are pasted, and
// inside a text field the browser keeps its own copy and paste.
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CLIP_TYPE, copySelection } from '../../src/state/actions/clipboard.ts';
import { loadFiles } from '../../src/state/actions/files.ts';
import { getDocument } from '../../src/state/document.ts';
import { useClipboard } from '../../src/hooks/useClipboard.ts';
import { fakeImage, piece, resetState } from '../support/state.ts';

vi.mock('../../src/state/actions/files.ts', async (original) => ({ ...(await original<typeof import('../../src/state/actions/files.ts')>()), loadFiles: vi.fn() }));

function Page() {
  useClipboard();
  return <input id="name" />;
}

/** A clipboard event as the browser fires it, with what the clipboard holds. */
function fire(type: 'copy' | 'cut' | 'paste', files: File[] = []) {
  const setData = vi.fn();
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { files, setData } });
  (document.activeElement ?? document.body).dispatchEvent(e);
  return { prevented: e.defaultPrevented, setData };
}

const image = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'image.png', { type: 'image/png' });

beforeEach(() => {
  URL.createObjectURL ??= () => 'blob:pasted';
  resetState({ items: [piece(1, fakeImage(), 20, 20)], selection: [1] });
  vi.mocked(loadFiles).mockClear();
  render(
    <>
      <Page />
      <div id="live-polite" />
      <div id="live-assertive" />
    </>
  );
});
afterEach(cleanup);

describe('the clipboard on the page', () => {
  test('files on the system clipboard are loaded, even with pieces copied before', () => {
    copySelection({ quiet: true });
    const file = image();
    expect(fire('paste', [file]).prevented).toBe(true);
    expect(loadFiles).toHaveBeenCalledWith([file]);
    expect(getDocument().items).toHaveLength(1);
  });

  test('without files, the pieces copied in this tab are pasted', () => {
    const { prevented, setData } = fire('copy');
    expect(prevented).toBe(true);
    expect(setData).toHaveBeenCalledWith(CLIP_TYPE, expect.any(String));
    expect(setData).toHaveBeenCalledWith('text/plain', '1 pieza de Scooch');
    expect(fire('paste').prevented).toBe(true);
    expect(getDocument().items).toHaveLength(2);
    expect(loadFiles).not.toHaveBeenCalled();
  });

  test('inside a text field the browser keeps its own copy and paste', () => {
    document.getElementById('name')!.focus();
    expect(fire('copy').prevented).toBe(false);
    expect(fire('paste', [image()]).prevented).toBe(false);
    expect(loadFiles).not.toHaveBeenCalled();
    expect(getDocument().items).toHaveLength(1);
  });
});
