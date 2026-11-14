// Notices: a floating pill at the bottom center that only shows when there is
// something to say. Results of an action go away on their own (paused with the
// pointer or the focus on them, and they can be closed); current problems stay
// while they last. Everything is announced in the live regions.

import { CircleCheck, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatList, joinSentences, t } from '../../copy/index.ts';
import { useDocument, type DocumentData } from '../../state/document.ts';
import { sheetProblems } from '../../state/selectors.ts';
import { getView, setView, useView, type Flash, type NoticeAction } from '../../state/view.ts';
import { arrangeAll } from '../../state/actions/edit.ts';
import { Icon } from '../ui/Icon.tsx';
import { announce, cancelAnnounce } from './announcer.ts';

const INFO_MS = 5000;
const WARN_MS = 9000;

interface Notice {
  text: string;
  warn?: boolean;
  /** Not the result of an action that went well (no check mark). */
  info?: boolean;
  action?: NoticeAction | null;
  busy?: boolean;
  flash?: boolean;
}

// With several sheets, the notice says on which: «Hoja 2: …», «Hojas 1 y 3: …».
function inSheets(text: string, sheets: readonly number[], many: boolean) {
  if (!many) return text;
  return t('notices.inSheets', { n: sheets.length, list: formatList(sheets.map((i) => i + 1)), text });
}

/**
 * Which notice applies now, by priority (null: nothing to say). While a
 * measurement field is being edited, problems stay as they were when the edit
 * began: what is typed is still a preview.
 */
function useCurrentNotice(): Notice | null {
  const busy = useDocument((s) => s.busy);
  const busyText = useView((s) => s.busyText);
  const flash = useView((s) => s.flash);
  const editing = useView((s) => s.editing);
  const doc = useDocument((s) => s);
  const problems = useRef<Notice | null>(null);
  if (busy) return busyText ? { text: busyText, busy: true } : null;
  if (flash) return { ...flash, flash: true };
  if (!editing) problems.current = problemNotice(doc);
  return problems.current;
}

function problemNotice(doc: DocumentData): Notice | null {
  if (!doc.items.length) return null;
  const { cut, pastMargin, overlap } = sheetProblems(doc);
  const many = doc.sheets.length > 1;
  if (cut.count) return { text: inSheets(t('notices.cut', { n: cut.count }), cut.sheets, many), warn: true };
  if (pastMargin.count) return { text: inSheets(t('notices.pastMargin', { n: pastMargin.count }), pastMargin.sheets, many), warn: true };
  if (overlap.count && !doc.allowOverlap) {
    const text = many ? inSheets(t('notices.overlapIn'), overlap.sheets, many) : t('notices.overlap');
    return { text, info: true, action: { label: t('bar.arrange'), run: arrangeAll } };
  }
  return null;
}

export function NoticePill() {
  const notice = useCurrentNotice();
  const { text = '', warn = false, info = false, action = null, busy = false, flash = false } = notice ?? {};
  const signature = notice ? [text, warn, info, action?.label, busy, flash].join('|') : '';
  // The check mark only for an action that went well; what is wrong warns.
  const tone = warn ? 'warning' : busy ? 'busy' : info || !flash ? 'info' : 'success';
  const currentAction = useRef<NoticeAction | null>(null);
  const pill = useRef<HTMLDivElement>(null);
  currentAction.current = action;

  // Results of actions close on their own.
  const timer = useRef({ id: 0 as ReturnType<typeof setTimeout> | 0, flash: null as Flash | null, remaining: 0, startedAt: 0, hovering: false, focusInside: false });

  const pause = () => {
    const tm = timer.current;
    if (!tm.id) return;
    clearTimeout(tm.id);
    tm.id = 0;
    tm.remaining -= performance.now() - tm.startedAt;
  };
  const resume = () => {
    const tm = timer.current;
    // The focus can leave silently (a focused button that hides): it is checked again here.
    const el = pill.current;
    tm.focusInside &&= !!el?.contains(document.activeElement);
    tm.hovering &&= !!el?.matches(':hover');
    if (!tm.flash || tm.id || tm.hovering || tm.focusInside) return;
    tm.startedAt = performance.now();
    tm.id = setTimeout(expire, Math.max(1200, tm.remaining));
  };
  const stopTimer = () => {
    const tm = timer.current;
    clearTimeout(tm.id);
    tm.id = 0;
    tm.flash = null;
  };
  const startTimer = (f: Flash, ms: number) => {
    const tm = timer.current;
    clearTimeout(tm.id);
    tm.id = 0;
    tm.flash = f;
    tm.remaining = ms;
    resume();
  };
  function expire() {
    const tm = timer.current;
    tm.id = 0;
    if (getView().flash && getView().flash === tm.flash) dismiss();
    tm.flash = null;
  }
  /** Closes the result notice (what is left, e.g. a current problem, still shows). */
  const dismiss = () => {
    stopTimer();
    setView({ flash: null });
  };

  useEffect(() => {
    if (!notice) {
      // A problem solved before it was announced isn't announced any more.
      cancelAnnounce('notice');
      stopTimer();
      return;
    }
    // Results without a button go away on their own; with a button (or marked
    // `persist`, like the printing tip) they stay until the next action or until closed.
    const current = getView().flash;
    if (flash && !action && current && !current.persist) startTimer(current, warn ? WARN_MS : INFO_MS);
    else stopTimer();
    // Results of an action are announced right away (warnings, assertively);
    // problems that show up on their own (e.g. moving a piece), with a delay
    // so each step isn't repeated.
    const spoken = action && !busy ? joinSentences([text, t('notices.actionAvailable', { action: action.label })]) : text;
    if (flash) announce(spoken, { assertive: warn, key: 'notice' });
    else announce(spoken, { key: 'notice', delay: busy ? 250 : 900 });
    // Only when what the notice says changes.
  }, [signature]);

  useEffect(() => () => clearTimeout(timer.current.id), []);

  return (
    <div
      ref={pill}
      id="pill"
      className="pill"
      hidden={!notice}
      data-tone={notice ? tone : undefined}
      onPointerEnter={() => ((timer.current.hovering = true), pause())}
      onPointerLeave={() => ((timer.current.hovering = false), resume())}
      onFocus={() => ((timer.current.focusInside = true), pause())}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        timer.current.focusInside = false;
        resume();
      }}
    >
      <span id="pill-icon" className="pill-icon">
        <Icon icon={{ warning: TriangleAlert, busy: LoaderCircle, info: Info, success: CircleCheck }[tone]} className="pill-glyph" />
      </span>
      <span id="pill-text" className="pill-text">
        {text}
      </span>
      <button type="button" id="pill-action" className="pill-action" hidden={!action} onClick={() => currentAction.current?.run()}>
        {action ? action.label : ''}
      </button>
      <button type="button" id="pill-close" className="pill-close" aria-label={t('notices.close')} data-tip={t('notices.close')} hidden={!flash} onClick={dismiss}>
        <Icon icon={X} />
      </button>
    </div>
  );
}
