// The «Distribución» section: gap, rotate when useful and allow overlaps.

import { t } from '../../copy/index.ts';
import { useDocument } from '../../state/document.ts';
import { setAllowOverlap, setRotateWhenUseful } from '../../state/actions/sheets.ts';
import { Section } from '../ui/Section.tsx';
import { Switch } from '../ui/Switch.tsx';
import { SheetLength } from './SheetSection.tsx';

export function ArrangeSection() {
  const rotate = useDocument((s) => s.rotate);
  const allowOverlap = useDocument((s) => s.allowOverlap);
  return (
    <Section name="arrange" title={t('props.arrange')}>
      <SheetLength name="gap" />
      <Switch id="allow-rotate" label={<span>{t('props.rotate')}</span>} hint={t('props.rotateHint')} checked={rotate} onChange={setRotateWhenUseful} />
      <Switch id="allow-overlap" label={<span>{t('props.overlap')}</span>} hint={t('props.overlapHint')} checked={allowOverlap} onChange={setAllowOverlap} />
    </Section>
  );
}
