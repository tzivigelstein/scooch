// One-time move of what the app saved under its former name («pliego»): the
// localStorage keys without a prefix and the projects' database. The new
// copy is written first and the old one removed after, so a failure halfway
// loses nothing: the next start picks up from where it stopped.

import { LEGACY_PROJECTS_DB } from '../../config.ts';
import type { ProjectStorage } from '../../core/types.ts';
import { deleteIdb, openExistingIdbStorage } from './idb.ts';

/** The part of the Storage interface the move uses. */
export type KeyStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Moves each `legacy → current` key of `mapping`. It runs on every start: a
 * tab still running the app from before the rename can write an old key after
 * the first move, and that one is moved too (or dropped, when the current key
 * already has a value: a current key keeps it). `done` records that the first
 * move finished. Returns the legacy keys whose value was copied. If writing
 * fails (storage full), the keys not moved yet stay where they were.
 */
export function migrateKeys(store: KeyStore, mapping: Readonly<Record<string, string>>, done: string): string[] {
  const copied: string[] = [];
  for (const [legacy, current] of Object.entries(mapping)) {
    const value = store.getItem(legacy);
    if (value === null) continue;
    if (store.getItem(current) === null) {
      store.setItem(current, value);
      copied.push(legacy);
    }
    store.removeItem(legacy);
  }
  if (store.getItem(done) === null) store.setItem(done, '1');
  return copied;
}

/**
 * Copies every project (record and binaries) from `from` to `to` and only
 * then removes them from `from`. A project `to` already has is left as it is
 * there (copied by an earlier, interrupted move and maybe edited since).
 * Returns how many were copied.
 */
export async function migrateProjects(from: ProjectStorage, to: ProjectStorage): Promise<number> {
  const records = await from.list();
  let copied = 0;
  for (const record of records) {
    if (await to.get(record.id)) continue;
    await to.write(record, { put: await from.files(record.id) });
    copied++;
  }
  for (const record of records) await from.remove(record.id);
  return copied;
}

/**
 * Moves the projects of the legacy database (if there is one) into `to`
 * and, once it's empty, deletes it. Returns how many were copied.
 */
export async function migrateLegacyProjects(to: ProjectStorage): Promise<number> {
  const legacy = await openExistingIdbStorage(LEGACY_PROJECTS_DB);
  if (!legacy) return 0;
  let copied: number;
  try {
    copied = await migrateProjects(legacy, to);
  } finally {
    legacy.close();
  }
  // Only reached when everything moved: a failure keeps the old database.
  await deleteIdb(LEGACY_PROJECTS_DB);
  return copied;
}
