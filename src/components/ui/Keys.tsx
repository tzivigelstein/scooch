import { keyText } from '../../copy/index.ts';

/**
 * A key combination in a <kbd>, as this device names it; on Apple devices its
 * symbols («⇧⌘Z») come with their names for screen readers. A page the
 * browser translates leaves it as the keyboard has it (a letter such as «O»
 * isn't a word).
 */
export function Keys({ combo }: { combo: string }) {
  const { shown, spoken } = keyText(combo);
  if (shown === spoken) return <kbd translate="no">{shown}</kbd>;
  return (
    <kbd translate="no">
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{spoken}</span>
    </kbd>
  );
}
