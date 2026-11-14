// The cut lines of a sheet on screen: the same segments, contour paths and
// stroke the PDF gets (services/contours.sheetCuts and cutStyle), in the
// sheet's millimetres. Never thinner than a device pixel, like a PDF viewer
// draws a hairline.

import { memo, useEffect, useId, useSyncExternalStore } from 'react';
import { pathData } from '../../core/contour.js';
import { cutStyle } from '../../core/cutmarks.js';
import type { Cuts } from '../../core/types.ts';
import { sheetCuts, shapesVersion, showShapes, subscribeShapes } from '../../services/contours.ts';
import type { Piece } from '../../state/document.ts';
import { usePreview } from '../../state/preview.ts';

const MM_PER_PT = 25.4 / 72;
/** How wide the highlight under the lines is while their settings are hovered or focused (px). */
const EMPHASIS_PX = 7;

export const CutLayer = memo(function CutLayer({ items, cuts, W, H, zoom }: { items: readonly Piece[]; cuts: Readonly<Cuts>; W: number; H: number; zoom: number }) {
  const scope = useId();
  const contour = cuts.mode === 'contour';
  const emphasized = usePreview((s) => !!s.overlay?.cuts);
  // Drawn again when a shape is ready.
  useSyncExternalStore(subscribeShapes, shapesVersion);
  useEffect(() => {
    showShapes(scope, contour ? items : [], cuts.margin);
  }, [scope, contour, items, cuts.margin]);
  useEffect(() => () => void showShapes(scope, [], 0), [scope]);
  if (cuts.mode === 'none' || !items.length) return null;
  const { lines, paths } = sheetCuts(items, cuts, W, H);
  if (!lines.length && !paths.length) return null;
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
      {emphasized && (
        <g className="cut-emphasis" fill="none" strokeWidth={EMPHASIS_PX} strokeLinecap="round" vectorEffect="non-scaling-stroke">
          {lines.map((line, i) => (
            <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} vectorEffect="non-scaling-stroke" />
          ))}
          {paths.map((path, i) => (
            <path key={i} d={pathData([path])} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      )}
      <g fill="none" stroke={style.hex} strokeWidth={width} strokeDasharray={style.dash ? style.dash.map((v) => v * MM_PER_PT).join(' ') : undefined}>
        {lines.map((line, i) => (
          <line key={i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
        ))}
        {paths.map((path, i) => (
          <path key={i} d={pathData([path])} />
        ))}
      </g>
    </svg>
  );
});
