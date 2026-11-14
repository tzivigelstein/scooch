// The list of pieces: a multi-select listbox with a roving tab stop (one Tab
// stop, arrows to move). Arrows select the focused piece; with Shift they
// extend the selection from the last one picked (like Shift+click); with
// Ctrl/Cmd they only move the focus, and Ctrl+Space (or Shift+Space, or
// Shift+Enter as on the sheet) adds or removes the focused one (like
// Ctrl/Cmd+click). With several sheets, pieces are grouped by sheet
// (role="group" with its heading and count); the arrows go from one group to
// the next. The list's selection and the sheet's are the same.

import { Layers, SquareArrowOutDownRight, SquareDashed, TriangleAlert, type LucideIcon } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { rangeBetween } from '../../core/group.js';
import { t } from '../../copy/index.ts';
import { previewAttrs } from '../../hooks/usePreviewTriggers.ts';
import { sizeText } from '../../services/measure.ts';
import { getAsset } from '../../state/assets.ts';
import { getDocument, useDocument, type Piece } from '../../state/document.ts';
import { usePrefs } from '../../state/prefs.ts';
import { dims, problemsById } from '../../state/selectors.ts';
import { closeDrawer, isDrawerOpen } from '../../state/actions/drawers.ts';
import { focusSheet } from '../../state/actions/focus.ts';
import { printResolution } from '../../state/actions/layout.ts';
import { remove } from '../../state/actions/pieces.ts';
import { focusPiece, select, selectRange, toggleInSelection } from '../../state/actions/selection.ts';
import { flushUi } from '../../state/flush.ts';
import { revealPiece, revealPieces } from '../canvas/viewport.ts';
import { thumbView } from '../canvas/pieceView.ts';
import { Icon } from '../ui/Icon.tsx';

/** The side of a row's thumbnail, in rem (the box is 2.25rem with a border). */
const THUMB_REM = 1.875;

// Each row's badges (their text is in pieces.badges.<key>). Scissors are «Cortar»: sticking out has its own icon.
const BADGES: readonly { key: 'cut' | 'pastMargin' | 'overlap' | 'lowRes'; icon: LucideIcon }[] = [
  { key: 'cut', icon: SquareArrowOutDownRight },
  { key: 'pastMargin', icon: SquareDashed },
  { key: 'overlap', icon: Layers },
  { key: 'lowRes', icon: TriangleAlert },
];

// Only values that stay equal when nothing about the row changed: a row
// renders again only when its piece, its selection or its problems change.
interface RowProps {
  item: Piece;
  selected: boolean;
  tabStop: boolean;
  cut: boolean;
  pastMargin: boolean;
  /** Overlaps another piece (and overlaps aren't allowed). */
  overlap: boolean;
  /** Re-renders the row when the unit changes. */
  unit: string;
}

const Row = memo(function Row({ item, selected, tabStop, cut, pastMargin, overlap }: RowProps) {
  const asset = getAsset(item.asset);
  const [w, h] = dims(item);
  const paged = asset.kind === 'pdf' && asset.pages > 1;
  const res = printResolution(item);
  const thumb = thumbView(item, asset, THUMB_REM);
  const flags = { cut, pastMargin, overlap, lowRes: !res.vector && res.level === 'low' };
  const size = t(paged ? 'pieces.rowSizePage' : 'pieces.rowSize', { size: sizeText(w, h), page: asset.kind === 'pdf' ? asset.page : 1 });
  // Both lines can be cut with «…» in a narrow list: the tooltip has them whole.
  return (
    <div
      role="option"
      className="piece-row"
      data-id={item.id}
      aria-selected={selected}
      tabIndex={tabStop ? 0 : -1}
      data-tip={asset.name}
      data-tip-note={size}
      {...previewAttrs('piece', item.id)}
    >
      <span className="thumb">
        <span className="thumb-piece" style={thumb.box}>
          <img alt="" draggable={false} src={asset.url} style={thumb.img} />
        </span>
      </span>
      <span className="row-text">
        <span className="row-name">{asset.name}</span>
        <span className="row-dims">{size}</span>
      </span>
      <span className="row-badges">
        {BADGES.filter((badge) => flags[badge.key]).map((badge) => {
          const text = t(`pieces.badges.${badge.key}`);
          return (
            <span key={badge.key} className="row-badge" data-kind={badge.key} data-tip={text}>
              <Icon icon={badge.icon} />
              <span className="sr-only">{t('pieces.badgeSpoken', { text })}</span>
            </span>
          );
        })}
      </span>
    </div>
  );
});

type FocusMode = 'replace' | 'extend' | 'move' | null;

