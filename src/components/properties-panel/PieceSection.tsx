// The «Pieza» section: only with a selection; with several, how many and
// where, the group's box (none when they are on several sheets), the shared
// scale and align and distribute. Lengths show and read in the chosen unit.

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  BringToFront,
  CircleCheck,
  Crop as CropIcon,
  CopyPlus,
  Crosshair,
  Grid2x2Plus,
  Images,
  Info,
  Maximize2,
  MoveHorizontal,
  MoveVertical,
  RotateCw,
  Scaling,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import type { AlignMode } from '../../core/align.js';
import { PHOTO_SIZES } from '../../core/crop.js';
import { common, SCALE_RANGE } from '../../core/group.js';
import { parseDecimal } from '../../core/units.js';
import { clamp } from '../../core/util.js';
import { t, type CopyKey } from '../../copy/index.ts';
import { MAX_ITEMS } from '../../config.ts';
import { useNativeEvents } from '../../hooks/useNativeEvents.ts';
import { previewAttrs } from '../../hooks/usePreviewTriggers.ts';
import type { ShortcutName } from '../../hooks/shortcuts.ts';
import { lacksTransparency, shapesVersion, subscribeShapes } from '../../services/contours.ts';
import { decimalValue, lengthText, sizeText, unitName, unitSymbol } from '../../services/measure.ts';
import { getAsset } from '../../state/assets.ts';
import { getDocument, useDocument, type Piece } from '../../state/document.ts';
import { gestureStore } from '../../state/gesture.ts';
import { usePrefs } from '../../state/prefs.ts';
import { dims, sheetIndex } from '../../state/selectors.ts';
import { setView, useView } from '../../state/view.ts';
import { applyPhotoSize, photoSizeName, selectionPhotoSize } from '../../state/actions/crop.ts';
import { changePage } from '../../state/actions/files.ts';
import { fillSummary, fillWithCopies, printResolution, qrProblem } from '../../state/actions/layout.ts';
import {
  actualSize,
  alignSelection,
  alignsToSheet,
  bringToFront,
  canDistribute,
  center,
  distributeNeeds,
  distributeSelection,
  duplicate,
  fit,
  lengthFieldKey,
  lengthFieldRange,
  lengthFieldsOff,
  lengthFieldValue,
  maxCopies,
  overlapsOthers,
  primaryBox,
  remove,
  scaleFieldKey,
  setLengthField,
  setScaleField,
  spansSheets,
  type LengthField as LengthFieldName,
} from '../../state/actions/pieces.ts';
import { selectSame } from '../../state/actions/selection.ts';
import { control, controlRoute, used, type UsageId } from '../../state/tips.ts';
import { Button, IconButton } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { LengthField, type LengthFieldHandle } from '../ui/LengthField.tsx';
import { NumberField } from '../ui/NumberField.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Select, type SelectOption } from '../ui/Select.tsx';
import { announce } from '../feedback/announcer.ts';
import { startCrop } from '../canvas/cropMode.ts';
import '../ui/Section.css';
import './sections.css';
import './PieceSection.css';

/** While something loads, controls are disabled except the focused one. */
const busyOff = (busy: boolean, selector: string) => busy && !document.activeElement?.matches(selector);

// Icon and note (key in props.resolution) of each resolution level.
const QUALITY: Record<'vector' | 'good' | 'ok' | 'low', { icon: LucideIcon; note: 'ok' | 'low' | null }> = {
  vector: { icon: CircleCheck, note: null },
  good: { icon: CircleCheck, note: null },
  ok: { icon: Info, note: 'ok' },
  low: { icon: TriangleAlert, note: 'low' },
};

