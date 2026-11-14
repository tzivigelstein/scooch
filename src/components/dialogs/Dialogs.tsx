// The dialogs, always in the page (closed) like any other element; their
// contents render while open, the rarely used ones loaded on demand.

import { Suspense } from 'react';
import { usePrefs } from '../../state/prefs.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { closeDialog, useDialogs, type DialogName } from './dialogs.ts';
import { PaletteContent, PrefsContent, PrintTipContent, ProjectsContent, ShortcutsContent } from './lazy.ts';
import { finishTip, usePrintTip } from './printTip.ts';

const byId = (id: string) => () => document.getElementById(id);
const otherDialogOpen = (name: DialogName) => () => Object.keys(useDialogs.getState().open).some((other) => other !== name);

export function Dialogs() {
  const open = useDialogs((s) => s.open);
  const tip = usePrintTip((s) => s.request);
  const singleKeys = usePrefs((s) => s.singleKeys);
  return (
    <>
      <Dialog
        id="print-tip"
        className="dialog print-tip"
        labelledBy="print-tip-title"
        describedBy="print-tip-steps"
        open={!!tip}
        returnTo={tip?.opener ?? null}
        // On its button: Enter prints (or downloads) right away; Esc cancels.
        initialFocus={byId('print-tip-go')}
        onClose={() => finishTip(false)}
      >
        {tip && (
          <Suspense fallback={null}>
            <PrintTipContent />
          </Suspense>
        )}
      </Dialog>
      <Dialog
        id="shortcuts"
        className={singleKeys ? 'dialog' : 'dialog single-off'}
        labelledBy="shortcuts-title"
        open={!!open.shortcuts}
        returnTo={open.shortcuts?.returnTo ?? null}
        fallback={byId('help')}
        focusTaken={otherDialogOpen('shortcuts')}
        onClose={() => closeDialog('shortcuts')}
      >
        {open.shortcuts && (
          <Suspense fallback={null}>
            <ShortcutsContent />
          </Suspense>
        )}
      </Dialog>
      <Dialog
        id="projects"
        className="dialog projects"
        labelledBy="projects-title"
        open={!!open.projects}
        returnTo={open.projects?.returnTo ?? null}
        fallback={byId('projects-open')}
        initialFocus={byId('project-new')}
        onClose={() => closeDialog('projects')}
      >
        {open.projects && (
          <Suspense fallback={null}>
            <ProjectsContent />
          </Suspense>
        )}
      </Dialog>
      <Dialog
        id="palette"
        className="dialog palette"
        labelledBy="palette-title"
        open={!!open.palette}
        returnTo={open.palette?.returnTo ?? null}
        fallback={byId('palette-open')}
        initialFocus={byId('palette-input')}
        focusTaken={otherDialogOpen('palette')}
        onClose={() => closeDialog('palette')}
      >
        {open.palette && (
          <Suspense fallback={null}>
            <PaletteContent />
          </Suspense>
        )}
      </Dialog>
      <ConfirmDialog />
      <Dialog
        id="prefs"
        className="dialog prefs"
        labelledBy="prefs-title"
        open={!!open.prefs}
        returnTo={open.prefs?.returnTo ?? null}
        fallback={byId('prefs-open')}
        onClose={() => closeDialog('prefs')}
      >
        {open.prefs && (
          <Suspense fallback={null}>
            <PrefsContent />
          </Suspense>
        )}
      </Dialog>
    </>
  );
}
