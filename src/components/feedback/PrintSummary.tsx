// The summary after printing or downloading: its dialog, always in the page
// (closed), and what it says (SummaryContent.tsx), loaded when the app is
// idle (see printSummary.ts). «Listo» starts focused.

import { Suspense } from 'react';
import { Dialog } from '../ui/Dialog.tsx';
import { closeSummary, SummaryContent, usePrintSummary } from './printSummary.ts';

const focusDone = () => document.getElementById('summary-done');

export function PrintSummary() {
  const summary = usePrintSummary((s) => s.summary);
  const returnTo = usePrintSummary((s) => s.returnTo);
  const kind = usePrintSummary((s) => s.kind);
  const describedBy = summary && [summary.saved > 0 && 'summary-figure', summary.note && 'summary-note', 'summary-lines'].filter(Boolean).join(' ');
  return (
    <Dialog
      id="print-summary"
      className="dialog print-summary"
      labelledBy="summary-title"
      describedBy={describedBy || undefined}
      open={!!summary}
      returnTo={returnTo}
      // When nothing usable had the focus (Safari doesn't focus a clicked button): its button.
      fallback={() => document.getElementById(kind === 'print' ? 'print' : 'export')}
      initialFocus={focusDone}
      onClose={closeSummary}
    >
      {summary && (
        <Suspense fallback={null}>
          <SummaryContent />
        </Suspense>
      )}
    </Dialog>
  );
}
