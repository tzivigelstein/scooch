// @vitest-environment jsdom
// A project's thumbnail (src/services/thumbnail.ts) comes with its bytes
// known, so storing it never reads a Blob (WebKit fails that read while the
// page is going away).
import { afterEach, expect, test, vi } from 'vitest';
import { knownBytes } from '../../src/services/storage/hash.ts';
import { drawThumbnail } from '../../src/services/thumbnail.ts';

const context = new Proxy({}, { get: () => () => {} }) as unknown as CanvasRenderingContext2D;

function canvasGives(dataUrl: string) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(dataUrl);
}

afterEach(() => vi.restoreAllMocks());

test('the thumbnail is a WebP Blob whose bytes the app holds: storing it reads nothing', async () => {
  const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 250]);
  canvasGives(`data:image/webp;base64,${Buffer.from(bytes).toString('base64')}`);
  const read = vi.spyOn(Blob.prototype, 'arrayBuffer');
  const thumb = (await drawThumbnail(210, 297, [], () => undefined, () => null))!;
  expect(thumb.type).toBe('image/webp');
  expect(knownBytes(thumb)).toEqual(bytes);
  expect(read).not.toHaveBeenCalled();
});

test('where the browser can’t encode WebP (Safari), a PNG, said as such; an empty canvas gives none', async () => {
  canvasGives(`data:image/png;base64,${Buffer.from([137, 80, 78, 71]).toString('base64')}`);
  const png = (await drawThumbnail(210, 297, [], () => undefined, () => null))!;
  expect(png.type).toBe('image/png');
  expect(knownBytes(png)).toEqual(new Uint8Array([137, 80, 78, 71]));
  vi.restoreAllMocks();
  canvasGives('data:,');
  expect(await drawThumbnail(210, 297, [], () => undefined, () => null)).toBeNull();
});
