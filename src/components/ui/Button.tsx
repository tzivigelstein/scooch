import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { useShortcut, type ShortcutName } from '../../hooks/shortcuts.ts';
import { Icon } from './Icon.tsx';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Tooltip text (data-tip) and its note (data-tip-note). */
  tip?: string;
  note?: string;
  shortcut?: ShortcutName;
  icon?: LucideIcon;
  ref?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}

/** A button with an optional icon, tooltip and keyboard shortcut. */
export function Button({ tip, note, shortcut, icon, children, ...rest }: ButtonProps) {
  return (
    <button type="button" data-tip={tip} data-tip-note={note} {...useShortcutProps(shortcut)} {...rest}>
      {icon && <Icon icon={icon} />}
      {children}
    </button>
  );
}

/** An icon-only button: `label` is its accessible name, the tooltip repeats or explains it. */
export function IconButton({ label, className = 'icon-btn', ...rest }: ButtonProps & { label: string; icon: LucideIcon }) {
  return <Button className={className} aria-label={label} {...rest} />;
}

function useShortcutProps(name: ShortcutName | undefined) {
  const attributes = useShortcut(name ?? 'pieces');
  return name ? attributes : {};
}
