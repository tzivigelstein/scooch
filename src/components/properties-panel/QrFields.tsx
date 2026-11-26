// A QR code's fields in the Item tab, with one QR code selected: its content,
// the text below it, its colors (the background may be transparent), the
// shape of its dots and of its eyes, and its logo. Every change shows on the
// sheet as it is made and is one undo step; typing in a field, or dragging in
// a color picker, is one step until the field is left. What may keep the code
// from reading is said by the Item tab's note (PieceSection), as for the
// size. Loads with the first QR code (a chunk of its own, with its styles).

import { useEffect, useRef, useState } from 'react';
import { CAPTION_MAX, fitText, QR_DOTS, QR_EYES } from '../../core/qrshape.js';
import type { QrDots, QrEyes } from '../../core/types.ts';
import { t } from '../../copy/index.ts';
import type { QrAsset } from '../../services/assets.ts';
import { getAsset } from '../../state/assets.ts';
import { useDocument, type Piece } from '../../state/document.ts';
import { endEdit } from '../../state/history.ts';
import { chooseLogo, editQr, takeContentFocus } from '../../state/actions/qr.ts';
import { Button } from '../ui/Button.tsx';
import { ColorField } from '../ui/ColorField.tsx';
import { Segmented } from '../ui/Segmented.tsx';
import { Switch } from '../ui/Switch.tsx';
import './QrFields.css';

/**
 * A text field that keeps what is being typed while the code it changes is
 * built, and shows the code's text again when it changes from elsewhere
 * (undo) and the field isn't being typed in. `fit`: what the text may become
 * (the content is cut to what a QR code holds).
 */
function TextBox({ id, value, multiline = false, maxLength, fit = (text) => text, onText }: { id: string; value: string; multiline?: boolean; maxLength?: number; fit?: (text: string) => string; onText: (text: string) => void }) {
  const [text, setText] = useState(value);
  const typing = useRef(false);
  const sent = useRef(value);
  useEffect(() => {
    if (!typing.current) setText(value);
  }, [value]);
  const props = {
    id,
    value: text,
    maxLength,
    spellCheck: false,
    autoComplete: 'off',
    onFocus: () => (typing.current = true),
    onBlur: () => {
      typing.current = false;
      endEdit();
      // Changed meanwhile from elsewhere (undo): the field shows it.
      if (value !== sent.current) setText(value);
    },
    onChange: (e: { target: { value: string } }) => {
      const next = fit(e.target.value);
      setText(next);
      sent.current = next;
      onText(next);
    },
  };
  return multiline ? <textarea className="qr-text" rows={3} {...props} /> : <input type="text" {...props} />;
}

// Each shape drawn small over its name, as the cut lines' modes: three dots
// of the code joined (or not) as that shape joins them, and an eye.
const GLYPHS: Record<'dots' | 'eyes', Partial<Record<QrDots, string>>> = {
  dots: {
    square: 'M2 2h12v5H7v7H2z',
    rounded: 'M4.5 2h7a2.5 2.5 0 0 1 0 5H7v4.5a2.5 2.5 0 0 1-5 0v-7A2.5 2.5 0 0 1 4.5 2z',
    circle: 'M2 4.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0zM9 4.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0zM2 11.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0z',
  },
  eyes: {
    square: 'M2 2h12v12H2zM4 4v8h8V4zM6 6h4v4H6z',
    rounded: 'M6 2h4a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4zM6 4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM7.5 6h1A1.5 1.5 0 0 1 10 7.5v1A1.5 1.5 0 0 1 8.5 10h-1A1.5 1.5 0 0 1 6 8.5v-1A1.5 1.5 0 0 1 7.5 6z',
  },
};

function shapeOption<T extends QrDots>(part: 'dots' | 'eyes', value: T) {
  return {
    value,
    label: (
      <span>
        <svg className="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d={GLYPHS[part][value]} fill="currentColor" fillRule="evenodd" />
        </svg>
        {t(`qr.shapes.${value}`)}
      </span>
    ),
  };
}