function resolution(item: Piece) {
  // A QR code that may not scan says why where an image says it may look pixelated.
  const problem = qrProblem(item);
  if (problem) return { level: 'low' as const, text: problem };
  const res = printResolution(item);
  const level: keyof typeof QUALITY = res.vector ? 'vector' : res.level;
  const note = QUALITY[level].note;
  const printsAt = res.vector ? '' : t('props.resolution.printsAt', { ppp: res.ppp });
  const text = res.vector ? t('props.resolution.vector') : note ? t('props.resolution.withNote', { text: printsAt, note: t(`props.resolution.${note}`) }) : printsAt;
  return { level, text };
}

/**
 * With Contour cut lines, why the piece's line is its rectangle when its
 * image has no transparent background: its badge in the Items list, icon and
 * text. It follows the traced shapes by itself, so the section doesn't
 * render again for them.
 */
function OpaqueNote({ item }: { item: Piece | null }) {
  const cuts = useDocument((s) => s.cuts);
  useSyncExternalStore(subscribeShapes, shapesVersion);
  const shown = !!item && cuts.mode === 'contour' && lacksTransparency(item, cuts.margin);
  return (
    <p id="opaque-note" className="field-note" hidden={!shown}>
      <Icon icon={Info} />
      <span>{t('pieces.badges.opaque')}</span>
    </p>
  );
}

const PHOTO_GROUPS = ['print', 'id', 'instant'] as const;

/** «Tamaño de foto»: «Original», then the standard sizes in their groups, in the chosen unit. */
const photoOptions = (): SelectOption[] => [
  { value: 'original', label: t('crop.original') },
  ...PHOTO_GROUPS.flatMap((group) =>
    PHOTO_SIZES.filter((size) => size.group === group).map((size) => ({
      value: size.id,
      label: t('crop.option', { name: photoSizeName(size.id), size: sizeText(size.w, size.h) }),
      group: t(`crop.groups.${group}`),
    }))
  ),
];

const ALIGN_COMMANDS = { left: 'alignLeft', centerX: 'alignCenterX', right: 'alignRight', top: 'alignTop', centerY: 'alignCenterY', bottom: 'alignBottom' } as const satisfies Record<AlignMode, UsageId>;

const ALIGN_BUTTONS: readonly { mode: AlignMode; key: CopyKey; icon: LucideIcon; shortcut: ShortcutName }[] = [
  { mode: 'left', key: 'props.alignLeft', icon: AlignStartVertical, shortcut: 'alignLeft' },
  { mode: 'centerX', key: 'props.alignCenterX', icon: AlignCenterVertical, shortcut: 'alignCenterX' },
  { mode: 'right', key: 'props.alignRight', icon: AlignEndVertical, shortcut: 'alignRight' },
  { mode: 'top', key: 'props.alignTop', icon: AlignStartHorizontal, shortcut: 'alignTop' },
  { mode: 'centerY', key: 'props.alignCenterY', icon: AlignCenterHorizontal, shortcut: 'alignCenterY' },
  { mode: 'bottom', key: 'props.alignBottom', icon: AlignEndHorizontal, shortcut: 'alignBottom' },
];

function NumField({
  prefix,
  unit,
  children,
  className = prefix === undefined ? 'num-field' : 'num-field prefixed',
  preview,
}: {
  prefix?: ReactNode;
  unit?: ReactNode;
  children: ReactNode;
  className?: string;
  /** What the canvas shows while the field is hovered or focused. */
  preview?: LengthFieldName;
}) {
  return (
    <label className={className} {...(preview && previewAttrs(preview))}>
      {prefix !== undefined && (
        <span className="num-prefix" aria-hidden="true">
          {prefix}
        </span>
      )}
      {children}
      {unit !== undefined && (
        <span className="num-unit" aria-hidden="true">
          {unit}
        </span>
      )}
    </label>
  );
}

