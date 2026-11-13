// Crop mode: the whole image dimmed with the visible area highlighted.
// Dragging the image (or the arrows) pans it under the frame; the wheel and
// + / − zoom; the frame's edges and corners resize it (keeping the proportion
// when the piece has a standard photo size). Enter, a click outside or the
// focus leaving applies it, in one undo step; Esc cancels.
//
// Like the other gestures, the live values never re-render React: the session
// lives here, the overlay is painted directly and the properties panel reads
// the drafts from gestureStore.

import { Check, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  FRAME_HANDLES,
  cropFrame,
  frameToSize,
  matchPhotoSize,
  panFrame,
  pieceFromFrame,
  resizeFrame,
  zoomFrame,
  type CropFrame,
  type FrameHandle,
} from '../../../core/crop.js';
import type { Size } from '../../../core/types.ts';
import { stepFor } from '../../../core/units.js';
import { t } from '../../../copy/index.ts';
import { sizeText } from '../../../services/measure.ts';
import type { AppAsset } from '../../../services/assets.ts';
import { getAsset } from '../../../state/assets.ts';
import { useDocument, type Piece } from '../../../state/document.ts';
import { flushUi } from '../../../state/flush.ts';
import { gestureStore } from '../../../state/gesture.ts';
import { getPrefs } from '../../../state/prefs.ts';
import { findItem, pieceName } from '../../../state/selectors.ts';
import { getView, setView, useView } from '../../../state/view.ts';
import { commitCrop, photoSizeName } from '../../../state/actions/crop.ts';
import { pieceNode } from '../../../state/actions/focus.ts';
import { announce } from '../../feedback/announcer.ts';
import { Button, IconButton } from '../../ui/Button.tsx';
import { onCropFinish, type CropEnd } from '../cropMode.ts';
import { placeBar } from '../selection.ts';
import { clientToSheet, measureBoxes, toLayer, viewZoom } from '../viewport.ts';

const ZOOM_STEP = 1.1;
const WHEEL_RATE = 0.0015;

interface Session {
  id: number;
  sheet: number;
  item: Piece;
  asset: AppAsset;
  frames: CropFrame;
  /** The standard size the frame keeps (in its orientation), or null. */
  lock: Size | null;
  lockName: string | null;
  resized: boolean;
}

interface Drag {
  kind: 'pan' | FrameHandle;
  pointerId: number;
  x: number;
  y: number;
  frames: CropFrame;
}

let session: Session | null = null;
let drag: Drag | null = null;
const els = {
  root: null as HTMLDivElement | null,
  ghost: null as HTMLImageElement | null,
  window: null as HTMLDivElement | null,
  image: null as HTMLImageElement | null,
  frame: null as HTMLDivElement | null,
  bar: null as HTMLDivElement | null,
};

function begin(id: number): Session | null {
  const item = findItem(id);
  if (!item) return null;
  const asset = getAsset(item.asset);
  const frames = cropFrame(item, asset);
  const { w, h } = frames.frame;
  const preset = matchPhotoSize(w, h);
  const long = preset ? Math.max(preset.w, preset.h) : 0;
  const short = preset ? Math.min(preset.w, preset.h) : 0;
  const lock = preset ? (w >= h ? { w: long, h: short } : { w: short, h: long }) : null;
  return { id, sheet: item.sheet, item, asset, frames, lock, lockName: preset ? photoSizeName(preset.id) : null, resized: false };
}

/** What the piece would be with the current frame (a locked size comes back to its exact size). */
function result(s: Session) {
  const frames = s.lock && s.resized ? frameToSize(s.frames, s.lock) : s.frames;
  return pieceFromFrame(s.asset, s.item.r, frames);
}

const draft = (s: Session): Piece => ({ ...s.item, ...pieceFromFrame(s.asset, s.item.r, s.frames) });

