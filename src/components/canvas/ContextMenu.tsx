// The context menus: the selected pieces' (rotate, duplicate, copy, cut,
// paste, bring to front, crop, select same, move to a new sheet, remove) and
// an empty sheet's (paste, select all on it, arrange, add a sheet). Their
// entries are the commands' (state/commands.ts): name, icon, keys, why one
// can't run and what it does.

import { ListChecks } from 'lucide-react';
import { t, type CopyKey } from '../../copy/index.ts';
import { SHORTCUTS } from '../../hooks/shortcuts.ts';
import { usePrefs } from '../../state/prefs.ts';
import { command, runCommand, shownShortcut, type CommandId } from '../../state/commands.ts';
import { itemsOn, selectedItems, sheetIndex } from '../../state/selectors.ts';
import { setSelection } from '../../state/actions/selection.ts';
import { announce } from '../feedback/announcer.ts';
import { Menu, type MenuEntry } from '../ui/Menu.tsx';
import { closeContextMenu, useContextMenu } from './contextMenu.ts';

export default function ContextMenu() {
  const request = useContextMenu((s) => s.request);
  const singleKeys = usePrefs((s) => s.singleKeys);
  if (!request) return null;
  /** A command as an entry; `label`: a shorter name where the menu gives the context. */
  const entry = (id: string, name: CommandId, { label, separator }: { label?: CopyKey; separator?: boolean } = {}): MenuEntry => {
    const c = command(name);
    const keys = shownShortcut(c, singleKeys);
    return { id, label: label ? t(label) : c.label, icon: c.icon, separator, keys: keys?.kbd, aria: keys?.aria, disabled: c.disabled, run: () => runCommand(name, 'menu') };
  };
  let label: string;
  let entries: MenuEntry[];
  if (request.kind === 'piece') {
    const list = selectedItems();
    label = list.length === 1 ? t('menu.piece') : t('menu.pieces', { n: list.length });
    entries = [
      entry('rotate-left', 'rotateLeft'),
      entry('rotate-right', 'rotateRight'),
      entry('duplicate', 'duplicate', { separator: true }),
      entry('copy', 'copy'),
      entry('cut', 'cut'),
      entry('paste', 'paste'),
      entry('front', 'front', { separator: true }),
      entry('crop', 'crop'),
      entry('same', 'selectSame'),
      entry('new-sheet', 'moveToNewSheet'),
      entry('remove', 'remove', { label: 'menu.remove', separator: true }),
    ];
  } else {
    const onSheet = itemsOn(request.sheet);
    label = t('menu.sheet', { i: sheetIndex(request.sheet) + 1 });
    entries = [
      entry('paste', 'paste'),
      {
        id: 'select-sheet',
        label: t('menu.selectSheet'),
        icon: ListChecks,
        keys: SHORTCUTS.selectAll.kbd,
        aria: SHORTCUTS.selectAll.aria,
        disabled: onSheet.length ? null : t('menu.reasons.emptySheet'),
        run: () => {
          setSelection(
            onSheet.map((item) => item.id),
            { pinned: true }
          );
          announce(t('announce.selectedSheet', { n: onSheet.length, i: sheetIndex(request.sheet) + 1 }));
        },
      },
      entry('arrange', 'arrange', { label: 'menu.arrange' }),
      entry('add-sheet', 'addSheet'),
    ];
  }
  return <Menu id="context-menu" label={label} entries={entries} at={{ x: request.x, y: request.y }} onClose={() => closeContextMenu()} />;
}
