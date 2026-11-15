// Entering and leaving crop mode (the «Recortar» buttons, K, a double click,
// the context menu). The mode itself (crop/CropMode.tsx) loads on first use.

import { t } from '../../copy/index.ts';
import { getDocument } from '../../state/document.ts';
import { flushUi } from '../../state/flush.ts';
import { getView, setView } from '../../state/view.ts';
import { singleOnly } from '../../state/actions/notify.ts';
import { select } from '../../state/actions/selection.ts';
import { announce } from '../feedback/announcer.ts';
import { lazyContent, prefetch, whenLoaded } from '../lazy.ts';

export const CropContent = lazyContent(() => import('./crop/CropMode.tsx'));

export type CropEnd = 'apply' | 'cancel';

let finisher: ((how: CropEnd) => void) | null = null;

/** The mounted crop mode tells how to end it. */
export const onCropFinish = (fn: ((how: CropEnd) => void) | null) => {
  finisher = fn;
};

export const isCropping = () => getView().cropping !== null;

/** Ends crop mode, applying the crop or leaving the piece as it was. */
export function finishCrop(how: CropEnd) {
  finisher?.(how);
}

/**
 * Crop mode for a piece (by default the selected one; with several selected,
 * it explains it works with one). The piece ends up the only one selected.
 */
export function startCrop(id?: number) {
  const { busy, selection, items } = getDocument();
  if (busy) return;
  if (isCropping()) return finishCrop('apply');
  if (id === undefined) {
    if (selection.length > 1) return singleOnly();
    id = selection.at(-1);
  }
  if (id === undefined || !items.some((item) => item.id === id)) return announce(t('announce.needSelection'));
  const target = id;
  select(target);
  whenLoaded(CropContent, () => {
    if (getDocument().busy || !getDocument().items.some((item) => item.id === target)) return;
    setView({ cropping: target });
    flushUi();
  });
}

/** Loads crop mode ahead of time (when the app is idle). */
export const preloadCrop = () => prefetch(CropContent);
