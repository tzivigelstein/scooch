// The zoom control's menu: fit the sheet, fit its width and a few levels.

import { Maximize, MoveHorizontal } from 'lucide-react';
import { MENU_LEVELS, fromPercent } from '../../core/zoom.js';
import { t } from '../../copy/index.ts';
import { SHORTCUTS } from '../../hooks/shortcuts.ts';
import { usePrefs } from '../../state/prefs.ts';
import { currentSheet } from '../../state/selectors.ts';
import { announce } from '../feedback/announcer.ts';
import { Menu, type MenuEntry } from '../ui/Menu.tsx';
import { fitSheet, zoomTo } from './viewport.ts';
import { closeZoomMenu, useZoomMenu } from './zoomMenu.ts';

export default function ZoomMenu() {
  const at = useZoomMenu((s) => s.at);
  const singleKeys = usePrefs((s) => s.singleKeys);
  if (!at) return null;
  const keys = (name: 'fitSheet' | 'fitWidth') => (singleKeys ? { keys: SHORTCUTS[name].kbd, aria: SHORTCUTS[name].aria } : {});
  const entries: MenuEntry[] = [
    { id: 'fit', label: t('zoom.fit'), icon: Maximize, ...keys('fitSheet'), run: () => fitSheet('fit', currentSheet()) },
    { id: 'width', label: t('zoom.width'), icon: MoveHorizontal, ...keys('fitWidth'), run: () => fitSheet('width', currentSheet()) },
    ...MENU_LEVELS.map((pct, i) => ({
      id: `level-${pct}`,
      label: t('zoom.preset', { pct }),
      separator: i === 0,
      run: () => {
        zoomTo(fromPercent(pct));
        announce(t('zoom.changed', { pct }));
      },
    })),
  ];
  return <Menu id="zoom-menu" label={t('zoom.menu')} entries={entries} at={at} onClose={closeZoomMenu} />;
}
