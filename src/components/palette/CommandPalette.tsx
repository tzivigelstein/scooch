// The command palette (Mod+K, or the search button in the top bar): every
// action of the app (state/commands.ts), found by typing part of its name or
// another word for it. A combobox with its listbox (ARIA 1.2): the focus stays
// in the field while the arrows, Home, End, Page Up and Page Down move
// through the options; Enter runs one and closes, Esc closes. A command that
// can't run now stays listed with why, and doesn't run. One that needs a
// value (a paper, a sheet) lists its choices in a second step.

import { ArrowLeft, Check, ChevronRight, Search, X } from 'lucide-react';
import { Fragment, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { prepare, type FuzzyRanges, type FuzzyTarget } from '../../core/fuzzy.js';
import { keyLabel, t } from '../../copy/index.ts';
import { flushUi } from '../../state/flush.ts';
import { usePrefs } from '../../state/prefs.ts';
import { commands, isCommandId, runCommand, type Choice, type Command } from '../../state/commands.ts';
import { closeDialog } from '../dialogs/dialogs.ts';
import { IconButton } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { choiceGroups, commandGroups, commandTargets, type PaletteOption } from './options.ts';
import { recentCommands, rememberCommand } from './recents.ts';

/** How many options Page Up and Page Down move. */
const PAGE = 8;

interface Step {
  command: Command;
  choices: readonly Choice[];
  targets: FuzzyTarget[];
  /** What was typed before, and the option that was active: back gives them back. */
  query: string;
  active: number;
}

const optionId = (option: PaletteOption) => `palette-option-${option.key}`;

/** The label with the parts the query matched in <mark>. */
function marked(label: string, ranges: FuzzyRanges): ReactNode {
  if (!ranges.length) return label;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [from, to] of ranges) {
    if (from > at) parts.push(label.slice(at, from));
    parts.push(<mark key={from}>{label.slice(from, to)}</mark>);
    at = to;
  }
  if (at < label.length) parts.push(label.slice(at));
  return parts;
}