export function PieceList() {
  const list = useRef<HTMLDivElement>(null);
  const items = useDocument((s) => s.items);
  const sheets = useDocument((s) => s.sheets);
  const selection = useDocument((s) => s.selection);
  const busy = useDocument((s) => s.busy);
  const paper = useDocument((s) => s.paper);
  const landscape = useDocument((s) => s.landscape);
  const margin = useDocument((s) => s.margin);
  const cuts = useDocument((s) => s.cuts);
  const allowOverlap = useDocument((s) => s.allowOverlap);
  const unit = usePrefs((s) => s.unit);
  // From where Shift extends the selection (the last one picked by hand) and
  // what the next focus of a row does.
  const anchor = useRef<number | null>(null);
  const focusMode = useRef<FocusMode>(null);
  const lastScrolled = useRef<number | null>(null);

  const problems = useMemo(() => problemsById({ items, paper, landscape, margin, cuts }), [items, paper, landscape, margin, cuts]);
  const primary = selection.at(-1);
  const tabStop = items.some((item) => item.id === primary) ? primary : items[0]?.id;

  const order = () => [...list.current!.querySelectorAll<HTMLElement>('[role="option"]')].map((row) => Number(row.dataset.id));

  // What the list selects shows on the canvas too (the focus stays in the list).
  const reveal = (ids: readonly number[], primary: number) => {
    flushUi();
    revealPieces(ids, primary);
  };

  const extendTo = (id: number) => {
    if (busy) return;
    const current = getDocument().selection;
    const from = anchor.current !== null && order().includes(anchor.current) ? anchor.current : (current.at(-1) ?? id);
    const range = rangeBetween(order(), from, id);
    selectRange(range, id);
    reveal(range.filter((other) => !current.includes(other)), id);
  };

  const toggle = (id: number) => {
    anchor.current = id;
    if (!getDocument().busy && toggleInSelection(id)) reveal([id], id);
  };

  const pick = (id: number) => {
    anchor.current = id;
    select(id);
    reveal([id], id);
  };

  /** Enter or a double click: the piece on the canvas, with the focus (the overlay list closes). */
  const goToPiece = (id: number) => {
    if (!getDocument().selection.includes(id)) select(id);
    if (isDrawerOpen('pieces')) closeDrawer('pieces', { focus: 'none' });
    flushUi();
    revealPiece(id);
    focusSheet();
  };

  // The click puts the focus (after deciding what to select): if it came in
  // the mousedown, it would select only that one and Shift or Ctrl + click
  // couldn't add.
  const onMouseDown = (e: MouseEvent) => {
    if ((e.target as Element).closest('[role="option"]')) e.preventDefault();
  };

  const onClick = (e: MouseEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('[role="option"]');
    if (!row) return;
    const id = Number(row.dataset.id);
    focusMode.current = 'move';
    if (e.shiftKey) extendTo(id);
    else if (e.ctrlKey || e.metaKey) toggle(id);
    else pick(id);
    row.focus();
    focusMode.current = null;
  };

  const onDoubleClick = (e: MouseEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('[role="option"]');
    if (row && !e.shiftKey && !e.ctrlKey && !e.metaKey) goToPiece(Number(row.dataset.id));
  };

  const onFocus = (e: FocusEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('[role="option"]');
    if (!row) return;
    const id = Number(row.dataset.id);
    const mode = focusMode.current;
    focusMode.current = null;
    if (mode === 'move') return;
    if (mode === 'extend') return extendTo(id);
    if (mode === 'replace') return pick(id);
    // With Tab or coming back to the list: like focusing the piece on the sheet.
    focusPiece(id);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey) return;
    const options = [...list.current!.querySelectorAll<HTMLElement>('[role="option"]')];
    const i = options.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const mod = e.ctrlKey || e.metaKey;
    const move = ({ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: options.length - 1, PageDown: i + 8, PageUp: i - 8 } as Record<string, number>)[e.key];
    if (move !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      const target = options[Math.max(0, Math.min(options.length - 1, move))];
      if (target === document.activeElement) return;
      focusMode.current = e.shiftKey ? 'extend' : mod ? 'move' : 'replace';
      target.focus();
      focusMode.current = null;
    } else if ((e.key === ' ' && (mod || e.shiftKey)) || (e.key === 'Enter' && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) toggle(Number((document.activeElement as HTMLElement).dataset.id));
    } else if (mod) {
      return;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      goToPiece(Number((document.activeElement as HTMLElement).dataset.id));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) remove({ focus: true, inList: true });
    }
  };

  // The selected row scrolls into the list (only inside the list).
  useLayoutEffect(() => {
    const row = primary !== undefined ? list.current?.querySelector<HTMLElement>(`[role="option"][data-id="${primary}"]`) : null;
    if (row && primary !== lastScrolled.current) {
      const box = list.current!.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      if (r.top < box.top) list.current!.scrollTop -= box.top - r.top;
      else if (r.bottom > box.bottom) list.current!.scrollTop += r.bottom - box.bottom;
    }
    lastScrolled.current = row ? (primary ?? null) : null;
  });

  const row = (item: Piece) => {
    const problem = problems.get(item.id);
    return (
      <Row
        key={item.id}
        item={item}
        selected={selection.includes(item.id)}
        tabStop={item.id === tabStop}
        cut={!!problem?.cut}
        pastMargin={!!problem?.pastMargin}
        overlap={!!problem?.overlap && !allowOverlap}
        unit={unit}
      />
    );
  };

  return (
    <div
      ref={list}
      id="piece-list"
      className="piece-list"
      role="listbox"
      aria-multiselectable="true"
      aria-labelledby="pieces-title"
      aria-describedby="list-hint"
      hidden={!items.length}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      {sheets.length < 2
        ? items.map(row)
        : sheets.map((sheet, i) => {
            const onSheet = items.filter((item) => item.sheet === sheet.id);
            return (
              <div key={sheet.id} role="group" className="list-group" aria-labelledby={`list-group-${sheet.id}`}>
                <div className="group-head" id={`list-group-${sheet.id}`} role="presentation">
                  <span className="group-title">{t('pieces.groupTitle', { i: i + 1 })}</span>
                  <span className="group-count">{onSheet.length ? t('pieces.count', { n: onSheet.length }) : t('pieces.groupEmpty')}</span>
                </div>
                <div className="group-items">{onSheet.map(row)}</div>
              </div>
            );
          })}
    </div>
  );
}
