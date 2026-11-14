// The summary after printing or downloading (see PrintSummary.tsx): what it
// shows, worked out once the person is back from the print dialog, and where
// the focus returns. It closes with «Listo», Esc or the backdrop, and with the
// next print or download.

import { create } from 'zustand';
import type { EquivalentKind } from '../../core/savings.js';
import type { OutputKind } from '../dialogs/printTip.ts';

export interface PrintSummary {
  kind: OutputKind;
  /** Where the PDF went, when that isn't the print dialog («Se descargó…»): the summary says it instead of the notice. */
  note?: string;
  /** The share (0–1) of the printable area the pieces use. */
  share: number;
  /** Sheets that printed, and against one per piece. */
  used: number;
  baseline: number;
  saved: number;
  /** The practical equivalent of what was saved (none when nothing was). */
  equivalent: { kind: EquivalentKind; value: number } | null;
  /** The sheets saved on this device so far, and the milestone reached now. */
  total: number;
  milestone: number | null;
  /** Arranging would take one sheet fewer (checked). */
  suggest: boolean;
  /** It asks for a donation (once per page load, see donate.ts). */
  ask: boolean;
  /** The PDF's key (see pdfContentKey) and the sheets it added to the total now (0 when it was counted before). */
  key: string;
  added: number;
}

interface SummaryState {
  summary: PrintSummary | null;
  /** Who started it: the focus goes back there (or to its button, see PrintSummary.tsx). */
  returnTo: Element | null;
  kind: OutputKind;
}

export const usePrintSummary = create<SummaryState>()(() => ({ summary: null, returnTo: null, kind: 'print' }));

export const showSummary = (summary: PrintSummary, returnTo: Element | null) => usePrintSummary.setState({ summary, returnTo, kind: summary.kind });

export const closeSummary = () => {
  if (usePrintSummary.getState().summary) usePrintSummary.setState({ summary: null });
};
