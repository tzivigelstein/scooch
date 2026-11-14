// The zoom control's menu: fit the sheet, fit its width (the commands of
// state/commands.ts) and a few levels.

import { MENU_LEVELS } from '../../core/zoom.js';
import { t } from '../../copy/index.ts';
import { usePrefs } from '../../state/prefs.ts';
import { command, shownShortcut, type CommandId } from '../../state/commands.ts';
import { Menu, type MenuEntry } from '../ui/Menu.tsx';
import { zoomToPercent } from './viewport.ts';
import { closeZoomMenu, useZoomMenu } from './zoomMenu.ts';

export default function ZoomMenu() {
  const at = useZoomMenu((s) => s.at);
  const singleKeys = usePrefs((s) => s.singleKeys);
  if (!at) return null;
  const entry = (id: string, name: CommandId): MenuEntry => {
    const c = command(name);
    const keys = shownShortcut(c, singleKeys);
    return { id, label: c.label, icon: c.icon, keys: keys?.kbd, aria: keys?.aria, run: c.run! };
  };
  const entries: MenuEntry[] = [
    entry('fit', 'zoomFit'),
    entry('width', 'zoomWidth'),
    ...MENU_LEVELS.map((pct, i) => ({
      id: `level-${pct}`,
      label: t('zoom.preset', { pct }),
      separator: i === 0,
      run: () => zoomToPercent(pct),
    })),
  ];
  return <Menu id="zoom-menu" label={t('zoom.menu')} entries={entries} at={at} onClose={closeZoomMenu} />;
}
