import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

type Handlers = Partial<Record<'input' | 'change' | 'keydown', (event: Event) => void>>;

/**
 * Native listeners on an element, always calling the latest handlers. For
 * the events React doesn't expose as such (an input's native «change» fires on
 * commit, React's onChange on every keystroke).
 */
export function useNativeEvents(ref: RefObject<HTMLElement | null>, handlers: Handlers) {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const names = ['input', 'change', 'keydown'] as const;
    const listeners = names.map((name) => [name, (event: Event) => latest.current[name]?.(event)] as const);
    for (const [name, listener] of listeners) el.addEventListener(name, listener);
    return () => {
      for (const [name, listener] of listeners) el.removeEventListener(name, listener);
    };
  }, [ref]);
}
