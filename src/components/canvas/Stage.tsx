// The sheets on screen, one below the other (like pages): size (zoom), pieces,
// selection frames, current sheet and the pointer gestures.

import { FilePlus, Trash2, Upload } from 'lucide-react';
import { memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FocusEvent } from 'react';
import { t } from '../../copy/index.ts';
import type { Cuts } from '../../core/types.ts';
import type { Unit } from '../../core/units.js';
import { LEFT_DRAWER_QUERY, NARROW_QUERY } from '../../config.ts';
import { useCanvasGestures } from '../../hooks/useCanvasGestures.ts';
import { usePreviewTriggers } from '../../hooks/usePreviewTriggers.ts';
import { useMediaQuery } from '../../hooks/useMediaQuery.ts';
import { useShortcut } from '../../hooks/shortcuts.ts';
import { paperTitle, sizeText } from '../../services/measure.ts';
import { getAsset } from '../../state/assets.ts';
import { useDocument, type Piece as PieceData } from '../../state/document.ts';
import { gestureStore, isDragging } from '../../state/gesture.ts';
import { usePrefs, type GridPrefs } from '../../state/prefs.ts';
import { usePreview } from '../../state/preview.ts';
import { currentSheet, sheetIndex, sheetSize } from '../../state/selectors.ts';
import { getView, setView, useView } from '../../state/view.ts';
import { openFiles } from '../../state/actions/files.ts';
import { focusPiece } from '../../state/actions/selection.ts';
import { addSheet, removeSheet, showPaperSettings } from '../../state/actions/sheets.ts';
import { Icon } from '../ui/Icon.tsx';
import { CropContent } from './cropMode.ts';
import { CutLayer } from './CutLayer.tsx';
import { Piece } from './Piece.tsx';
import { PreviewLayer } from './PreviewLayer.tsx';
import { fitZoom, sheetsAreWide, syncStageBars } from './viewport.ts';
import { SelectionOverlay } from './SelectionOverlay.tsx';

/**
 * Fine lines every `size` mm and stronger ones every 5 or 10 cells, drawn with
 * gradients scaled to the zoom. Fine lines closer than ~6 px are left out.
 */
function gridStyle({ size }: GridPrefs, zoom: number) {
  const MIN_PX = 6;
  let minor = size * zoom;
  let major = minor * (size >= 5 ? 5 : 10);
  while (major < MIN_PX) major *= 2;
  if (minor < MIN_PX) minor = major;
  const line = (dir: string, color: string) => `linear-gradient(${dir}, ${color} 1px, transparent 1px)`;
  return {
    backgroundImage: [line('to right', 'var(--grid-major)'), line('to bottom', 'var(--grid-major)'), line('to right', 'var(--grid-minor)'), line('to bottom', 'var(--grid-minor)')].join(', '),
    backgroundSize: [major, major, minor, minor].map((v) => `${v}px ${v}px`).join(', '),
  };
}

interface PageProps {
  id: number;
  index: number;
  total: number;
  items: readonly PieceData[];
  W: number;
  H: number;
  zoom: number;
  margin: number;
  empty: boolean;
  current: boolean;
  showGrid: boolean;
  grid: { backgroundImage: string; backgroundSize: string };
  selection: readonly number[];
  pinned: boolean;
  unit: Unit;
  busy: boolean;
  cropping: number | null;
  cuts: Readonly<Cuts>;
}

const EmptyDropzone = memo(function EmptyDropzone({ hidden, disabled }: { hidden: boolean; disabled: boolean }) {
  const singleKeys = usePrefs((s) => s.singleKeys);
  const shortcut = useShortcut('drop');
  return (
    <button type="button" id="empty" className="dropzone" hidden={hidden} disabled={disabled} onClick={openFiles} aria-keyshortcuts={shortcut['aria-keyshortcuts']} data-single="">
      <span className="dropzone-icon">
        <Icon icon={Upload} />
      </span>
      <span id="empty-text" className="dropzone-title">
        {t(singleKeys ? 'sheet.drop' : 'sheet.dropNoKeys')}
      </span>
      <span id="empty-sub" className="dropzone-sub">
        {t('sheet.private')}
      </span>
    </button>
  );
});

