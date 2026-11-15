// The «Propiedades» panel, in two tabs: «Pieza» (the selection's properties)
// and «Proyecto» (the open project's settings, for every sheet: paper,
// arrangement, cut lines, grid). The tab
// follows the selection (state/actions/panels.ts).

import { X } from 'lucide-react';
import { NARROW_QUERY } from '../../config.ts';
import { t } from '../../copy/index.ts';
import { useMediaQuery } from '../../hooks/useMediaQuery.ts';
import { useShortcut } from '../../hooks/shortcuts.ts';
import { useView } from '../../state/view.ts';
import { closeDrawer } from '../../state/actions/drawers.ts';
import { showPropsTab, TAB_PANELS } from '../../state/actions/panels.ts';
import { closeOnFocusOut } from '../pieces-panel/PiecesPanel.tsx';
import { IconButton } from '../ui/Button.tsx';
import { Tabs } from '../ui/Tabs.tsx';
import { ArrangeSection } from './ArrangeSection.tsx';
import { CutsSection } from './CutsSection.tsx';
import { GridSection } from './GridSection.tsx';
import { PieceSection } from './PieceSection.tsx';
import { SheetSection } from './SheetSection.tsx';
import './PropertiesPanel.css';

export function PropertiesPanel() {
  const collapsible = useMediaQuery(NARROW_QUERY);
  const open = useView((s) => s.drawer === 'props') && collapsible;
  const tab = useView((s) => s.propsTab);
  const pieceKeys = useShortcut('tabPiece');
  const projectKeys = useShortcut('tabProject');
  const className = `panel panel-right${collapsible ? ' is-drawer' : ''}${open ? ' is-open' : ''}`;
  return (
    <aside id="props-panel" className={className} aria-label={t('props.title')} hidden={collapsible && !open} onBlur={open ? closeOnFocusOut('props') : undefined}>
      <div className="panel-head drawer-head">
        <p className="panel-title">{t('props.title')}</p>
        <IconButton className="icon-btn small drawer-close" data-close-panel="" icon={X} label={t('props.close')} tip={t('app.close')} shortcut="closePanel" onClick={() => closeDrawer('props')} />
      </div>
      <Tabs
        idPrefix="props-tab"
        className="tabs props-tabs"
        label={t('props.title')}
        value={tab}
        onChange={(value, { focus }) => showPropsTab(value, { focus })}
        options={[
          { value: 'piece', label: t('props.tabs.piece'), panel: TAB_PANELS.piece, attrs: { 'data-tip': t('props.tabs.piece'), ...pieceKeys } },
          { value: 'project', label: t('props.tabs.project'), panel: TAB_PANELS.project, attrs: { 'data-tip': t('props.tabs.project'), ...projectKeys } },
        ]}
      />
      <div id={TAB_PANELS.piece} className="tab-panel" role="tabpanel" aria-labelledby="props-tab-piece" hidden={tab !== 'piece'}>
        <PieceSection />
      </div>
      <div id={TAB_PANELS.project} className="tab-panel" role="tabpanel" aria-labelledby="props-tab-project" hidden={tab !== 'project'}>
        <SheetSection />
        <ArrangeSection />
        <CutsSection />
        <GridSection />
      </div>
    </aside>
  );
}
