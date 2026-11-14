// The sheets saved on this device (scooch:savings, see core/storedprefs.js): a
// running total for the summary after printing, each PDF counted once. Only
// in this browser: never sent anywhere.

import { SAVINGS_STORAGE } from '../config.ts';
import { countPdf, uncountPdf } from '../core/savings.js';
import { parseSavings, serializeSavings, type Savings } from '../core/storedprefs.js';
import { storageJson, storageSet } from '../services/storage/local.ts';

const read = () => parseSavings(storageJson(SAVINGS_STORAGE));
const write = (savings: Savings) => storageSet(SAVINGS_STORAGE, JSON.stringify(serializeSavings(savings)));

/**
 * Adds the `saved` sheets of the PDF `key` to the total (unless that PDF was
 * counted already) and takes the next equivalent's turn. Returns the totals
 * before and after, whose turn this one is and the sheets added now.
 */
export function recordSavings(saved: number, key: string) {
  const before = read();
  const { savings, added } = countPdf(before, key, saved);
  write(savings);
  return { before: before.sheets, after: savings.sheets, turn: before.turn, added };
}

/** Takes back the `added` sheets of the PDF `key` («No lo imprimí»): printing it later counts it again. */
export const unrecordSavings = (key: string, added: number) => write(uncountPdf(read(), key, added));
