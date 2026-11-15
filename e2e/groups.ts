// The browser specs by what they are about. CI runs WebKit and Firefox one
// group to a job (E2E_GROUP), so each job fits its time limit and a failure
// says which part of the app broke. Every spec belongs to exactly one group:
// a run doesn't start otherwise (specGroupPatterns).
import { readdirSync } from 'node:fs';

export const SPEC_GROUPS = {
  /** What assistive technology and the keyboard get. */
  accessibility: ['accessibility', 'keyboard-only'],
  /** Working on the sheet: pieces, pointer, zoom, sheets, crop and cut lines. */
  sheet: [
    'canvas-previews',
    'clipboard',
    'context-menus',
    'crop',
    'cut-lines',
    'floating-controls',
    'off-sheet',
    'piece-toolbar',
    'pinch-zoom',
    'pointer-editing',
    'reveal-from-list',
    'selection-and-group',
    'sheets',
    'view-follows-new-pieces',
    'zoom-and-pan',
  ],
  /** Around the sheet: projects, files, printing, panels, preferences and the site's pages. */
  app: [
    'boot-and-build',
    'command-palette',
    'deep-links',
    'donation',
    'export-parity',
    'files',
    'languages',
    'measurement-fields',
    'panels-and-tabs',
    'paper',
    'print-and-download',
    'print-summary',
    'projects',
    'segmented-controls',
    'site-pages',
    'stored-formats',
    'theme',
    'units',
    'usage-tips',
  ],
  /** Clock budgets: they run alone, after the rest, in Chromium only. */
  timing: ['performance'],
} as const;

export type SpecGroup = keyof typeof SPEC_GROUPS;

const pattern = (name: string) => new RegExp(`(^|[\\\\/])${name}\\.spec\\.ts$`);

/**
 * The files of `group` as patterns for Playwright's testMatch. Throws if a
 * spec in `specsDir` is in no group or in two, or a group names a spec that
 * isn't there: a new spec has to say what it is about.
 */
export function specGroupPatterns(group: SpecGroup, specsDir: string): RegExp[] {
  const listed = Object.values(SPEC_GROUPS).flat() as string[];
  const present = readdirSync(specsDir)
    .filter((file) => file.endsWith('.spec.ts'))
    .map((file) => file.slice(0, -'.spec.ts'.length));
  const twice = listed.filter((name, i) => listed.indexOf(name) !== i);
  const ungrouped = present.filter((name) => !listed.includes(name));
  const missing = listed.filter((name) => !present.includes(name));
  const problems = [
    twice.length && `in two groups: ${twice.join(', ')}`,
    ungrouped.length && `in no group: ${ungrouped.join(', ')}`,
    missing.length && `listed but not in ${specsDir}: ${missing.join(', ')}`,
  ].filter(Boolean);
  if (problems.length) throw new Error(`e2e/groups.ts doesn't match the specs (${problems.join('; ')}).`);
  return SPEC_GROUPS[group].map(pattern);
}

/** The group E2E_GROUP names, or null when it isn't set. Throws on a name that is no group. */
export function requestedGroup(value: string | undefined): SpecGroup | null {
  if (!value) return null;
  if (!Object.hasOwn(SPEC_GROUPS, value)) throw new Error(`E2E_GROUP=${value} is not a group of e2e/groups.ts (${Object.keys(SPEC_GROUPS).join(', ')}).`);
  return value as SpecGroup;
}
