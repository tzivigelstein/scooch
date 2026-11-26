// A color: the browser's picker and its hexadecimal code, which can be typed
// (#RRGGBB, checked when it is confirmed). The cut lines' «Otro» color and a
// QR code's colors use it.

import { useEffect, useState } from 'react';
import { isHexColor } from '../../core/cutmarks.js';
import { t } from '../../copy/index.ts';

/** The hexadecimal code, typed: confirmed with Enter or on leaving the field; Esc puts back the color in use. */
function HexField({ id, color, onConfirm }: { id: string; color: string; onConfirm: (hex: string) => void }) {
  const [text, setText] = useState(color.toUpperCase());
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    if (document.activeElement?.id !== id) setText(color.toUpperCase());
  }, [color, id]);
  const confirm = () => {
    const value = text.trim().startsWith('#') ? text.trim() : `#${text.trim()}`;
    if (isHexColor(value)) {
      setInvalid(false);
      setText(value.toUpperCase());
      onConfirm(value.toLowerCase());
    } else setInvalid(true);
  };
  return (
    <>
      <input
        id={id}
        type="text"
        className="hex-input"
        value={text}
        maxLength={7}
        spellCheck={false}
        autoComplete="off"
        aria-label={t('cuts.hex')}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          if (invalid && isHexColor(e.target.value.trim())) setInvalid(false);
        }}
        onBlur={confirm}
        onKeyDown={(e) => {
          if (e.key === 'Enter') confirm();
          if (e.key === 'Escape' && (invalid || text !== color.toUpperCase())) {
            e.stopPropagation();
            setText(color.toUpperCase());
            setInvalid(false);
          }
        }}
      />
      <p id={`${id}-error`} className="field-error" hidden={!invalid}>
        {t('cuts.hexInvalid')}
      </p>
    </>
  );
}

/**
 * The picker (`id`, named `picker`) and the code (`hexId`). Dragging in the
 * picker calls `onPick` with each color and `onPickEnd` when it closes; a
 * typed code, `onConfirm`.
 */
export function ColorField({
  id,
  hexId,
  color,
  picker,
  disabled,
  onPick,
  onPickEnd,
  onConfirm,
}: {
  id: string;
  hexId: string;
  color: string;
  picker: string;
  disabled?: boolean;
  onPick: (hex: string) => void;
  onPickEnd: () => void;
  onConfirm: (hex: string) => void;
}) {
  return (
    <div className="color-row">
      <input id={id} type="color" value={color} aria-label={picker} data-tip={picker} disabled={disabled} onChange={(e) => onPick(e.target.value.toLowerCase())} onBlur={onPickEnd} />
      <HexField id={hexId} color={color} onConfirm={onConfirm} />
    </div>
  );
}