function paint() {
  const s = session;
  if (!s || !els.ghost || !els.window || !els.image || !els.frame) return;
  const frame = toLayer(s.sheet, s.frames.frame);
  const image = toLayer(s.sheet, s.frames.image);
  if (!frame || !image) return;
  // The image box unrotated, around the rotated image's center.
  const turned = s.item.r % 180 !== 0;
  const w = turned ? image.height : image.width;
  const h = turned ? image.width : image.height;
  const left = image.left + image.width / 2 - w / 2;
  const top = image.top + image.height / 2 - h / 2;
  const transform = s.item.r ? `rotate(${s.item.r}deg)` : '';
  Object.assign(els.ghost.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px`, transform });
  Object.assign(els.image.style, { left: `${left - frame.left}px`, top: `${top - frame.top}px`, width: `${w}px`, height: `${h}px`, transform });
  const box = { left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px` };
  Object.assign(els.window.style, box);
  Object.assign(els.frame.style, box);
  if (els.bar) placeBar(els.bar, { sheet: s.sheet, ...s.frames.frame, ids: new Set([s.id]) });
}

/** The live values for the properties panel. */
const publish = () => session && gestureStore.setState({ drafts: [draft(session)] });

function update(frames: CropFrame, { resized = false } = {}) {
  const s = session!;
  s.frames = frames;
  s.resized ||= resized;
  paint();
  publish();
}

// ---------- Announcements ----------

function sizeNow(s: Session) {
  const piece = { ...s.item, ...result(s) };
  const w = s.frames.frame.w;
  const h = s.frames.frame.h;
  return { piece, text: sizeText(s.lock && s.resized ? s.lock.w : w, s.lock && s.resized ? s.lock.h : h) };
}

function frameLabel(s: Session) {
  return t('crop.frameLabel', { name: pieceName(s.id), size: sizeNow(s).text });
}

function say(kind: 'moved' | 'zoomed' | 'resized', before: CropFrame) {
  const s = session!;
  const { frame, image } = s.frames;
  if (els.frame) els.frame.setAttribute('aria-label', frameLabel(s));
  const same = frame.x === before.frame.x && frame.y === before.frame.y && frame.w === before.frame.w && frame.h === before.frame.h;
  const still = same && image.x === before.image.x && image.y === before.image.y && image.w === before.image.w;
  if (still) return announce(t('crop.edge'), { key: 'crop', delay: 300 });
  let text: string;
  if (kind === 'resized') text = t('crop.resized', { size: sizeNow(s).text });
  else if (kind === 'zoomed') text = t('crop.zoomed', { pct: Math.round(((frame.w * frame.h) / (image.w * image.h)) * 100) });
  else text = t('crop.moved', { x: Math.round(((frame.x - image.x) / image.w) * 100), y: Math.round(((frame.y - image.y) / image.h) * 100) });
  announce(text, { key: 'crop', delay: 500 });
}

// ---------- Pointer ----------

function onPointerDown(e: PointerEvent) {
  const s = session;
  if (!s || drag || (e.button !== 0 && e.pointerType === 'mouse')) return;
  const target = e.target as Element;
  if (!target.closest('.crop-ghost, .crop-window, .crop-frame')) return;
  e.preventDefault();
  e.stopPropagation();
  const handle = target.closest<HTMLElement>('.crop-handle')?.dataset.handle as FrameHandle | undefined;
  drag = { kind: handle ?? 'pan', pointerId: e.pointerId, x: e.clientX, y: e.clientY, frames: s.frames };
  measureBoxes();
  els.frame?.focus({ preventScroll: true });
  try {
    els.root?.setPointerCapture(e.pointerId);
  } catch {
    // a synthetic or finished pointer: the drag goes on without capture
  }
  els.root?.classList.add(handle ? 'is-resizing' : 'is-panning');
}

function onPointerMove(e: PointerEvent) {
  const d = drag;
  if (!d || e.pointerId !== d.pointerId || !session) return;
  const zoom = viewZoom();
  const dx = (e.clientX - d.x) / zoom;
  const dy = (e.clientY - d.y) / zoom;
  if (d.kind === 'pan') update(panFrame(d.frames, dx, dy));
  else update(resizeFrame(d.frames, d.kind, dx, dy, { lock: !!session.lock }), { resized: true });
}

function onPointerUp(e: PointerEvent) {
  const d = drag;
  if (!d || e.pointerId !== d.pointerId) return;
  drag = null;
  els.root?.classList.remove('is-resizing', 'is-panning');
  if (session) say(d.kind === 'pan' ? 'moved' : 'resized', d.frames);
}

