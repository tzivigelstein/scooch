// The sheets saved on this device (scooch:savings, see core/storedprefs.js): a
// running total for the summary after printing, each PDF counted once, a
// print only once it settles (core/savings.js). Only in this browser: never
// sent anywhere.

import { SAVINGS_STORAGE } from '../config.ts';
import { countPdf, settlePending } from '../core/savings.js';
import { parseSavings, serializeSavings, type Savings } from '../core/storedprefs.js';
import { storageJson, storageSet } from '../services/storage/local.ts';

const read = () => parseSavings(storageJson(SAVINGS_STORAGE));
const write = (savings: Savings) => storageSet(SAVINGS_STORAGE, JSON.stringify(serializeSavings(savings)));

/**
 * Counts the `saved` sheets of the PDF `key`, printed or downloaded (`how`,
 * see core/savings.js countPdf), and takes the next equivalent's turn.
 * Returns the total now, whose turn this one is, the sheets this PDF added
 * and the milestone for its summary.
 */
export function recordSavings(saved: number, key: string, how: 'print' | 'download') {
  const before = read();
  const { savings, added, milestone } = countPdf(before, key, saved, how);
  write(savings);
  return { total: savings.sheets, turn: before.turn, added, milestone };
}

/** At page load: the print left pending joins the total (a milestone it reaches waits for the next summary). */
export function settleSavings() {
  const savings = read();
  if (savings.pending) write(settlePending(savings));
}
