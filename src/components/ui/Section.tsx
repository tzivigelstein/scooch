import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { setSectionOpen, usePrefs, type SectionName } from '../../state/prefs.ts';
import { Icon } from './Icon.tsx';

/** A collapsible section of the properties panel; it remembers whether it is open. */
export function Section({ name, title, children }: { name: SectionName; title: string; children: ReactNode }) {
  const open = usePrefs((s) => s.sections[name] !== false);
  return (
    <div className={open ? 'prop-section' : 'prop-section is-collapsed'} data-section={name}>
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