const Page = memo(function Page({ id, index, total, items, W, H, zoom, margin, empty, current, showGrid, grid, selection, pinned, unit, busy, cropping, cuts }: PageProps) {
  const label = t('sheet.numbered', { i: index + 1, total });
  const n = items.length;
  const many = selection.length > 1;
  return (
    <div className={current ? 'page is-current' : 'page'} data-sheet={id} style={{ width: `${W * zoom}px` }}>
      <div className="page-head">
        <button
          type="button"
          className="page-label"
          aria-label={t('sheet.changePaperLabel', { label })}
          data-tip={t('sheet.changePaper')}
          aria-describedby="change-paper-hint"
          onClick={() => showPaperSettings(id)}
        >
          {label}
        </button>
        <button
          type="button"
          className="icon-btn small page-remove"
          data-tip={t('sheet.remove')}
          aria-label={t('sheet.removeLabel', { i: index + 1 })}
          hidden={total < 2}
          onClick={(e) => removeSheet(id, { viaKeyboard: e.detail === 0 })}
        >
          <Icon icon={Trash2} />
        </button>
      </div>
      <div className="sheet-box" style={{ width: `${W * zoom}px`, height: `${H * zoom}px` }}>
        <div className="sheet" role="group" tabIndex={-1} aria-label={n ? t('sheet.groupLabel', { label, n }) : t('sheet.groupEmpty', { label })}>
          <div className="grid-layer" aria-hidden="true" hidden={!showGrid} style={showGrid ? grid : undefined} />
          <div className="safe" aria-hidden="true" hidden={margin <= 0 || empty} style={{ inset: `${margin * zoom}px` }} />
          {index === 0 && <EmptyDropzone hidden={!empty} disabled={busy} />}
          <p className="sheet-empty" aria-hidden="true" hidden={n > 0 || (empty && index === 0)}>
            {t('sheet.emptyHint')}
          </p>
          {items.map((item) => {
            const selected = selection.includes(item.id);
            return (
              <Piece
                key={item.id}
                item={item}
                asset={getAsset(item.asset)}
                zoom={zoom}
                selected={selected}
                grouped={selected && many}
                marked={selected && (many || pinned)}
                unit={unit}
                cropping={item.id === cropping}
              />
            );
          })}
          <CutLayer items={items} cuts={cuts} W={W} H={H} zoom={zoom} />
        </div>
        <PreviewLayer sheet={id} zoom={zoom} />
      </div>
    </div>
  );
});

const NO_ITEMS: readonly PieceData[] = [];

