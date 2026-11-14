// What the command palette lists: with nothing typed, the recent commands
// first and then every command by section; with something typed, the
// commands it finds, best first, with the parts of their names it matched.
// The second step lists a command's choices the same way.

import type { LucideIcon } from 'lucide-react';
import { fuzzyFilter, prepare, type FuzzyRanges, type FuzzyTarget } from '../../core/fuzzy.js';
import { t } from '../../copy/index.ts';
import { SECTIONS, shownShortcut, type Choice, type Command, type CommandId } from '../../state/commands.ts';

export interface PaletteOption {
  /** Unique among the options shown: the end of its element's id. */
  key: string;
  label: string;
  /** The parts of the label the query matched. */
  ranges: FuzzyRanges;
  icon: LucideIcon | null;
  shortcut: { kbd: string; aria?: string } | null;
  /** Why it can't run now, or null. */
  disabled: string | null;
  /** The option in use (a theme, the paper). */
  current: boolean;
  /** It opens a second step with its choices. */
  more: boolean;
  command: Command | null;
  choice: Choice | null;
}

export interface PaletteGroup {
  /** Its heading, or null for the results of a query (one list, best first). */
  title: string | null;
  options: PaletteOption[];
}

/** The commands, folded once for the searches while the palette is open. */
export const commandTargets = (list: readonly Command[]): FuzzyTarget[] => list.map((c) => prepare(c.label, c.aliases));

export function commandGroups(list: readonly Command[], targets: readonly FuzzyTarget[], recents: readonly CommandId[], query: string, singleKeys: boolean): PaletteGroup[] {
  const option = (c: Command, ranges: FuzzyRanges = []): PaletteOption => ({
    key: c.id,
    label: c.label,
    ranges,
    icon: c.icon,
    shortcut: shownShortcut(c, singleKeys),
    disabled: c.disabled,
    current: c.current,
    more: !!c.choices,
    command: c,
    choice: null,
  });
  if (query.trim()) return [{ title: null, options: fuzzyFilter(query, targets).map((r) => option(list[r.index], r.ranges)) }];
  const recent = recents.flatMap((id) => list.filter((c) => c.id === id));
  const groups: PaletteGroup[] = recent.length ? [{ title: t('palette.recent'), options: recent.map((c) => option(c)) }] : [];
  for (const section of SECTIONS) {
    const options = list.filter((c) => c.section === section && !recents.includes(c.id)).map((c) => option(c));
    if (options.length) groups.push({ title: t(`commands.sections.${section}`), options });
  }
  return groups;
}

export function choiceGroups(choices: readonly Choice[], targets: readonly FuzzyTarget[], query: string): PaletteGroup[] {
  const option = (c: Choice, ranges: FuzzyRanges = []): PaletteOption => ({
    key: `choice-${c.id}`,
    label: c.label,
    ranges,
    icon: null,
    shortcut: null,
    disabled: null,
    current: !!c.current,
    more: false,
    command: null,
    choice: c,
  });
  if (query.trim()) return [{ title: null, options: fuzzyFilter(query, targets).map((r) => option(choices[r.index], r.ranges)) }];
  // In their order, under their headings (choices without one go on their own).
  const groups: PaletteGroup[] = [];
  for (const c of choices) {
    const title = c.group ?? null;
    const last = groups.at(-1);
    if (last && last.title === title) last.options.push(option(c));
    else groups.push({ title, options: [option(c)] });
  }
  return groups;
}
