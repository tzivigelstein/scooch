// What a hovered or focused control shows on a sheet (state/preview.ts): the
// margin band, the gaps, a measure, pieces pointed out, what aligning goes
// against and the ghosts of what an action would leave. Over the pieces and
// beside the sheet (it isn't clipped), decorative only: no pointer events, no
// focus, hidden from screen readers (the control's name already says what it
// does). It never animates.

import { memo, type CSSProperties } from 'react';
import { t } from '../../copy/index.ts';
import type { Rect } from '../../core/types.ts';
import { getAsset } from '../../state/assets.ts';
import { useTextsLanguage } from '../../state/language.ts';
import { usePreview, type Dimension, type Ghost, type Line } from '../../state/preview.ts';
import { pieceView } from './pieceView.ts';
import './PreviewLayer.css';

/** How far outside the piece the width and height lines go, below and to the right (px). */
const DIMENSION_OFFSET = 14;
/** The thinnest a gap is drawn (px): two pieces that touch still show where. */
const MIN_GAP = 2;

const px = (mm: number, zoom: number) => mm * zoom;

function boxStyle(r: Rect, zoom: number): CSSProperties {
  return { left: px(r.x, zoom), top: px(r.y, zoom), width: px(r.w, zoom), height: px(r.h, zoom) };
}

function gapStyle(r: Rect, zoom: number): CSSProperties {
  const style = boxStyle(r, zoom) as { left: number; top: number; width: number; height: number };
  if (style.width < MIN_GAP) Object.assign(style, { left: style.left - (MIN_GAP - style.width) / 2, width: MIN_GAP });
  if (style.height < MIN_GAP) Object.assign(style, { top: style.top - (MIN_GAP - style.height) / 2, height: MIN_GAP });
  return style;
}

function lineStyle({ x1, y1, x2, y2 }: Line, zoom: number): CSSProperties {
  return { left: px(Math.min(x1, x2), zoom), top: px(Math.min(y1, y2), zoom), width: px(Math.abs(x2 - x1), zoom), height: px(Math.abs(y2 - y1), zoom) };
}

function GhostPiece({ ghost, zoom }: { ghost: Ghost; zoom: number }) {
  const view = pieceView(ghost.item, getAsset(ghost.item.asset), zoom, false);
  return (
    <div className={ghost.blocked ? 'preview-ghost is-blocked' : 'preview-ghost'} style={view.box}>
      <img alt="" draggable={false} src={getAsset(ghost.item.asset).url} style={view.img} />
    </div>
  );
}

/** X and Y from the sheet's edge to the box; the width under it, the height beside it on the right. */
function DimensionLine({ dimension: { field, box, text }, zoom }: { dimension: Dimension; zoom: number }) {
  const across = field === 'x' || field === 'y';
  const horizontal = field === 'x' || field === 'width';
  const [from, to] = field === 'x' ? [0, box.x] : field === 'y' ? [0, box.y] : field === 'width' ? [box.x, box.x + box.w] : [box.y, box.y + box.h];
  const start = px(Math.min(from, to), zoom);
  const length = px(Math.abs(to - from), zoom);
  const at = across ? px(horizontal ? box.y + box.h / 2 : box.x + box.w / 2, zoom) : px(horizontal ? box.y + box.h : box.x + box.w, zoom) + DIMENSION_OFFSET;
  const style = horizontal ? { left: start, top: at, width: length } : { top: start, left: at, height: length };
  return (
    <div className={`preview-dimension ${horizontal ? 'is-horizontal' : 'is-vertical'}`} data-field={field} style={style}>
      <span className="preview-value">{text}</span>
    </div>
  );
}

export const PreviewLayer = memo(function PreviewLayer({ sheet, zoom }: { sheet: number; zoom: number }) {
  useTextsLanguage();
  const overlay = usePreview((s) => s.overlay);
  const part = overlay?.sheets.get(sheet);
  if (!overlay || (!part && !overlay.margin)) return null;
  const tone = overlay.tone === 'problem' ? 'is-problem' : 'is-locate';
  return (
    <div className="preview" aria-hidden="true" data-preview-layer="">
      {!!overlay.margin && <div className="preview-margin" style={{ borderWidth: px(overlay.margin, zoom) }} />}
      {part?.gaps?.map((r, i) => <div key={`g${i}`} className="preview-gap" style={gapStyle(r, zoom)} />)}
      {part?.dimmed?.map((r, i) => <div key={`d${i}`} className="preview-dimmed" style={boxStyle(r, zoom)} />)}
      {part?.reference && (
        <>
          <div className="preview-reference" style={boxStyle(part.reference.box, zoom)} />
          <div className="preview-line" style={lineStyle(part.reference.line, zoom)} />
        </>
      )}
      {part?.ghosts?.map((ghost) => <GhostPiece key={ghost.item.id} ghost={ghost} zoom={zoom} />)}
      {part?.outlines?.map((r, i) => <div key={`o${i}`} className={`preview-outline ${tone}`} style={boxStyle(r, zoom)} />)}
      {part?.dimension && <DimensionLine dimension={part.dimension} zoom={zoom} />}
      {!!part?.more && <span className="preview-more">{t('sheet.moreCopies', { n: part.more })}</span>}
    </div>
  );
});
