// The zoom control in a corner of the canvas: out, the level (a menu with
// the fits and a few levels) and in. The level is a screen measure: 100 % is
// not the printed size.

import { ZoomIn, ZoomOut } from 'lucide-react';
import { Suspense } from 'react';
import { canStep } from '../../core/zoom.js';
import { t } from '../../copy/index.ts';
import { control } from '../../state/tips.ts';
import { useView } from '../../state/view.ts';
import { whenLoaded } from '../lazy.ts';
import { IconButton } from '../ui/Button.tsx';
import { stepZoom, zoomPercent } from './viewport.ts';
import { useZoomMenu, ZoomMenuContent } from './zoomMenu.ts';

export function ZoomControl() {
  const zoom = useView((s) => s.zoom);
  const open = useZoomMenu((s) => s.at !== null);
  const pct = zoomPercent(zoom);
  const shown = Math.round(pct);
  return (
    <div className="zoom-control" role="group" aria-label={t('zoom.control')}>
      <IconButton id="zoom-out" icon={ZoomOut} label={t('zoom.zoomOut')} tip={t('zoom.zoomOut')} shortcut="zoomOut" aria-disabled={!canStep(pct, -1) || undefined} onClick={control('zoomOut', () => stepZoom(-1))} />
      <button
        type="button"
        id="zoom-level"
        className="zoom-level"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'zoom-menu' : undefined}
        aria-label={t('zoom.levelLabel', { pct: shown })}
        data-tip={t('zoom.levelTip')}
        onClick={(e) => {
          if (open) return useZoomMenu.setState({ at: null });
          // Lined up with the control's right edge: above it at the bottom of the canvas, below it at the top (narrow screens).
          const r = e.currentTarget.closest('.zoom-control')!.getBoundingClientRect();
          const above = r.top > window.innerHeight / 2;
          const at = { x: Math.round(r.right), y: Math.round(above ? r.top - 4 : r.bottom + 4), end: true, above };
          whenLoaded(ZoomMenuContent, () => useZoomMenu.setState({ at }));
        }}
      >
        {t('zoom.level', { pct: shown })}
      </button>
      <IconButton id="zoom-in" icon={ZoomIn} label={t('zoom.zoomIn')} tip={t('zoom.zoomIn')} shortcut="zoomIn" aria-disabled={!canStep(pct, 1) || undefined} onClick={control('zoomIn', () => stepZoom(1))} />
      {open && (
        <Suspense fallback={null}>
          <ZoomMenuContent />
        </Suspense>
      )}
    </div>
  );
}
