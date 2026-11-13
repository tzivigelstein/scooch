// Runs before every test file of the state and ui projects (vite.config.ts).
import { createRequire } from 'node:module';
import { afterEach } from 'vitest';
import { clearAnnouncements } from '../../src/components/feedback/announcer.ts';

// An announcement waits on a timer: dropped after each test, it can't go out
// in the next test, or after the file's DOM is torn down.
afterEach(() => clearAnnouncements());

// jsdom's Blob can't be read back with arrayBuffer() (browsers' and Node's
// can), and its FileReader waits on setImmediate, which fake timers stop:
// saving and opening projects read binaries this way. Its bytes are read
// directly (jsdom keeps them in the Blob's implementation).
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  const { implForWrapper } = createRequire(import.meta.url)('jsdom/lib/jsdom/living/generated/utils.js') as { implForWrapper: (blob: Blob) => { _bytes: Uint8Array } };
  Blob.prototype.arrayBuffer = function (this: Blob) {
    const bytes = implForWrapper(this)._bytes;
    return Promise.resolve(bytes.slice().buffer);
  };
}
