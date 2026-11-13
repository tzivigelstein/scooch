// localStorage access that never throws: in private windows or with storage
// blocked, preferences last as long as the tab.

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting lasts as long as the tab.
  }
}

export function storageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing to remove.
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
