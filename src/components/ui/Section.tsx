import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { previewAttrs } from '../../hooks/usePreviewTriggers.ts';
import { setSectionOpen, usePrefs, type SectionName } from '../../state/prefs.ts';
import type { PreviewKind } from '../../state/preview.ts';
import { Icon } from './Icon.tsx';

/**
 * A collapsible section of the properties panel; it remembers whether it is
 * open. `preview`: what the canvas shows while the section is hovered or focused.
 */
export function Section({ name, title, preview, children }: { name: SectionName; title: string; preview?: PreviewKind; children: ReactNode }) {
  const open = usePrefs((s) => s.sections[name] !== false);
  return (
    <div className={open ? 'prop-section' : 'prop-section is-collapsed'} data-section={name} {...(preview && previewAttrs(preview))}>
      <h2 className="section-title">
        <button type="button" className="section-toggle" aria-expanded={open} aria-controls={`section-${name}`} onClick={() => setSectionOpen(name, !open)}>
          <span>{title}</span>
          <Icon icon={ChevronDown} className="chevron" />
        </button>
      </h2>
      <div id={`section-${name}`} className="section-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
