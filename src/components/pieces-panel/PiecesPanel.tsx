// The «Piezas» panel: a zone to add files, the list and the total.

import { Upload, X } from 'lucide-react';
import type { FocusEvent } from 'react';
import { t } from '../../copy/index.ts';
import { useMediaQuery } from '../../hooks/useMediaQuery.ts';
import { LEFT_DRAWER_QUERY } from '../../config.ts';
import { useDocument } from '../../state/document.ts';
import { useView } from '../../state/view.ts';
import { closeDrawer, DRAWER_TRIGGERS } from '../../state/actions/drawers.ts';
import { openFiles } from '../../state/actions/files.ts';
import { clearAll } from '../../state/actions/sheets.ts';
import { IconButton } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { disabledUnlessFocused } from '../topbar/Topbar.tsx';
import { PieceList } from './PieceList.tsx';
import './PiecesPanel.css';

/** If the focus goes somewhere else (Tab out), an open overlay panel closes without stealing it. */
export function closeOnFocusOut(name: 'pieces' | 'props') {
  return (e: FocusEvent<HTMLElement>) => {
    const to = e.relatedTarget as Element | null;
    if (!to || e.currentTarget.contains(to) || DRAWER_TRIGGERS[name].includes(to.id)) return;
    closeDrawer(name, { focus: 'none' });
  };
}

export function PiecesPanel() {
  const collapsible = useMediaQuery(LEFT_DRAWER_QUERY);
  const open = useView((s) => s.drawer === 'pieces') && collapsible;
  const n = useDocument((s) => s.items.length);
  const busy = useDocument((s) => s.busy);
  const className = `panel panel-left${collapsible ? ' is-drawer' : ''}${open ? ' is-open' : ''}`;
  return (
    <aside id="pieces-panel" className={className} aria-labelledby="pieces-title" hidden={collapsible && !open} onBlur={open ? closeOnFocusOut('pieces') : undefined}>
      <div className="panel-head">
        <h2 id="pieces-title" className="panel-title">
          {t('pieces.title')}
        </h2>
        <IconButton className="icon-btn small drawer-close" data-close-panel="" icon={X} label={t('pieces.close')} tip={t('app.close')} shortcut="closePanel" onClick={() => closeDrawer('pieces')} />
      </div>
      <button type="button" id="addzone" className="addzone" onClick={openFiles}>
        <Icon icon={Upload} />
        <span className="addzone-text">
          <span className="addzone-title">{t('pieces.addTitle')}</span>
          <span className="addzone-sub">{t('pieces.addSub')}</span>
        </span>
      </button>
      <div id="list-empty" className="panel-empty" hidden={n > 0}>
        <p>{t('pieces.empty')}</p>
        <p className="panel-tip">{t('pieces.emptyTip')}</p>
      </div>
      <PieceList />
      <p id="list-hint" className="sr-only">
        {t('pieces.listHint')}
      </p>
      <div className="panel-foot">
        <span id="piece-total" className="foot-count">
          {t('pieces.count', { n })}
        </span>
        <button type="button" id="clear" className="text-btn danger" disabled={disabledUnlessFocused(busy || !n, 'clear', busy, !n)} onClick={() => void clearAll()}>
          {t('pieces.clear')}
        </button>
      </div>
    </aside>
  );
}
