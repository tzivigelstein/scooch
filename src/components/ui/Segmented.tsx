import { useLayoutEffect, useRef, type CSSProperties, type InputHTMLAttributes, type ReactNode, type RefObject } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Extra attributes for the radio (a tooltip, a shortcut…). */
  input?: InputHTMLAttributes<HTMLInputElement> & Record<`data-${string}`, string | undefined>;
}

/** The thumb's slide (--fast) and some slack: a segment resizing meanwhile keeps it sliding. */
const SLIDE_MS = 250;

/**
 * Puts the thumb on the box of the `index`th segment, sliding there or (a
 * resize, the first placement) jumping. False when the group isn't laid out
 * (in a closed panel): it is placed when it shows, which resizes it.
 */
function placeThumb(group: HTMLElement, index: number, slide: boolean) {
  const thumb = group.querySelector<HTMLElement>(':scope > .seg-thumb');
  const segment = group.querySelectorAll<HTMLElement>(':scope > .seg')[index];
  if (!thumb || !segment || !group.offsetWidth) return false;
  const box = group.getBoundingClientRect();
  const rect = segment.getBoundingClientRect();
  // In layout pixels, should an ancestor be scaled (a dialog opening).
  const scale = box.width / group.offsetWidth;
  if (!slide) thumb.style.transition = 'none';
  thumb.style.setProperty('--thumb-x', `${(rect.left - box.left) / scale}px`);
  thumb.style.setProperty('--thumb-w', `${rect.width / scale}px`);
  if (!slide) {
    // The jump is computed without a transition before it comes back.
    thumb.getBoundingClientRect();
    thumb.style.transition = '';
  }
  return true;
}

/**
 * Keeps the thumb on the chosen segment's measured box: when the choice or
 * the options change (sliding to another choice), and whenever a segment or
 * the group resizes (a label in another language, a wider panel, a long label
 * taking more room). Other renders move nothing, so they measure nothing.
 */
function useThumb(group: RefObject<HTMLDivElement | null>, index: number, keys: string) {
  const state = useRef({ index: -1, placed: false, slidingUntil: 0 });
  useLayoutEffect(() => {
    const el = group.current;
    if (!el) return;
    const s = state.current;
    const slide = s.placed && index >= 0 && index !== s.index;
    if (slide) s.slidingUntil = performance.now() + SLIDE_MS;
    s.index = index;
    s.placed = index >= 0 && placeThumb(el, index, slide);
  }, [group, index, keys]);
  useLayoutEffect(() => {
    const el = group.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const s = state.current;
    // The chosen label turns medium as the thumb sets off, a little wider: the slide takes it in.
    const observer = new ResizeObserver(() => {
      if (s.index >= 0) s.placed = placeThumb(el, s.index, s.placed && performance.now() < s.slidingUntil);
    });
    observer.observe(el);
    for (const segment of el.querySelectorAll(':scope > .seg')) observer.observe(segment);
    return () => observer.disconnect();
  }, [group, keys]);
}

/**
 * A row of radio chips: one choice among a few, the chosen one on a thumb
 * that slides between them. The segments are as wide as each other while
 * their labels fit; with `fit`, each as wide as its label.
 */
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
  className = 'segmented',
  fit = false,
  id,
  labelledBy,
  label,
}: {
  name: string;
  value: T | null;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  /** Segments as wide as their labels (sharing the room left) instead of as wide as each other. */
  fit?: boolean;
  id?: string;
  /** Names the group (it becomes a radiogroup): an element's id, or a text. */
  labelledBy?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const index = options.findIndex((option) => option.value === value);
  useThumb(ref, index, options.map((option) => option.value).join('\n'));
  const group = labelledBy || label ? { role: 'radiogroup', 'aria-labelledby': labelledBy, 'aria-label': label } : {};
  return (
    <div ref={ref} id={id} className={fit ? `${className} fit` : className} {...group}>
      {/* Where it goes until it's measured: --index of --count equal segments. */}
      <span className="seg-thumb" aria-hidden="true" hidden={index < 0} style={{ '--index': index, '--count': options.length } as CSSProperties} />
      {options.map((option) => (
        <label key={option.value} className="seg">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={(e) => {
              if (e.target.checked) onChange(option.value);
            }}
            {...option.input}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