function QrForm({ item, qr }: { item: Piece; qr: QrAsset }) {
  const file = useRef<HTMLInputElement>(null);
  const id = item.id;
  // Just added: what comes next is its content.
  useEffect(() => {
    if (takeContentFocus(id)) document.getElementById('qr-text')?.focus();
  }, [id]);
  const keyed = (field: string) => ({ key: `qr-${field}:${id}` });
  return (
    <div id="qr-fields" className="qr-fields">
      <div className="field">
        <label className="field-label" htmlFor="qr-text">
          {t('qr.text')}
        </label>
        <TextBox id="qr-text" multiline value={qr.text} fit={fitText} onText={(text) => void editQr(id, { text }, keyed('text'))} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="qr-caption">
          {t('qr.caption')}
        </label>
        <TextBox id="qr-caption" value={qr.caption} maxLength={CAPTION_MAX} onText={(caption) => void editQr(id, { caption }, keyed('caption'))} />
      </div>
      <fieldset className="field qr-group">
        <legend className="qr-group-title">{t('qr.colors')}</legend>
        <div className="qr-color" role="group" aria-labelledby="qr-color-label">
          <span id="qr-color-label" className="field-label">
            {t('qr.color')}
          </span>
          <ColorField
            id="qr-color"
            hexId="qr-color-hex"
            color={qr.color}
            picker={t('qr.picker')}
            onPick={(color) => void editQr(id, { color }, keyed('color'))}
            onPickEnd={endEdit}
            onConfirm={(color) => void editQr(id, { color })}
          />
        </div>
        <div className="qr-color" role="group" aria-labelledby="qr-background-label">
          <span id="qr-background-label" className="field-label">
            {t('qr.background')}
          </span>
          {qr.background !== null && (
            <ColorField
              id="qr-background"
              hexId="qr-background-hex"
              color={qr.background}
              picker={t('qr.picker')}
              onPick={(background) => void editQr(id, { background }, keyed('background'))}
              onPickEnd={endEdit}
              onConfirm={(background) => void editQr(id, { background })}
            />
          )}
          <Switch id="qr-transparent" label={t('qr.transparent')} checked={qr.background === null} onChange={(on) => void editQr(id, { background: on ? null : '#ffffff' })} />
        </div>
      </fieldset>
      <fieldset className="field qr-group">
        <legend className="qr-group-title">{t('qr.shape')}</legend>
        <div className="qr-color" role="group" aria-labelledby="qr-dots-label">
          <span id="qr-dots-label" className="field-label">
            {t('qr.dots')}
          </span>
          <Segmented<QrDots>
            id="qr-dots"
            className="segmented stacked"
            name="qr-dots"
            labelledBy="qr-dots-label"
            value={qr.dots}
            onChange={(dots) => void editQr(id, { dots })}
            options={QR_DOTS.map((value) => shapeOption('dots', value))}
          />
        </div>
        <div className="qr-color" role="group" aria-labelledby="qr-eyes-label">
          <span id="qr-eyes-label" className="field-label">
            {t('qr.eyes')}
          </span>
          <Segmented<QrEyes>
            id="qr-eyes"
            className="segmented stacked"
            name="qr-eyes"
            labelledBy="qr-eyes-label"
            value={qr.eyes}
            onChange={(eyes) => void editQr(id, { eyes })}
            options={QR_EYES.map((value) => shapeOption('eyes', value))}
          />
        </div>
      </fieldset>
      <div className="qr-logo">
        {qr.logo ? (
          <>
            <Button id="qr-logo-change" className="chip-btn" onClick={() => file.current?.click()}>
              {t('qr.logoChange')}
            </Button>
            <Button id="qr-logo-remove" className="chip-btn" onClick={() => void editQr(id, { logo: null })}>
              {t('qr.logoRemove')}
            </Button>
          </>
        ) : (
          <Button id="qr-logo-add" className="chip-btn" onClick={() => file.current?.click()}>
            {t('qr.logoAdd')}
          </Button>
        )}
        <input
          ref={file}
          id="qr-logo-file"
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = '';
            if (chosen) void chooseLogo(id, chosen);
          }}
        />
      </div>
    </div>
  );
}

/** The fields of the QR code selected alone; nothing otherwise. */
export default function QrFields() {
  const items = useDocument((s) => s.items);
  const selection = useDocument((s) => s.selection);
  const item = selection.length === 1 ? items.find((it) => it.id === selection[0]) : undefined;
  const asset = item && getAsset(item.asset);
  return item && asset?.kind === 'qr' ? <QrForm key={item.id} item={item} qr={asset} /> : null;
}
