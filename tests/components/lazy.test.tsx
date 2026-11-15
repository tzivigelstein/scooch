// Parts of the interface that load on first use or ahead of it (src/components/lazy.ts).
import { afterEach, expect, test, vi } from 'vitest';
import { lazyContent, prefetch, whenLoaded } from '../../src/components/lazy.ts';

const Part = () => null;

afterEach(() => vi.restoreAllMocks());

test('a prefetch that fails (offline, or WebKit leaving the page) leaves no unhandled rejection, and the first use loads it again', async () => {
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  const load = vi.fn().mockRejectedValueOnce(new TypeError('Importing a module script failed.')).mockResolvedValue({ default: Part });
  const content = lazyContent(load);
  prefetch(content);
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(content.loaded()).toBe(false);

  const show = vi.fn();
  whenLoaded(content, show);
  await vi.waitFor(() => expect(show).toHaveBeenCalledTimes(1));
  expect(load).toHaveBeenCalledTimes(2);
  expect(content.loaded()).toBe(true);
  process.off('unhandledRejection', unhandled);
  expect(unhandled).not.toHaveBeenCalled();
});
