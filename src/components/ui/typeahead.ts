// Typing the first letters of an item to go to it, in a menu or a list: a key
// typed soon after the last one adds to the search, otherwise it starts a new
// one; one letter goes to the next item that starts with it (pressing it again
// cycles), several refine the search from the current item. Accents and case
// don't count.

/** A key this long after the last one starts a new search (ms). */
const PAUSE = 600;

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function typeahead() {
  let text = '';
  let at = -Infinity;
  return {
    /** Whether letters typed just now are still being matched (a space then belongs to the search). */
    typing: () => text !== '' && performance.now() - at <= PAUSE,
    /** The index of the label that what was typed with `key` reaches from `current` (-1: none yet), or -1. */
    find(key: string, labels: readonly string[], current: number) {
      const now = performance.now();
      text = now - at > PAUSE ? key : text + key;
      at = now;
      const query = fold(text);
      const start = text.length > 1 ? Math.max(current, 0) : current + 1;
      for (let i = 0; i < labels.length; i++) {
        const index = (start + i) % labels.length;
        if (fold(labels[index]).startsWith(query)) return index;
      }
      return -1;
    },
  };
}