function onWheel(e: WheelEvent) {
  const s = session;
  // Ctrl/⌘ + wheel (and a trackpad pinch) zooms the canvas, not the image.
  if (!s || e.ctrlKey || e.metaKey || !(e.target as Element).closest('.crop-ghost, .crop-window, .crop-frame')) return;
  e.preventDefault();
  e.stopPropagation();
  measureBoxes();
  const focus = clientToSheet(s.sheet, e.clientX, e.clientY) ?? undefined;
  const before = s.frames;
  update(zoomFrame(s.frames, Math.exp(-e.deltaY * WHEEL_RATE), focus));
  say('zoomed', before);
}

// ---------- Keyboard ----------

const GROWS = new Set(['+', '=', '*']);
const SHRINKS = new Set(['-', '_', '−']);
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function zoomBy(factor: number) {
  const s = session;
  if (!s) return;
  const before = s.frames;
  update(zoomFrame(s.frames, factor));
  say('zoomed', before);
}

function onKeyDown(e: ReactKeyboardEvent) {
  const s = session;
  if (!s || e.ctrlKey || e.metaKey) return;
  const handled = () => {
    e.preventDefault();
    e.stopPropagation();
  };
  if (e.key === 'Enter') {
    handled();
    return end('apply');
  }
  if (e.key === 'Escape') {
    handled();
    return end('cancel');
  }
  if (GROWS.has(e.key) || SHRINKS.has(e.key)) {
    handled();
    return zoomBy(GROWS.has(e.key) ? ZOOM_STEP : 1 / ZOOM_STEP);
  }
  const arrow = ARROWS[e.key];
  if (!arrow) return;
  handled();
  const step = stepFor(getPrefs().unit, e.shiftKey ? 'coarse' : 'normal').mm;
  const [dx, dy] = arrow;
  const before = s.frames;
  if (e.altKey) {
    // Alt + arrows: the right and bottom edges (both at once with a standard size).
    const { w, h } = s.frames.frame;
    const grow = dx + dy;
    const frames = s.lock ? resizeFrame(s.frames, 'se', grow * step, ((grow * step) * h) / w, { lock: true }) : resizeFrame(s.frames, dx ? 'e' : 's', dx * step, dy * step);
    update(frames, { resized: true });
    return say('resized', before);
  }
  update(panFrame(s.frames, dx * step, dy * step));
  say('moved', before);
}

// ---------- Ending ----------

function end(how: CropEnd) {
  const s = session;
  if (!s) return;
  const active = document.activeElement;
  const hadFocus = !active || active === document.body || !!els.root?.contains(active) || !!els.bar?.contains(active);
  const piece = result(s);
  session = null;
  drag = null;
  gestureStore.setState({ drafts: null });
  setView({ cropping: null });
  if (how === 'apply') commitCrop(s.id, piece);
  else announce(t('crop.canceled'));
  if (hadFocus) {
    flushUi();
    pieceNode(s.id)?.focus({ preventScroll: true });
  }
}

/** A press outside the crop (and its bar) applies it; the press then does what it does. */
function onOutsidePointerDown(e: PointerEvent) {
  const target = e.target as Node;
  if (els.root?.contains(target) || els.bar?.contains(target)) return;
  if ((target as Element).closest?.('[data-crop-toggle]')) return; // the «Recortar» buttons end it themselves
  end('apply');
}

function onFocusOut(e: FocusEvent) {
  const to = e.relatedTarget as Node | null;
  if (!to || els.root?.contains(to) || els.bar?.contains(to)) return;
  if ((to as Element).closest?.('[data-crop-toggle]')) return;
  end('apply');
}

