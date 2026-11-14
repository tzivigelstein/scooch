// The top bar: brand, open project, add, arrange, undo and redo,
// preferences, shortcuts, download and print.

import { Download, ImagePlus, Keyboard, LayoutDashboard, Printer, Redo2, Settings, Undo2 } from 'lucide-react';
import { useRef } from 'react';
import { t } from '../../copy/index.ts';
import { useDocument } from '../../state/document.ts';
import { openPrefs, openShortcuts } from '../../state/actions/dialogs.ts';
import { arrangeAll, redoLast, undoLast } from '../../state/actions/edit.ts';
import { loadFiles, openFiles } from '../../state/actions/files.ts';
import { exportPdf, printPdf } from '../../state/actions/output.ts';
import { Button, IconButton } from '../ui/Button.tsx';
import { ProjectBar } from './ProjectBar.tsx';

/**
 * While something loads, controls are disabled except the focused one
 * (disabling it would lose the focus; its actions are ignored meanwhile).
 */
export const disabledUnlessFocused = (disabled: boolean, id: string, busy: boolean, empty = false) =>
  disabled && !(busy && document.activeElement?.id === id && !empty);

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false">
      <rect x="7" y="2.5" width="14" height="17" rx="2.5" fill="currentColor" opacity=".28" />
      <rect x="3" y="5" width="14" height="17" rx="2.5" fill="currentColor" />
      <rect x="6" y="8.5" width="4" height="5" rx="1" fill="#fff" />
      <rect x="11" y="8.5" width="3" height="3" rx=".8" fill="#fff" />
      <rect x="11" y="12.5" width="3" height="6" rx=".8" fill="#fff" />
      <rect x="6" y="14.5" width="4" height="4" rx="1" fill="#fff" />
    </svg>
  );
}

export function Topbar() {
  const busy = useDocument((s) => s.busy);
  const empty = useDocument((s) => s.items.length === 0);
  const canUndo = useDocument((s) => s.canUndo);
  const canRedo = useDocument((s) => s.canRedo);
  const file = useRef<HTMLInputElement>(null);
  const off = (id: string, disabled: boolean) => disabledUnlessFocused(disabled, id, busy, empty);

  return (
    <header className="topbar">
      {/* Not a link: here it would only reload the editor, losing the selection and a crop in progress. */}
      <div className="brand">
        <BrandMark />
        <span className="brand-name">{t('app.name')}</span>
      </div>

      <ProjectBar />

      <div className="bar-group">
        <Button id="add" className="btn ghost" icon={ImagePlus} tip={t('bar.addTip')} shortcut="add" onClick={openFiles}>
          <span className="btn-label">{t('bar.add')}</span>
        </Button>
        <Button id="arrange" className="btn accent" icon={LayoutDashboard} tip={t('bar.arrangeTip')} shortcut="arrange" disabled={off('arrange', busy || empty)} onClick={arrangeAll}>
          <span className="btn-label">{t('bar.arrange')}</span>
        </Button>
        <span className="tool-sep" aria-hidden="true" />
        <IconButton id="undo" className="tool" icon={Undo2} label={t('bar.undo')} tip={t('bar.undo')} shortcut="undo" disabled={off('undo', busy || !canUndo)} onClick={undoLast} />
        <IconButton id="redo" className="tool" icon={Redo2} label={t('bar.redo')} tip={t('bar.redo')} shortcut="redo" disabled={off('redo', busy || !canRedo)} onClick={redoLast} />
      </div>

      <div className="bar-group end">
        <IconButton id="prefs-open" className="tool" aria-haspopup="dialog" icon={Settings} label={t('prefs.title')} tip={t('prefs.title')} onClick={() => openPrefs()} />
        <IconButton id="help" className="tool" aria-haspopup="dialog" icon={Keyboard} label={t('bar.shortcuts')} tip={t('bar.shortcuts')} shortcut="help" onClick={openShortcuts} />
        <IconButton
          id="export"
          className="tool"
          icon={Download}
          label={t('bar.download')}
          tip={t('bar.download')}
          shortcut="download"
          disabled={off('export', busy || empty)}
          onClick={() => void exportPdf()}
        />
        <Button id="print" className="btn primary" icon={Printer} tip={t('bar.print')} shortcut="print" disabled={off('print', busy || empty)} onClick={() => void printPdf()}>
          <span className="btn-label">{t('bar.print')}</span>
        </Button>
      </div>
      <input
        ref={file}
        type="file"
        id="file"
        multiple
        accept="image/*,application/pdf"
        hidden
        onChange={() => {
          const files = [...(file.current?.files ?? [])];
          if (file.current) file.current.value = '';
          void loadFiles(files);
        }}
      />
    </header>
  );
}