// X and Y are letters from the texts, looked up as each render needs them (the
// language can change); width and height are icons.
const FIELDS: readonly { field: LengthFieldName; id: string; prefix: () => ReactNode; label: CopyKey; tip: CopyKey }[] = [
  { field: 'x', id: 'pos-x', prefix: () => t('props.x'), label: 'props.xLabel', tip: 'props.xTip' },
  { field: 'y', id: 'pos-y', prefix: () => t('props.y'), label: 'props.yLabel', tip: 'props.yTip' },
  { field: 'width', id: 'width', prefix: () => <Icon icon={MoveHorizontal} />, label: 'props.widthLabel', tip: 'props.widthTip' },
  { field: 'height', id: 'height', prefix: () => <Icon icon={MoveVertical} />, label: 'props.heightLabel', tip: 'props.heightTip' },
];

/** The displayed values of a selection (or of a gesture's live copies). */
function shown(list: readonly Piece[]) {
  if (list.length > 1) {
    // On several sheets there is no one box: the measures stay empty.
    const box = spansSheets(list) ? null : primaryBox(list);
    const scale = common(
      list.map((item) => item.scale),
      0.05
    );
    const primaryId = getDocument().selection.at(-1);
    const primary = list.find((item) => item.id === primaryId) ?? list.at(-1)!;
    return { x: box?.x ?? null, y: box?.y ?? null, width: box?.w ?? null, height: box?.h ?? null, scale, slider: clamp(scale ?? primary.scale, 1, 200) };
  }
  const item = list[0];
  const [w, h] = dims(item);
  return { x: item.x, y: item.y, width: w, height: h, scale: item.scale as number | null, slider: clamp(item.scale, 1, 200) };
}

/** The scale as typed: a comma or a point whatever the language, and a percent sign if one is typed («150 %»). */
const parseScale = (text: string) => parseDecimal(text.replace(/[%％]\s*$/, ''));

/** The scale the field shows: the piece's, or the shared one of several (null: «Mixta»). */
function scaleValue() {
  const { items, selection } = getDocument();
  const list = items.filter((item) => selection.includes(item.id));
  return list.length ? shown(list).scale : null;
}

function useScaleInput(ref: RefObject<HTMLInputElement | null>, name: 'scale' | 'slider') {
  useNativeEvents(ref, {
    input: () => setScaleField(name, parseFloat(ref.current!.value)),
    change: () => setScaleField(name, parseFloat(ref.current!.value), { final: true }),
  });
}