export default function CropMode() {
  const id = useView((s) => s.cropping);
  const zoom = useView((s) => s.zoom);
  const root = useRef<HTMLDivElement>(null);
  const help = useRef<HTMLParagraphElement>(null);

  // The session: starts with the mode and ends with it.
  useLayoutEffect(() => {
    if (id === null) return;
    measureBoxes();
    session = begin(id);
    if (!session) {
      setView({ cropping: null });
      return;
    }
    const s = session;
    onCropFinish(end);
    document.getElementById('canvas')?.classList.add('is-cropping');
    const node = root.current!;
    paint();
    publish();
    if (els.frame) els.frame.setAttribute('aria-label', frameLabel(s));
    if (help.current) help.current.textContent = t('crop.help', { locked: s.lockName ? t('crop.helpLocked', { name: s.lockName }) : '' });
    els.frame?.focus({ preventScroll: true });
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);
    node.addEventListener('pointercancel', onPointerUp);
    node.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('pointerdown', onOutsidePointerDown, true);
    node.addEventListener('focusout', onFocusOut);
    els.bar?.addEventListener('focusout', onFocusOut);
    // Something else changing the document (another tab, undo…) cancels it.
    const unsubscribe = useDocument.subscribe((state, previous) => {
      if (session && (state.items !== previous.items || state.sheets !== previous.sheets)) end('cancel');
    });
    // The layout moving (window size, panels) or the canvas scrolling: painted again.
    let frame = 0;
    const repaint = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measureBoxes();
        paint();
      });
    };
    const observer = new ResizeObserver(repaint);
    observer.observe(document.getElementById('sheets')!);
    const stage = document.getElementById('stage');
    stage?.addEventListener('scroll', repaint, { passive: true });
    const bar = els.bar;
    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
      node.removeEventListener('pointercancel', onPointerUp);
      node.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerdown', onOutsidePointerDown, true);
      node.removeEventListener('focusout', onFocusOut);
      bar?.removeEventListener('focusout', onFocusOut);
      unsubscribe();
      observer.disconnect();
      stage?.removeEventListener('scroll', repaint);
      cancelAnimationFrame(frame);
      document.getElementById('canvas')?.classList.remove('is-cropping');
      onCropFinish(null);
      if (session?.id === id) {
        session = null;
        gestureStore.setState({ drafts: null });
      }
    };
  }, [id]);

  // The canvas zoom changed: same frame, new pixels.
  useEffect(() => {
    measureBoxes();
    paint();
  }, [zoom]);

  if (id === null) return null;
  const item = findItem(id);
  if (!item) return null;
  const asset = getAsset(item.asset);
  const canvas = document.getElementById('canvas');
  return (
    <>
      <div
        ref={(el) => {
          root.current = el;
          els.root = el;
        }}
        className="crop"
        onDoubleClick={() => end('apply')}
      >
        <img
          ref={(el) => {
            els.ghost = el;
          }}
          className="crop-ghost"
          alt=""
          draggable={false}
          src={asset.url}
        />
        <div
          ref={(el) => {
            els.window = el;
          }}
          className="crop-window"
        >
          <img
            ref={(el) => {
              els.image = el;
            }}
            alt=""
            draggable={false}
            src={asset.url}
          />
        </div>
        <div
          ref={(el) => {
            els.frame = el;
          }}
          id="crop-frame"
          className="crop-frame"
          tabIndex={0}
          role="application"
          aria-roledescription={t('crop.frameRole')}
          aria-describedby="crop-help"
          onKeyDown={onKeyDown}
        >
          <span className="crop-thirds" aria-hidden="true" />
          {FRAME_HANDLES.map((handle) => (
            <span key={handle} className="crop-handle" data-handle={handle} aria-hidden="true" />
          ))}
        </div>
        <p ref={help} id="crop-help" className="sr-only" />
      </div>
      {canvas &&
        createPortal(
          <div
            ref={(el) => {
              els.bar = el;
            }}
            id="cropbar"
            className="piecebar cropbar"
            role="group"
            aria-label={t('crop.bar')}
          >
            <IconButton icon={ZoomOut} label={t('crop.zoomOut')} tip={t('crop.zoomOut')} shortcut="cropZoomOut" onClick={() => zoomBy(1 / ZOOM_STEP)} />
            <IconButton icon={ZoomIn} label={t('crop.zoomIn')} tip={t('crop.zoomIn')} shortcut="cropZoomIn" onClick={() => zoomBy(ZOOM_STEP)} />
            <span className="piecebar-sep" aria-hidden="true" />
            <Button id="crop-cancel" className="chip-btn icon-chip" icon={X} tip={t('crop.cancelTip')} shortcut="cropCancel" onClick={() => end('cancel')}>
              <span>{t('crop.cancel')}</span>
            </Button>
            <Button id="crop-apply" className="btn primary small" icon={Check} tip={t('crop.applyTip')} shortcut="cropApply" onClick={() => end('apply')}>
              <span>{t('crop.apply')}</span>
            </Button>
          </div>,
          canvas
        )}
    </>
  );
}

/** For tests: the live session's frame. */
export const cropSession = () => (session ? { frames: session.frames, lock: session.lock } : null);

// Leaving crop mode from elsewhere (a dialog opening…) while still mounted.
export const _cropping = () => getView().cropping;
