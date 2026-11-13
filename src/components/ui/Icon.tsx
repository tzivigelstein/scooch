import type { LucideIcon } from 'lucide-react';

/** A decorative Lucide icon (24 × 24, stroke 2, the text's color). */
export function Icon({ icon: Glyph, className }: { icon: LucideIcon; className?: string }) {
  return <Glyph className={className ? `icon ${className}` : 'icon'} size={20} strokeWidth={2} aria-hidden="true" focusable="false" />;
}