export function Stage() {
  const stage = useRef<HTMLDivElement>(null);
  const sheets = useDocument((s) => s.sheets);
  const items = useDocument((s) => s.items);
  const selection = useDocument((s) => s.selection);
  const busy = useDocument((s) => s.busy);
  const paper = useDocument((s) => s.paper);
  const landscape = useDocument((s) => s.landscape);
  const margin = useDocument((s) => s.margin);
  const cuts = useDocument((s) => s.cuts);
  const zoom = useView((s) => s.zoom);
  const animating = useView((s) => s.animating);
  const pinned = useView((s) => s.pinned);
  const viewSheet = useView((s) => s.sheet);
  const cropping = useView((s) => s.cropping);
  // On medium screens the list opens over the canvas: the sheets move beside it
  // (refitted), so what the list selects can always be seen.
  const listOpen = useView((s) => s.drawer === 'pieces');
  const medium = useMediaQuery(LEFT_DRAWER_QUERY);
  const narrow = useMediaQuery(NARROW_QUERY);
  const besideList = listOpen && medium && !narrow;
  const grid = usePrefs((s) => s.grid);
  const unit = usePrefs((s) => s.unit);
  // The grid also shows while its size is hovered, and while dragging with «Imán»: what the pieces snap to.
  const gridShown = usePreview((s) => !!s.overlay?.grid);
  const moving = useSyncExternalStore(gestureStore.subscribe, () => gestureStore.getState().moving);
  const [layout, setLayout] = useState(0);

  const [W, H] = sheetSize({ paper, landscape, margin });
  const empty = items.length === 0;
  const current = currentSheet({ items, selection, sheets }, viewSheet);
  const bySheet = useMemo(() => {
    const map = new Map<number, PieceData[]>(sheets.map((sheet) => [sheet.id, []]));
    for (const item of items) map.get(item.sheet)?.push(item);
    return map;
  }, [items, sheets]);
  const gridCss = useMemo(() => gridStyle(grid, zoom), [grid, zoom]);
  // Zoomed in past the stage's width: it scrolls sideways too.
  const wide = layout >= 0 && stage.current !== null && sheetsAreWide(zoom);

  // A fitted zoom follows the paper and the stage's size (not while dragging);
  // one the person chose stays as it is.
  const updateZoom = useCallback(() => {
    if (!stage.current) return;
    const { zoomMode } = getView();
    if (zoomMode !== 'manual') {
      const next = fitZoom(zoomMode);
      if (next !== getView().zoom) setView({ zoom: next });
    }
    setLayout((n) => n + 1);
  }, []);
  useLayoutEffect(updateZoom, [W, H, besideList, updateZoom]);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (!isDragging()) updateZoom();
    });
    observer.observe(stage.current!);
    return () => observer.disconnect();
  }, [updateZoom]);

  useCanvasGestures(stage);
  usePreviewTriggers();
  // The scrollbars come and go with the zoom and the window: what floats over the stage avoids them.
  useLayoutEffect(syncStageBars);

  // Focusing a piece selects it (unless the selection is pinned); focusing
  // something on a sheet makes it the current one.
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    const node = target.closest<HTMLElement>('.piece');
    if (node) return focusPiece(Number(node.dataset.id));
    const page = target.closest<HTMLElement>('.page');
    if (page) {
      const id = Number(page.dataset.sheet);
      if (getView().sheet !== id && sheetIndex(id) >= 0) setView({ sheet: id });
    }
  };

  return (
    <div id="stage" className={`stage${besideList ? ' beside-list' : ''}${wide ? ' is-wide' : ''}`} ref={stage}>
      <div id="sheets" className={animating ? 'sheets is-animating' : 'sheets'} data-many={sheets.length > 1 ? '' : undefined} onFocus={onFocus}>
        {sheets.map((sheet, i) => (
          <Page
            key={sheet.id}
            id={sheet.id}
            index={i}
            total={sheets.length}
            items={bySheet.get(sheet.id) ?? NO_ITEMS}
            W={W}
            H={H}
            zoom={zoom}
            margin={margin}
            empty={empty}
            current={sheet.id === current}
            showGrid={grid.show || gridShown || (moving && grid.snap)}
            grid={gridCss}
            selection={selection}
            pinned={pinned}
            unit={unit}
            busy={busy}
            cropping={cropping}
            cuts={cuts}
          />
        ))}
        <div id="drag-layer" className="drag-layer" />
        <SelectionOverlay layout={layout} />
        {cropping !== null && (
          <Suspense fallback={null}>
            <CropContent />
          </Suspense>
        )}
        <div className="sheets-foot">
          <p id="paper-label" className="paper-label">
            {t('sheet.paperLabel', { paper: paperTitle(), size: sizeText(W, H) })}
          </p>
          <button type="button" id="add-sheet" className="add-sheet" disabled={busy} onClick={() => addSheet()}>
            <Icon icon={FilePlus} />
            <span>{t('sheet.add')}</span>
          </button>
        </div>
        <div className="marquee" hidden aria-hidden="true" />
        <div id="new-sheet-end" className="new-sheet-drop" hidden aria-hidden="true">
          <span>{t('sheet.dropNew')}</span>
        </div>
        <div id="new-sheet-gap" className="new-sheet-gap" hidden aria-hidden="true">
          <span>{t('sheet.dropNew')}</span>
        </div>
        <p id="change-paper-hint" className="sr-only">
          {t('sheet.changePaperHint')}
        </p>
      </div>
    </div>
  );
}
