// localStorage access that never throws: in private windows or with storage
// blocked, preferences last as long as the tab. The first access moves the
// keys saved under the app's former name (migrate.ts).

import { LEGACY_STORAGE_KEYS, MIGRATED_STORAGE } from '../../config.ts';
import { migrateKeys } from './migrate.ts';

let migrated = false;

function store(): Storage {
  const local = window.localStorage;
  if (!migrated) {
    migrated = true;
    try {
      migrateKeys(local, LEGACY_STORAGE_KEYS, MIGRATED_STORAGE);
    } catch {
      // Storage full or blocked: the old keys stay and the next start tries again.
    }
  }
  return local;
}

export function storageGet(key: string): string | null {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    store().setItem(key, value);
  } catch {
    // Storage blocked: the setting lasts as long as the tab.
  }
}

export function storageRemove(key: string) {
  try {
    store().removeItem(key);
  } catch {
    // Storage blocked: nothing to remove.
  }
}

/** The keys that start with `prefix`. */
export function storageKeys(prefix: string): string[] {
  try {
    const local = store();
    return Array.from({ length: local.length }, (_, i) => local.key(i)).filter((key): key is string => !!key?.startsWith(prefix));
  } catch {
    return [];
  }
}

/** A JSON value from storage, or null when missing or unreadable. */
export function storageJson(key: string): unknown {
  try {
    return JSON.parse(storageGet(key) ?? 'null');
  } catch {
    return null;
  }
}
