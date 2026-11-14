// The advice before printing or downloading: a dialog that shows how to print
// at real size (scale and paper) while the PDF is being made. Its button is
// the gesture that prints or downloads; closing it otherwise cancels. Its
// «No volver a mostrar» is this browser's preference (Preferencias turns it
// back on).

import { create } from 'zustand';
import { getPrefs, setPrinting } from '../../state/prefs.ts';
import { PrintTipContent } from './lazy.ts';

export type OutputKind = 'print' | 'download';

interface TipState {
  request: { kind: OutputKind; opener: Element | null; resolve: (go: boolean) => void } | null;
}

export const usePrintTip = create<TipState>()(() => ({ request: null }));

export const isTipOpen = () => !!usePrintTip.getState().request;
export const shouldShowTip = () => getPrefs().printing.tip;

/** Shows the advice; resolves true with its «Imprimir»/«Descargar» (in that click), false otherwise. */
export async function askTip(kind: OutputKind): Promise<boolean> {
  const opener = document.activeElement;
  await PrintTipContent.preload();
  return new Promise((resolve) => usePrintTip.setState({ request: { kind, opener, resolve } }));
}

/** Every way of closing it ends here: `go` prints or downloads. */
export function finishTip(go: boolean) {
  const request = usePrintTip.getState().request;
  if (!request) return;
  if ((document.getElementById('print-tip-never') as HTMLInputElement | null)?.checked) setPrinting({ tip: false });
  usePrintTip.setState({ request: null });
  request.resolve(go);
}
