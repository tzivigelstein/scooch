// The context menus: the selected pieces' (rotate, duplicate, copy, cut,
// paste, bring to front, crop, select same, move to a new sheet, remove) and
// an empty sheet's (paste, select all on it, arrange, add a sheet).

import {
  BringToFront,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crop,
  FilePlus,
  Images,
  LayoutDashboard,
  ListChecks,
  RotateCcw,
  RotateCw,
  Scissors,
  SquareArrowRight,
  Trash2,
} from 'lucide-react';
import { t } from '../../copy/index.ts';
import { SHORTCUTS, type ShortcutName } from '../../hooks/shortcuts.ts';
import { getDocument } from '../../state/document.ts';
import { usePrefs } from '../../state/prefs.ts';
import { itemsOn, selectedItems, sheetIndex } from '../../state/selectors.ts';
import { copySelection, cutSelection, hasClip, pastePieces } from '../../state/actions/clipboard.ts';
import { arrangeAll } from '../../state/actions/edit.ts';
import { bringToFront, duplicate, overlapsOthers, remove, rotate } from '../../state/actions/pieces.ts';
import { selectSame, setSelection } from '../../state/actions/selection.ts';
import { addSheet, canMoveToNewSheet, moveToNewSheet } from '../../state/actions/sheets.ts';
import { announce } from '../feedback/announcer.ts';
import { Menu, type MenuEntry } from '../ui/Menu.tsx';
import { startCrop } from './cropMode.ts';
import { closeContextMenu, useContextMenu } from './contextMenu.ts';

export default function ContextMenu() {
  const request = useContextMenu((s) => s.request);
  const singleKeys = usePrefs((s) => s.singleKeys);
  if (!request) return null;
  // A shortcut's hint and aria-keyshortcuts (single-key ones only while they are on).
  const keys = (name: ShortcutName) => {
    const shortcut: { kbd?: string; aria?: string; single?: boolean } = SHORTCUTS[name];
    return shortcut.single && !singleKeys ? {} : { keys: shortcut.kbd, aria: shortcut.aria };
  };
  const pasteReason = hasClip() ? null : t('menu.reasons.paste');
  let label: string;
  let entries: MenuEntry[];
  if (request.kind === 'piece') {
    const list = selectedItems();
    const single = list.length === 1;
    label = single ? t('menu.piece') : t('menu.pieces', { n: list.length });
    entries = [
      { id: 'rotate-left', label: t('menu.rotateLeft'), icon: RotateCcw, ...keys('rotateLeft'), run: () => rotate(-1, { focus: true }) },
      { id: 'rotate-right', label: t('menu.rotateRight'), icon: RotateCw, ...keys('rotateRight'), run: () => rotate(1, { focus: true }) },
      { id: 'duplicate', label: t('menu.duplicate'), icon: CopyPlus, separator: true, ...keys('duplicate'), run: () => duplicate(1, { focus: true }) },
      { id: 'copy', label: t('menu.copy'), icon: Copy, ...keys('copy'), run: () => void copySelection() },
      { id: 'cut', label: t('menu.cut'), icon: Scissors, ...keys('cut'), run: () => void cutSelection() },
      { id: 'paste', label: t('menu.paste'), icon: ClipboardPaste, ...keys('paste'), disabled: pasteReason, run: () => void pastePieces() },
      {
        id: 'front',
        label: t('menu.front'),
        icon: BringToFront,
        separator: true,
        ...keys('front'),
        disabled: !single ? t('menu.reasons.single') : !overlapsOthers(list[0]) ? t('menu.reasons.front') : null,
        run: () => bringToFront({ focus: true }),
      },
      { id: 'crop', label: t('menu.crop'), icon: Crop, ...keys('crop'), disabled: single ? null : t('menu.reasons.single'), run: () => startCrop() },
      { id: 'same', label: t('menu.selectSame'), icon: Images, ...keys('selectSame'), run: selectSame },
      { id: 'new-sheet', label: t('menu.newSheet'), icon: SquareArrowRight, disabled: canMoveToNewSheet() ? null : t('menu.reasons.oneSheet'), run: moveToNewSheet },
      { id: 'remove', label: t('menu.remove'), icon: Trash2, separator: true, ...keys('remove'), run: () => remove({ focus: true }) },
    ];
  } else {
    const onSheet = itemsOn(request.sheet);
    label = t('menu.sheet', { i: sheetIndex(request.sheet) + 1 });
    entries = [
      { id: 'paste', label: t('menu.paste'), icon: ClipboardPaste, ...keys('paste'), disabled: pasteReason, run: () => void pastePieces() },
      {
        id: 'select-sheet',
        label: t('menu.selectSheet'),
        icon: ListChecks,
        keys: 'Mod+A',
        aria: 'Control+A Meta+A',
        disabled: onSheet.length ? null : t('menu.reasons.emptySheet'),
        run: () => {
          setSelection(
            onSheet.map((item) => item.id),
            { pinned: true }
          );
          announce(t('announce.selectedSheet', { n: onSheet.length, i: sheetIndex(request.sheet) + 1 }));
        },
      },
      { id: 'arrange', label: t('menu.arrange'), icon: LayoutDashboard, ...keys('arrange'), disabled: getDocument().items.length ? null : t('menu.reasons.noPieces'), run: arrangeAll },
      { id: 'add-sheet', label: t('menu.addSheet'), icon: FilePlus, run: () => addSheet() },
    ];
  }
  return <Menu id="context-menu" label={label} entries={entries} at={{ x: request.x, y: request.y }} onClose={() => closeContextMenu()} />;
}
