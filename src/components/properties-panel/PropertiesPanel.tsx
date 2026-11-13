// The «Propiedades» panel: the selected piece, the sheet, the arrangement and the grid.

import { X } from 'lucide-react';
import { NARROW_QUERY } from '../../config.ts';
import { t } from '../../copy/index.ts';
import { useMediaQuery } from '../../hooks/useMediaQuery.ts';
import { useView } from '../../state/view.ts';
import { closeDrawer } from '../../state/actions/drawers.ts';
import { closeOnFocusOut } from '../pieces-panel/PiecesPanel.tsx';
import { IconButton } from '../ui/Button.tsx';
import { ArrangeSection } from './ArrangeSection.tsx';
import { GridSection } from './GridSection.tsx';
import { PieceSection } from './PieceSection.tsx';
import { SheetSection } from './SheetSection.tsx';

export function PropertiesPanel() {
  const collapsible = useMediaQuery(NARROW_QUERY);
  const open = useView((s) => s.drawer === 'props') && collapsible;
  const className = `panel panel-right${collapsible ? ' is-drawer' : ''}${open ? ' is-open' : ''}`;
  return (
    <aside id="props-panel" className={className} aria-label={t('props.title')} hidden={collapsible && !open} onBlur={open ? closeOnFocusOut('props') : undefined}>
      <div className="panel-head drawer-head">
        <p className="panel-title">{t('props.title')}</p>
        <IconButton className="icon-btn small drawer-close" data-close-panel="" icon={X} label={t('props.close')} tip={t('app.close')} shortcut="closePanel" onClick={() => closeDrawer('props')} />
      </div>
      <PieceSection />
      <SheetSection />
      <ArrangeSection />
      <GridSection />
    </aside>
  );
}