export function PieceSection() {
  const items = useDocument((s) => s.items);
  const selection = useDocument((s) => s.selection);
  useDocument((s) => s.sheets);
  const busy = useDocument((s) => s.busy);
  const gap = useDocument((s) => s.gap);
  useDocument((s) => s.paper);
  useDocument((s) => s.landscape);
  useDocument((s) => s.margin);
  useDocument((s) => s.rotate);
  const alignTo = useView((s) => s.alignTo);
  const distribute = useView((s) => s.distribute);
  useDocument((s) => s.allowOverlap);
  usePrefs((s) => s.unit);
  usePrefs((s) => s.grid);
  const list = items.filter((item) => selection.includes(item.id));
  const n = list.length;
  const group = n > 1;
  const single = n === 1 ? list[0] : null;

  const fields = useRef<Record<LengthFieldName, LengthFieldHandle | null>>({ x: null, y: null, width: null, height: null });
  const scaleInput = useRef<HTMLInputElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const resolutionText = useRef<HTMLSpanElement>(null);
  // «Duplicar ×N»: how many copies, for this session only (not saved anywhere).
  const copies = useRef(1);
  const [copiesShown, setCopies] = useState(1);
  useScaleInput(slider, 'slider');

  const values = n ? shown(list) : null;

  // Number inputs: no value is written over what the person is typing.
  const paintNumbers = (v: ReturnType<typeof shown>, liveList: readonly Piece[]) => {
    const scale = scaleInput.current;
    const range = slider.current;
    if (scale && document.activeElement !== scale) scale.value = v.scale === null ? '' : decimalValue(v.scale);
    if (range && document.activeElement !== range) range.value = String(v.slider);
    range?.setAttribute('aria-valuetext', v.scale === null ? t('props.mixed') : t('units.scale', { n: v.scale }));
    if (liveList.length === 1 && resolutionText.current) resolutionText.current.textContent = resolution(liveList[0]).text;
  };

  useLayoutEffect(() => {
    if (values) paintNumbers(values, list);
  });

  // Live values during a gesture (dragging, the handle): written directly.
  useEffect(
    () =>
      gestureStore.subscribe((state, previous) => {
        if (state.drafts === previous.drafts) return;
        const { items: all, selection: ids } = getDocument();
        const liveList = state.drafts ?? all.filter((item) => ids.includes(item.id));
        if (!liveList.length) return;
        const v = shown(liveList);
        for (const { field } of FIELDS) fields.current[field]?.show(v[field]);
        paintNumbers(v, liveList);
      }),
    []
  );

  const max = Math.max(1, maxCopies());
  const dupN = Math.min(copiesShown, max);

  // Without a selection the fields stay in the page, hidden (like every control).
  const primaryId = selection.at(-1);
  const primary = list.find((item) => item.id === primaryId) ?? list.at(-1);
  const asset = primary ? getAsset(primary.asset) : null;
  const sheetCount = new Set(list.map((item) => item.sheet)).size;
  // Several: how many and where, as one name («6 piezas en 4 hojas»).
  const groupName =
    !primary || !group ? '' : sheetCount > 1 ? t('props.groupNameSheets', { n, sheets: t('sheet.count', { n: sheetCount }) }) : t('props.groupName', { n, i: sheetIndex(primary.sheet) + 1 });
  const fieldsOff = group ? lengthFieldsOff() : null;
  const paged = asset?.kind === 'pdf' && asset.pages > 1;
  const name = !asset || group ? '' : paged && asset.kind === 'pdf' ? t('props.pieceNamePage', { name: asset.name, page: asset.page }) : asset.name;
  const res = single ? resolution(single) : null;
  const frontEnabled = single ? overlapsOthers(single) : false;
  const toSheet = alignsToSheet();
  const enabled = n > 0 && canDistribute();
  const why = distributeNeeds() === 2 ? t('props.distributeNeedTwo') : t('props.distributeNeedThree');
  const gapText = lengthText(gap);
  const summary = single ? fillSummary(single) : null;
  const describe = (ids: string) => (single ? ids : undefined);
  const unit = unitSymbol();
  // A QR code is never cropped: no photo size for it (several pieces take it without their QR codes).
  const croppable = list.filter((item) => getAsset(item.asset).kind !== 'qr');
  const photoValue = croppable.length ? selectionPhotoSize(croppable) : 'original';

  return (
    <div className="prop-section" id="section-piece">
      {/* The tab already says «Pieza»: with one piece the heading is for screen readers only. */}
      <h2 id="piece-title" className={group ? 'section-title static' : 'sr-only'} hidden={!n}>
        {group ? groupName : t('props.piece')}
      </h2>
      <p id="piece-empty" className="panel-empty" hidden={n > 0}>
        {t('props.empty')}
      </p>
      <div id="piece-props" className={group ? 'section-body is-group' : 'section-body'} hidden={!n}>
        <p id="piece-name" className="piece-name" data-tip={asset?.name} hidden={group}>
          {name}
        </p>
        <div className="prop-grid">
          {FIELDS.map(({ field, id, prefix, label, tip }) => (
            // Off (on several sheets): empty, in place, saying why; nothing to show on the canvas.
            <NumField key={id} prefix={prefix()} unit={unit} preview={fieldsOff ? undefined : field}>
              <LengthField
                ref={(handle) => {
                  fields.current[field] = handle;
                }}
                id={id}
                data-tip={t(tip)}
                data-tip-note={fieldsOff ?? undefined}
                aria-label={t(label, { unit: unitName() })}
                aria-describedby={fieldsOff ? 'length-fields-off' : (field === 'width' || field === 'height') && single ? (single.r ? 'resolution-note rotation-note' : 'resolution-note') : undefined}
                aria-disabled={fieldsOff ? true : undefined}
                readOnly={!!fieldsOff}
                disabled={busyOff(busy, `#${id}`)}
                value={() => lengthFieldValue(field)}
                range={() => lengthFieldRange(field)}
                editKey={() => lengthFieldKey(field)}
                busy={() => getDocument().busy || !getDocument().selection.length || spansSheets()}
                apply={(mm, { final }) => setLengthField(field, mm, { final })}
              />
            </NumField>
          ))}
        </div>
        {fieldsOff && (
          <span id="length-fields-off" hidden>
            {fieldsOff}
          </span>
        )}
        <div className="scale-row">
          <NumField prefix={<Icon icon={Scaling} />} unit={t('units.percent')}>
            <NumberField
              inputRef={scaleInput}
              id="scale"
              // Text, not a number input: a browser writes those with its own decimal separator, not the interface's.
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              aria-label={t('props.scaleLabel')}
              data-tip={t('props.scaleTip')}
              placeholder={group && values?.scale === null ? t('props.mixed') : ''}
              aria-describedby={describe('resolution-note')}
              disabled={busyOff(busy, '#scale')}
              value={scaleValue}
              range={() => SCALE_RANGE}
              parse={parseScale}
              isPartial={(text) => !text.trim()}
              format={decimalValue}
              stepBy={() => 0.1}
              describe={(v) => t('units.scale', { n: v })}
              editKey={() => scaleFieldKey('scale')}
              busy={() => getDocument().busy || !getDocument().selection.length}
              apply={(v, { final }) => setScaleField('scale', v, { final })}
            />
          </NumField>
          <input
            ref={slider}
            id="slider"
            type="range"
            min="1"
            max="200"
            step="0.1"
            aria-label={t('props.slider')}
            data-tip={t('props.slider')}
            aria-describedby={describe('resolution-note')}
            disabled={busyOff(busy, '#slider')}
          />
        </div>
        <p id="resolution-note" className="field-note quality" data-level={res?.level} hidden={!res}>
          <span id="resolution-icon" className="quality-icon">
            {res && <Icon icon={QUALITY[res.level].icon} />}
          </span>
          <span id="resolution-text" ref={resolutionText} />
        </p>
        <p id="rotation-note" className="field-note" hidden={!single?.r}>
          <Icon icon={RotateCw} />
          <strong id="rotation-angle">{t('props.rotated', { deg: single?.r ?? 90 })}</strong>
        </p>
        <OpaqueNote item={single} />
        <div className="photo-row" hidden={n > 0 && !croppable.length}>
          <div className="field">
            <span id="photo-size-label" className="field-label">
              {t('crop.size')}
            </span>
            <Select
              id="photo-size"
              labelledBy="photo-size-label"
              value={photoValue}
              valueLabel={photoValue === 'mixed' ? t('crop.mixed') : photoValue === 'custom' ? t('crop.custom') : undefined}
              options={photoOptions()}
              onChange={applyPhotoSize}
              looking={(size) => previewAttrs('photoSize', size)}
              disabled={busyOff(busy, '#photo-size')}
            />
          </div>
          <Button
            id="crop-start"
            className="chip-btn icon-chip"
            icon={CropIcon}
            data-crop-toggle=""
            tip={t('crop.start')}
            note={group ? t('crop.startSingle') : undefined}
            shortcut="crop"
            aria-disabled={group || undefined}
            disabled={busyOff(busy, '#crop-start')}
            onClick={(e) => (group ? announceNote(e.currentTarget) : startCrop())}
          >
            <span>{t('crop.start')}</span>
          </Button>
        </div>
        <div className="action-row" role="group" aria-label={t('props.quick')}>
          <button type="button" id="actual" className="chip-btn" aria-label={t('props.actualLabel')} data-tip={t('props.actualTip')} disabled={busyOff(busy, '#actual')} onClick={actualSize}>
            {t('props.actual')}
          </button>
          <IconButton id="piece-fit" icon={Maximize2} label={t('props.fit')} tip={t('props.fit')} shortcut="fit" hidden={group} onClick={() => fit()} />
          <IconButton id="piece-center" icon={Crosshair} label={t('props.center')} tip={t('props.center')} shortcut="center" hidden={group} onClick={() => center()} />
          <IconButton
            id="piece-front"
            icon={BringToFront}
            label={t('props.front')}
            tip={t(frontEnabled ? 'props.front' : 'props.frontDisabled')}
            shortcut="front"
            aria-disabled={!frontEnabled}
            hidden={group}
            onClick={() => frontEnabled && bringToFront()}
          />
        </div>
        <div className="arrange-tools">
          <p id="align-sheet-note" className="tools-note field-label" hidden={group}>
            {t('props.alignSheetNote')}
          </p>
          <div id="align-to-field" className="tools-head" role="group" aria-labelledby="align-to-label" hidden={!group}>
            <span id="align-to-label" className="field-label">
              {t('props.alignTo')}
            </span>
            <Segmented
              id="align-to"
              name="align-to"
              value={alignTo}
              onChange={(value) => setView({ alignTo: value })}
              options={[
                { value: 'selection', label: <span>{t('props.alignToSelection')}</span> },
                { value: 'sheet', label: <span>{t('props.alignToSheet')}</span> },
              ]}
            />
          </div>
          <div id="align-row" className="tool-row" role="group" aria-label={t('props.align')}>
            {ALIGN_BUTTONS.map(({ mode, key, icon, shortcut }) => (
              <IconButton
                key={mode}
                data-align={mode}
                {...previewAttrs('align', mode)}
                icon={icon}
                label={t(key)}
                tip={t(key)}
                note={toSheet ? t('props.alignSheetTip') : t('props.alignSelectionTip')}
                shortcut={shortcut}
                disabled={busyOff(busy, `[data-align="${mode}"]`)}
                onClick={control(ALIGN_COMMANDS[mode], () => !getDocument().busy && alignSelection(mode))}
              />
            ))}
          </div>
          <div className="tools-head wide" role="group" aria-labelledby="distribute-label">
            <span id="distribute-label" className="field-label">
              {t('props.distributeBy')}
            </span>
            <Segmented
              id="distribute-mode"
              name="distribute-mode"
              value={distribute}
              onChange={(value) => setView({ distribute: value })}
              options={[
                { value: 'gap', label: <span>{t('props.distributeGap', { gap: gapText })}</span> },
                { value: 'even', label: <span>{t('props.distributeEven')}</span> },
              ]}
            />
          </div>
          <div id="distribute-row" className="tool-row" role="group" aria-label={t('props.distribute')}>
            {(['x', 'y'] as const).map((axis) => {
              const label = t(axis === 'x' ? 'props.distributeX' : 'props.distributeY');
              return (
                <IconButton
                  key={axis}
                  data-distribute={axis}
                  {...previewAttrs('distribute', axis)}
                  icon={axis === 'x' ? AlignHorizontalSpaceBetween : AlignVerticalSpaceBetween}
                  label={label}
                  tip={label}
                  note={enabled ? undefined : why}
                  shortcut={axis === 'x' ? 'distributeX' : 'distributeY'}
                  aria-disabled={!enabled}
                  disabled={busyOff(busy, `[data-distribute="${axis}"]`)}
                  onClick={(e) => {
                    if (getDocument().busy) return;
                    if (e.currentTarget.getAttribute('aria-disabled') === 'true') return announceNote(e.currentTarget);
                    distributeSelection(axis);
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="copy-row">
          <div className="dup-group" role="group" aria-label={t('props.duplicateGroup')} {...previewAttrs('duplicate', dupN)}>
            <Button
              id="dup-many"
              className="chip-btn icon-chip"
              icon={CopyPlus}
              aria-label={t('props.duplicateLabel', { n: dupN })}
              tip={t('props.duplicateTip', { n: dupN })}
              note={t('props.duplicateMax', { n: maxCopies(), max: MAX_ITEMS })}
              disabled={busyOff(busy, '#dup-many')}
              onClick={(e) => {
                if (getDocument().busy || !getDocument().selection.length) return;
                const times = Math.min(copies.current, Math.max(1, maxCopies()));
                duplicate(times);
                used(times > 1 ? 'duplicateMany' : 'duplicate', controlRoute(e));
              }}
            >
              <span id="dup-many-text">{dupN > 1 ? t('props.duplicateTimes', { n: dupN }) : t('props.duplicate')}</span>
            </Button>
            <NumField prefix={t('props.times')} className="num-field prefixed dup-count">
              <NumberField
                id="dup-count"
                type="number"
                min="1"
                step="1"
                max={String(max)}
                inputMode="numeric"
                aria-label={t('props.duplicateCount')}
                data-tip={t('props.duplicateCount')}
                disabled={busyOff(busy, '#dup-count')}
                value={() => copies.current}
                range={() => ({ min: 1, max: Math.max(1, maxCopies()) })}
                parse={(text) => {
                  const v = parseDecimal(text);
                  return v === null ? null : Math.floor(v);
                }}
                isPartial={(text) => !text.trim()}
                format={String}
                describe={String}
                apply={(v) => {
                  copies.current = v;
                  setCopies(v);
                }}
                onEnter={() => document.getElementById('dup-many')?.click()}
              />
            </NumField>
          </div>
          <Button id="select-same" className="chip-btn icon-chip" icon={Images} tip={t('props.selectSameTip')} shortcut="selectSame" disabled={busyOff(busy, '#select-same')} onClick={selectSame}>
            <span>{t('props.selectSame')}</span>
          </Button>
        </div>
        <label id="page-row" className="field" hidden={group || asset?.kind !== 'pdf'}>
          <span className="field-label">{t('props.page')}</span>
          <select id="page" value={asset?.kind === 'pdf' ? String(asset.page) : ''} disabled={busyOff(busy, '#page')} onChange={(e) => void changePage(Number(e.target.value))}>
            {asset?.kind === 'pdf' &&
              Array.from({ length: asset.pages }, (_, i) => (
                <option key={i} value={String(i + 1)}>
                  {t('props.pageOption', { n: i + 1, total: asset.pages })}
                </option>
              ))}
          </select>
        </label>
        <details id="fill-details" className="fill-details" hidden={group}>
          <summary>
            <Icon icon={Grid2x2Plus} />
            <span>{t('props.fill')}</span>
          </summary>
          <div className="fill-body">
            <p id="fill-summary" className="fill-summary">
              {summary?.text}
            </p>
            <p className="callout">
              <Icon icon={TriangleAlert} />
              <span id="fill-warning">{summary?.warning ?? t('props.fillWarning')}</span>
            </p>
            <button type="button" id="fill" className="btn primary block" disabled={busy || !summary?.ok} onClick={control('fill', () => fillWithCopies())} {...previewAttrs('fill')}>
              {t('props.fill')}
            </button>
          </div>
        </details>
        <Button id="piece-remove" className="text-btn danger remove-btn" icon={Trash2} onClick={(e) => (remove({ focus: e.detail === 0 }), used('remove', controlRoute(e)))}>
          <span>{group ? t('props.removeMany', { n }) : t('props.remove')}</span>
        </Button>
      </div>
    </div>
  );
}

function announceNote(button: HTMLElement) {
  const note = button.dataset.tipNote;
  if (note) announce(note);
}
