// The dialogs, always in the page (closed) like any other element; their
// contents render while open, the rarely used ones loaded on demand.

import { Suspense } from 'react';
import { usePrefs } from '../../state/prefs.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { closeDialog, useDialogs, type DialogName } from './dialogs.ts';
import { finishDonation, useDonate } from './donate.ts';
import { DonateContent, PrefsContent, ProjectsContent, ShortcutsContent } from './lazy.ts';

const byId = (id: string) => () => document.getElementById(id);
const otherDialogOpen = (name: DialogName) => () => Object.keys(useDialogs.getState().open).some((other) => other !== name);

export function Dialogs() {
  const open = useDialogs((s) => s.open);
  const donate = useDonate((s) => s.request);
  const singleKeys = usePrefs((s) => s.singleKeys);
  return (
    <>
      <Dialog
        id="donate"
        className="donate"
        labelledBy="donate-title"
        describedBy="donate-body"
        open={!!donate}
        returnTo={donate?.opener ?? null}
        // The focus on the title: a hurried Enter doesn't open Patreon by accident.
        initialFocus={byId('donate-title')}
        onCancel={() => finishDonation('esc')}
        onClose={() => finishDonation('close')}
      >
        {donate && (
          <Suspense fallback={null}>
            <DonateContent />
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
