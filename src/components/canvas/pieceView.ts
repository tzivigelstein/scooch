// How a piece is drawn on screen: the clipping container at its position and
// the whole image inside it (crop.cssParams), with its accessible name. React
// renders it from the document; a drag paints the same thing directly.

import { cssParams } from '../../core/crop.js';
import { t } from '../../copy/index.ts';
import { lengthText, sizeText } from '../../services/measure.ts';
import type { AppAsset } from '../../services/assets.ts';
import type { Piece } from '../../state/document.ts';
import { dims } from '../../state/selectors.ts';

/** Accessible name: file, size, position and rotation. */
export function pieceLabel(item: Piece, asset: AppAsset) {
  const [w, h] = dims(item);
  const page = asset.kind === 'pdf' && asset.pages > 1 ? t('piece.a11yPage', { page: asset.page }) : '';
  const turned = item.r ? t('piece.a11yTurned', { deg: item.r }) : '';
  return t('piece.a11y', { name: asset.name, page, size: sizeText(w, h), x: lengthText(item.x), y: lengthText(item.y), turned });
}

export interface PieceView {
  box: { left: string; top: string; width: string; height: string };
  img: { width: string; height: string; transform: string };
  label: string;
}

/**
 * The piece's styles and name. `offset`: {left, top} of a sheet when it
 * travels in the drag layer (in #sheets coordinates). `marked`: the name says
 * it is selected (with several selected, or a pinned selection).
 */
export function pieceView(item: Piece, asset: AppAsset, zoom: number, marked: boolean, offset: { left: number; top: number } | null = null): PieceView {
  const p = cssParams(item, asset, zoom);
  return {
    box: { left: `${(offset?.left ?? 0) + p.left}px`, top: `${(offset?.top ?? 0) + p.top}px`, width: `${p.width}px`, height: `${p.height}px` },
    img: { width: `${p.img.width}px`, height: `${p.img.height}px`, transform: p.img.transform },
    label: pieceLabel(item, asset) + (marked ? t('piece.a11ySelected') : ''),
  };
}

/** Paints a piece directly (during a drag, or to put back what React last rendered). */
export function paintPiece(node: HTMLElement, view: PieceView) {
  Object.assign(node.style, view.box);
  if (node.getAttribute('aria-label') !== view.label) node.setAttribute('aria-label', view.label);
  const img = node.firstElementChild as HTMLImageElement | null;
  if (img) Object.assign(img.style, view.img);
}
