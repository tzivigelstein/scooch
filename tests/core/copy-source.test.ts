// The Spanish texts the other languages were translated from
// (tests/core/__snapshots__/copy-source.json). A Spanish text that changes
// fails here, its old and new text side by side, until en, zh-Hans, hi and fr
// say the new thing too; then `node_modules/.bin/vitest run
// tests/core/copy-source.test.ts --update` records it. (A key that is missing or extra
// in a language fails in copy-catalogues.test.ts.)
import { expect, test } from 'vitest';
import es from '../../src/copy/es.ts';

type Tree = { [key: string]: string | Tree };

/** Every Spanish text by its key, one per line; a plural's forms each on its own. */
const flat = (tree: Tree, prefix = ''): [string, string][] =>
  Object.entries(tree).flatMap(([key, value]) => (typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : flat(value, `${prefix}${key}.`)));

test('every Spanish text is the one the other languages were translated from', async () => {
  await expect(`${JSON.stringify(Object.fromEntries(flat(es as unknown as Tree)), null, 2)}\n`).toMatchFileSnapshot(
    '__snapshots__/copy-source.json',
    'a Spanish text changed: translate the change in src/copy/en.ts, zh-Hans.ts, hi.ts and fr.ts, then record it with --update'
  );
});
