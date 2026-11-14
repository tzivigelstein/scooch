// The floating toolbar of the selected piece (or pieces): a toolbar with a
// roving tab stop. Its position is painted by selection.ts.

import { CopyPlus, Crop, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { t } from '../../copy/index.ts';
import { previewAttrs } from '../../hooks/usePreviewTriggers.ts';
import { getAsset } from '../../state/assets.ts';
import { useDocument } from '../../state/document.ts';
import { duplicate, remove, rotate } from '../../state/actions/pieces.ts';
import { controlRoute, used, type UsageId } from '../../state/tips.ts';
import { IconButton } from '../ui/Button.tsx';
import { startCrop } from './cropMode.ts';

const ACTIONS = ['rotate-left', 'rotate-right', 'crop', 'duplicate', 'remove'] as const;
type Action = (typeof ACTIONS)[number];
const COMMANDS: Record<Action, UsageId> = { 'rotate-left': 'rotateLeft', 'rotate-right': 'rotateRight', crop: 'crop', duplicate: 'duplicate', remove: 'remove' };
// Cropping works on one piece: with several, the toolbar doesn't offer it.
const GROUP_ACTIONS = ACTIONS.filter((action) => action !== 'crop');

export function PieceToolbar() {
  const selection = useDocument((s) => s.selection);
  const items = useDocument((s) => s.items);
  const [stop, setStop] = useState(0);
  const n = selection.length;
  const actions: readonly Action[] = n > 1 ? GROUP_ACTIONS : ACTIONS;
  const tabStop = Math.min(stop, actions.length - 1);
  const primary = items.find((item) => item.id === selection.at(-1));
  const label = n > 1 ? t('piecebar.labelGroup', { n }) : primary ? t('piecebar.labelFor', { name: getAsset(primary.asset).name }) : t('piecebar.label');

  const act = (action: Action, viaKeyboard: boolean) => {
    if (action === 'remove') return remove({ focus: viaKeyboard });
    if (action === 'rotate-left') return rotate(-1);
    if (action === 'rotate-right') return rotate(1);
    if (action === 'crop') return startCrop();
    duplicate(1);
  };
  const run = (action: Action, e: MouseEvent) => {
    act(action, e.detail === 0);
    used(COMMANDS[action], controlRoute(e));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = [...e.currentTarget.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const count = buttons.length;
    const next = ({ ArrowRight: (i + 1) % count, ArrowLeft: (i - 1 + count) % count, Home: 0, End: count - 1 } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    setStop(next);
    buttons[next].focus();
  };

  const props = (action: Action) => ({
    'data-action': action,
    tabIndex: actions.indexOf(action) === tabStop ? 0 : -1,
    onClick: (e: MouseEvent) => run(action, e),
    onFocus: () => setStop(actions.indexOf(action)),
  });

  return (
    <div id="piecebar" className="piecebar" role="toolbar" aria-label={label} hidden={!n} onKeyDown={onKeyDown}>
      <span id="piece-size" className="piecebar-size" aria-hidden="true" />
      <IconButton icon={RotateCcw} label={t('piecebar.rotateLeft')} tip={t('piecebar.rotateLeftTip')} shortcut="rotateLeft" {...props('rotate-left')} />
      <IconButton icon={RotateCw} label={t('piecebar.rotateRight')} tip={t('piecebar.rotateRightTip')} shortcut="rotateRight" {...props('rotate-right')} />
      {n === 1 && <IconButton icon={Crop} label={t('crop.start')} tip={t('crop.start')} shortcut="crop" data-crop-toggle="" {...props('crop')} />}
      <IconButton icon={CopyPlus} label={t('piecebar.duplicate')} tip={t('piecebar.duplicate')} shortcut="duplicate" {...props('duplicate')} {...previewAttrs('duplicate', 1)} />
      <span className="piecebar-sep" aria-hidden="true" />
      <IconButton icon={Trash2} className="icon-btn danger" label={t('piecebar.remove')} tip={t('piecebar.removeTip')} shortcut="remove" {...props('remove')} />
    </div>
  );
}
