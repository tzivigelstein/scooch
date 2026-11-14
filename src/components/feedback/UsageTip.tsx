// A usage tip, in the notice area (state/tips.ts decides which and when): the
// faster way to do what was just done the slow way several times. It waits
// while a notice, a load, a drag, crop mode, a dialog or a menu has the place
// or the attention, and gives way to any of them for good; it never takes the
// focus. It goes away on its own after a while (not while hovered or
// focused), with its close button or Esc, and for good with «No volver a
// mostrar».

import { Lightbulb, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';
import { t } from '../../copy/index.ts';
import { useDocument } from '../../state/document.ts';
import { gestureStore } from '../../state/gesture.ts';
import { closeTip, neverShow, tipShown, useTips } from '../../state/tips.ts';
import { useView } from '../../state/view.ts';
import { focusSheet } from '../../state/actions/focus.ts';
import { useContextMenu } from '../canvas/contextMenu.ts';
import { useZoomMenu } from '../canvas/zoomMenu.ts';
import { useDialogs } from '../dialogs/dialogs.ts';
import { usePrintTip } from '../dialogs/printTip.ts';
import { Icon } from '../ui/Icon.tsx';
import { useCurrentNotice } from './NoticePill.tsx';
import { usePrintSummary } from './printSummary.ts';

/** How long it stays, unless hovered or focused (ms). */
export const TIP_MS = 15_000;
/** After the pointer or the focus leaves it, at least this long still (ms). */
const AFTER_LEAVING_MS = 4000;

/** Something else has the place or the attention. */
function useBlocked() {
  const notice = useCurrentNotice() !== null;
  const busy = useDocument((s) => s.busy);
  const cropping = useView((s) => s.cropping !== null);
  const dragging = useStore(gestureStore, (s) => s.dragging);
  const dialog = useDialogs((s) => Object.keys(s.open).length > 0);
  const printTip = usePrintTip((s) => s.request !== null);
  const summary = usePrintSummary((s) => s.summary !== null);
  const contextMenu = useContextMenu((s) => s.request !== null);
  const zoomMenu = useZoomMenu((s) => s.at !== null);
  return notice || busy || cropping || dragging || dialog || printTip || summary || contextMenu || zoomMenu;
}

export function UsageTip() {
  const tip = useTips((s) => s.tip);
  const blocked = useBlocked();
  const visible = !!tip && !blocked;
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef({ id: 0 as ReturnType<typeof setTimeout> | 0, remaining: TIP_MS, startedAt: 0, held: false });

  // Shown once the place is free; something else taking it closes it.
  useLayoutEffect(() => {
    if (tip && visible && !tip.shown) tipShown();
    else if (tip?.shown && !visible) closeTip();
  });

  const stop = () => {
    clearTimeout(timer.current.id);
    timer.current.id = 0;
  };
  const run = () => {
    const tm = timer.current;
    if (tm.id || tm.held) return;
    tm.startedAt = Date.now();
    tm.id = setTimeout(() => {
      tm.id = 0;
      close();
    }, tm.remaining);
  };
  const hold = () => {
    const tm = timer.current;
    tm.held = true;
    if (!tm.id) return;
    stop();
    tm.remaining -= Date.now() - tm.startedAt;
  };
  const release = () => {
    const tm = timer.current;
    // The focus can leave silently (a button that hides): it is checked again here.
    if (box.current?.matches(':hover') || box.current?.contains(document.activeElement)) return;
    tm.held = false;
    tm.remaining = Math.max(AFTER_LEAVING_MS, tm.remaining);
    run();
  };

  const shownId = tip?.shown ? tip.id : null;
  useEffect(() => {
    if (!shownId) return;
    timer.current = { id: 0, remaining: TIP_MS, startedAt: 0, held: false };
    run();
    return stop;
  }, [shownId]);

  /** Closes it; with the focus inside, the focus goes back to the sheet first. */
  function close(after?: () => void) {
    if (box.current?.contains(document.activeElement)) focusSheet();
    closeTip();
    after?.();
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };

  return (
    <div
      ref={box}
      id="usage-tip"
      className="usage-tip"
      role="group"
      aria-label={t('tips.label')}
      hidden={!visible}
      onPointerEnter={hold}
      onPointerLeave={release}
      onFocus={hold}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) release();
      }}
      onKeyDown={onKeyDown}
    >
      <span className="usage-tip-icon">
        <Icon icon={Lightbulb} />
      </span>
      <p id="usage-tip-text" className="usage-tip-text">
        {tip?.text}
      </p>
      <div className="usage-tip-actions">
        {tip?.action && (
          <button type="button" id="usage-tip-action" className="usage-tip-btn strong" onClick={() => close(tip.action!.run)}>
            {tip.action.label}
          </button>
        )}
        <button type="button" id="usage-tip-never" className="usage-tip-btn" onClick={() => tip && close(() => neverShow(tip.topic))}>
          {t('tips.never')}
        </button>
      </div>
      <button type="button" id="usage-tip-close" className="usage-tip-close" aria-label={t('tips.close')} data-tip={t('tips.close')} onClick={() => close()}>
        <Icon icon={X} />
      </button>
    </div>
  );
}
