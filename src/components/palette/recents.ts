// The commands last run from the palette, kept in this browser (the shape is
// in core/storedprefs.js): the palette lists them first.

import { PALETTE_STORAGE } from '../../config.ts';
import { parseRecents, serializeRecents, withRecent } from '../../core/storedprefs.js';
import { storageJson, storageSet } from '../../services/storage/local.ts';

/** Ids of the commands last run, the newest first. */
export const recentCommands = () => parseRecents(storageJson(PALETTE_STORAGE)).ids;

export function rememberCommand(id: string) {
  storageSet(PALETTE_STORAGE, JSON.stringify(serializeRecents({ ids: withRecent(recentCommands(), id) })));
}
