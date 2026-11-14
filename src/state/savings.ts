// The sheets saved on this device (scooch:savings, see core/savings.js): a
// running total for the summary after printing. Only in this browser: never
// sent anywhere.

import { SAVINGS_STORAGE } from '../config.ts';
import { parseSavings, serializeSavings } from '../core/savings.js';
import { storageJson, storageSet } from '../services/storage/local.ts';

/**
 * Adds `saved` sheets to the total and takes the next equivalent's turn.
 * Returns the totals before and after, and whose turn this one is.
 */
export function recordSavings(saved: number) {
  const { sheets, turn } = parseSavings(storageJson(SAVINGS_STORAGE));
  const after = sheets + Math.max(0, saved);
  storageSet(SAVINGS_STORAGE, JSON.stringify(serializeSavings({ sheets: after, turn: turn + 1 })));
  return { before: sheets, after, turn };
}
