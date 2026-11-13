import { memo } from 'react';
import { t } from '../../copy/index.ts';
import type { AppAsset } from '../../services/assets.ts';
import type { Piece as PieceData } from '../../state/document.ts';
import type { Unit } from '../../core/units.js';
import { pieceView } from './pieceView.ts';

export interface PieceProps {
  item: PieceData;
  asset: AppAsset;
  zoom: number;
  selected: boolean;
  /** Selected among several. */
  grouped: boolean;
  /** Its name says it is selected (with several, or a pinned selection). */
  marked: boolean;
  /** The unit of the lengths in its name (re-renders when it changes). */
  unit: Unit;
  /** In crop mode: the crop overlay draws it meanwhile. */
  cropping: boolean;
}

/** A piece on its sheet: a focusable button that clips the image to its crop. */
export const Piece = memo(function Piece({ item, asset, zoom, selected, grouped, marked, cropping }: PieceProps) {
  const view = pieceView(item, asset, zoom, marked);
  return (
    <div
      className={`piece${selected ? ' is-selected' : ''}${grouped ? ' is-grouped' : ''}${cropping ? ' is-cropping' : ''}`}
      data-id={item.id}
      tabIndex={0}
      role="button"
      aria-roledescription={t('piece.roleDescription')}
      aria-describedby="piece-hint"
      aria-label={view.label}
      style={view.box}
    >
      <img alt="" draggable={false} src={asset.url} style={view.img} />
    </div>
  );
});
