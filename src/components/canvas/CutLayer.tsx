// The cut lines of a sheet on screen: the same segments and stroke the PDF
// gets (cutmarks.cutLines and cutStyle), in the sheet's millimetres. Never
// thinner than a device pixel, like a PDF viewer draws a hairline.

import { memo } from 'react';
import { cutLines, cutStyle } from '../../core/cutmarks.js';
import type { Cuts } from '../../core/types.ts';
import type { Piece } from '../../state/document.ts';
import { imageBoxOf } from '../../state/selectors.ts';

const MM_PER_PT = 25.4 / 72;

export const CutLayer = memo(function CutLayer({ items, cuts, W, H, zoom }: { items: readonly Piece[]; cuts: Readonly<Cuts>; W: number; H: number; zoom: number }) {
  if (cuts.mode === 'none' || !items.length) return null;
  const lines = cutLines(items.map(imageBoxOf), { ...cuts, bounds: { x: 0, y: 0, w: W, h: H } });
  if (!lines.length) return null;
  const style = cutStyle(cuts);
  const width = Math.max(style.width * MM_PER_PT, 1 / ((window.devicePixelRatio || 1) * zoom));
  return (
    <svg
      className="cut-layer"
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      data-width={style.width}
      data-color={style.hex}
      data-dash={style.dash ? style.dash.join(' ') : ''}
    >
      <g fill="none" stroke={style.hex} strokeWidth={width} strokeDasharray={style.dash ? style.dash.map((v) => v * MM_PER_PT).join(' ') : undefined}>
        {lines.map((line, i) => (
          <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
        ))}
      </g>
    </svg>
  );
});
