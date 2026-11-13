// Screen reader announcements through two live regions that exist from the
// first render (#live-polite and #live-assertive).

import { asSentence } from '../../copy/index.ts';

type Channel = 'polite' | 'assertive';

const REGION_IDS: Record<Channel, string> = { polite: 'live-polite', assertive: 'live-assertive' };
const pending: Record<Channel, string[]> = { polite: [], assertive: [] };
const keyed = new Map<string, ReturnType<typeof setTimeout>>(); // key → timer of delayed announcements (they replace each other)
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let toggle = false;

export interface AnnounceOptions {
  assertive?: boolean;
  key?: string | null;
  delay?: number;
}

/**
 * Announces `text`. With `key` + `delay`, only the last one of a burst gets
 * out (e.g. the final position after several arrow presses).
 */
export function announce(text: string, { assertive = false, key = null, delay = 0 }: AnnounceOptions = {}) {
  if (!text) return;
  const channel: Channel = assertive ? 'assertive' : 'polite';
  if (key) {
    clearTimeout(keyed.get(key));
    keyed.delete(key);
    if (delay > 0) {
      keyed.set(
        key,
        setTimeout(() => {
          keyed.delete(key);
          queue(channel, text);
        }, delay)
      );
      return;
    }
  }
  queue(channel, text);
}

/** Drops a delayed announcement that hasn't gone out yet (e.g. a problem already solved). */
export function cancelAnnounce(key: string) {
  clearTimeout(keyed.get(key));
  keyed.delete(key);
}

/**
 * Drops every announcement that hasn't gone out yet. For tests: nothing a test
 * announced outlives it (its timers would fire in the next test, or after the
 * test's DOM is gone).
 */
export function clearAnnouncements() {
  for (const timer of keyed.values()) clearTimeout(timer);
  keyed.clear();
  clearTimeout(flushTimer);
  pending.polite = [];
  pending.assertive = [];
}

function queue(channel: Channel, text: string) {
  if (!pending[channel].includes(text)) pending[channel].push(text);
  clearTimeout(flushTimer);
  // What is announced at the same moment goes out as one message.
  flushTimer = setTimeout(flush, 60);
}

function flush() {
  for (const channel of ['assertive', 'polite'] as const) {
    const region = document.getElementById(REGION_IDS[channel]);
    if (!region || !pending[channel].length) continue;
    // An alternating no-break space forces a change even when the text repeats.
    toggle = !toggle;
    // Messages come without a final period (docs/copy.md): it is added when joining them.
    region.textContent = pending[channel].map(asSentence).join(' ') + (toggle ? ' ' : '');
    pending[channel] = [];
  }
}
