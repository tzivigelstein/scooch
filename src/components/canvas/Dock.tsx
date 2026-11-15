// The panel buttons: the rail's on medium screens and the bottom dock's on narrow ones.

import { List, SlidersHorizontal } from 'lucide-react';
import { LEFT_DRAWER_QUERY, NARROW_QUERY } from '../../config.ts';
import { t } from '../../copy/index.ts';
import { useMediaQuery } from '../../hooks/useMediaQuery.ts';
import { useDocument } from '../../state/document.ts';
import { useView } from '../../state/view.ts';
import { toggleDrawer } from '../../state/actions/drawers.ts';
import { IconButton } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import './Dock.css';

function useDrawerOpen(name: 'pieces' | 'props') {
  const collapsible = useMediaQuery(name === 'pieces' ? LEFT_DRAWER_QUERY : NARROW_QUERY);
  return useView((s) => s.drawer === name) && collapsible;
}

export function Rail() {
  const open = useDrawerOpen('pieces');
  return (
    <div className="rail">
      <IconButton
        id="pieces-toggle"
        className={open ? 'tool is-open' : 'tool'}
        aria-expanded={open}
        aria-controls="pieces-panel"
        icon={List}
        label={t('pieces.title')}
        tip={t('pieces.title')}
        shortcut="pieces"
        onClick={(e) => toggleDrawer('pieces', e.currentTarget)}
      />
    </div>
  );
}

export function Dock() {
  const piecesOpen = useDrawerOpen('pieces');
  const propsOpen = useDrawerOpen('props');
  const n = useDocument((s) => s.items.length);
  return (
    <div className="dock">
      <button
        type="button"
        id="pieces-dock"
        className={piecesOpen ? 'dock-btn is-open' : 'dock-btn'}
        aria-expanded={piecesOpen}
        aria-controls="pieces-panel"
        onClick={(e) => toggleDrawer('pieces', e.currentTarget)}
      >
        <Icon icon={List} />
        <span>{t('dock.pieces')}</span>
        <span id="dock-count" className="dock-count">
          {n ? String(n) : ''}
        </span>
      </button>
      <button
        type="button"
        id="props-toggle"
        className={propsOpen ? 'dock-btn is-open' : 'dock-btn'}
        aria-expanded={propsOpen}
        aria-controls="props-panel"
        onClick={(e) => toggleDrawer('props', e.currentTarget)}
      >
        <Icon icon={SlidersHorizontal} />
        <span>{t('dock.props')}</span>
      </button>
    </div>
  );
}
