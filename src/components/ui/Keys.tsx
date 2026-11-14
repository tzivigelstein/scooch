import { keyText } from '../../copy/index.ts';

/**
 * A key combination in a <kbd>, as this device names it; on Apple devices its
 * symbols («⇧⌘Z») come with their names for screen readers.
 */
export function Keys({ combo }: { combo: string }) {
  const { shown, spoken } = keyText(combo);
  if (shown === spoken) return <kbd>{shown}</kbd>;
  return (
    <kbd>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{spoken}</span>
    </kbd>
  );
}