export default function CommandPalette() {
  const singleKeys = usePrefs((s) => s.singleKeys);
  // The commands as they are when it opens: nothing changes them while it is open.
  const [all] = useState(commands);
  const [recents] = useState(() => recentCommands().filter(isCommandId));
  const targets = useMemo(() => commandTargets(all), [all]);
  const [query, setQuery] = useState('');
  const [step, setStep] = useState<Step | null>(null);
  const [active, setActive] = useState(0);
  // What the status says for screen readers (why an option can't run, when chosen).
  const [said, setSaid] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const groups = step ? choiceGroups(step.choices, step.targets, query) : commandGroups(all, targets, recents, query, singleKeys);
  const flat = groups.flatMap((group) => group.options);
  const index = Math.min(active, flat.length - 1);
  const focused = flat[index] ?? null;

  useLayoutEffect(() => {
    if (index === 0 && list.current) list.current.scrollTop = 0;
    else if (focused) document.getElementById(optionId(focused))?.scrollIntoView({ block: 'nearest' });
  }, [index, focused?.key, step]);

  const type = (text: string) => {
    setQuery(text);
    setActive(0);
  };

  const back = () => {
    if (!step) return;
    setStep(null);
    setQuery(step.query);
    setActive(step.active);
    input.current?.focus();
  };

  const choose = (option: PaletteOption) => {
    if (option.disabled) {
      // The same reason twice is still said again (a status only speaks when its text changes).
      const reason = option.disabled;
      return setSaid((before) => (before === reason ? `${reason}​` : reason));
    }
    const c = option.command;
    if (c?.choices) {
      const choices = c.choices();
      setStep({ command: c, choices, targets: choices.map((choice) => prepare(choice.label)), query, active: index });
      setQuery('');
      setActive(Math.max(0, choices.findIndex((choice) => choice.current)));
      setSaid('');
      return;
    }
    const run = c?.run ?? option.choice?.run;
    if (!run) return;
    const id = step?.command.id ?? c!.id;
    rememberCommand(id);
    // Closed first, so the focus is back where it was before the command moves it (or opens something).
    closeDialog('palette');
    flushUi();
    runCommand(id, 'palette', run);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
    const last = flat.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: index >= last ? 0 : index + 1,
      ArrowUp: index <= 0 ? last : index - 1,
      PageDown: Math.min(last, index + PAGE),
      PageUp: Math.max(0, index - PAGE),
      ...(e.shiftKey ? {} : { Home: 0, End: last }),
    };
    if (e.key in moves) {
      e.preventDefault();
      if (flat.length) setActive(moves[e.key]);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focused) choose(focused);
    } else if (e.key === 'Backspace' && step && !query) {
      e.preventDefault();
      back();
    }
  };

  let n = -1;
  const option = (o: PaletteOption) => {
    const i = ++n;
    const id = optionId(o);
    return (
      <div
        key={o.key}
        id={id}
        role="option"
        className="palette-option"
        aria-selected={i === index ? 'true' : undefined}
        aria-disabled={o.disabled ? 'true' : undefined}
        aria-current={o.current ? 'true' : undefined}
        aria-describedby={o.disabled ? `${id}-why` : undefined}
        aria-keyshortcuts={o.shortcut?.aria}
        onPointerMove={() => i !== index && setActive(i)}
        onClick={() => choose(o)}
      >
        <span className="palette-icon">{o.icon && <Icon icon={o.icon} />}</span>
        <span className="palette-label">
          {marked(o.label, o.ranges)}
        </span>
        <span className="palette-end" aria-hidden="true">
          {o.current && <Icon icon={Check} className="palette-check" />}
          {o.shortcut && <kbd>{keyLabel(o.shortcut.kbd)}</kbd>}
          {o.more && <Icon icon={ChevronRight} />}
        </span>
        {o.disabled && (
          // Its description, not part of its name.
          <span id={`${id}-why`} className="palette-why" aria-hidden="true">
            {o.disabled}
          </span>
        )}
      </div>
    );
  };

  const empty = !flat.length;
  return (
    <>
      <h2 id="palette-title" className="sr-only">
        {t('palette.title')}
      </h2>
      <div className="palette-head">
        {step ? (
          <IconButton id="palette-back" className="icon-btn small" icon={ArrowLeft} label={t('palette.back')} tip={t('palette.back')} onClick={back} />
        ) : (
          <span className="palette-search">
            <Icon icon={Search} />
          </span>
        )}
        {step && (
          <span id="palette-step" className="palette-step">
            {step.command.label}
          </span>
        )}
        <input
          ref={input}
          id="palette-input"
          className="palette-input"
          type="text"
          role="combobox"
          aria-labelledby={step ? 'palette-step' : 'palette-title'}
          aria-expanded={!empty}
          aria-controls="palette-list"
          aria-autocomplete="list"
          aria-activedescendant={focused ? optionId(focused) : undefined}
          placeholder={t(step ? 'palette.choicePlaceholder' : 'palette.placeholder')}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(e) => type(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <IconButton id="palette-close" className="icon-btn small" icon={X} label={t('app.close')} tip={t('app.close')} onClick={() => closeDialog('palette')} />
      </div>
      <div
        ref={list}
        id="palette-list"
        className="palette-list"
        role="listbox"
        aria-labelledby={step ? 'palette-step' : 'palette-title'}
        hidden={empty}
        // A press on an option keeps the focus in the field (the keys keep working there).
        onMouseDown={(e) => e.preventDefault()}
      >
        {groups.map((group, g) =>
          group.title === null ? (
            <Fragment key={g}>{group.options.map(option)}</Fragment>
          ) : (
            <div key={g} role="group" className="palette-group" aria-labelledby={`palette-group-${g}`}>
              <div id={`palette-group-${g}`} role="presentation" className="palette-group-title">
                {group.title}
              </div>
              {group.options.map(option)}
            </div>
          )
        )}
      </div>
      <p id="palette-empty" className="palette-empty" role="status">
        {empty ? t(step ? 'palette.emptyChoice' : 'palette.empty', { query: query.trim() }) : ''}
      </p>
      <p className="sr-only" role="status">
        {said}
      </p>
    </>
  );
}
