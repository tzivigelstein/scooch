// Every action of the app, once: its name, other words that find it, its keys
// (names in the shortcut table, hooks/shortcuts.ts), why it can't run now if it
// can't, and what it does: the same actions the buttons, menus and keys call.
// The command palette lists them, the shortcuts dialog shows their keys, and
// the context and zoom menus take their entries from here.

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
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crop,
  Crosshair,
  Download,
  FileMinus,
  FilePlus,
  Files,
  FileText,
  FolderOpen,
  Grid3x3,
  ImagePlus,
  Images,
  Keyboard,
  Languages,
  LayoutDashboard,
  List,
  ListChecks,
  Magnet,
  Maximize,
  Maximize2,
  Moon,
  MoveHorizontal,
  PanelRight,
  Pencil,
  Plus,
  Printer,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Scaling,
  Scan,
  Scissors,
  SearchCheck,
  Settings,
  SquareArrowRight,
  Sun,
  SunMoon,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import type { AlignMode } from '../core/align.js';
import { LANGUAGES } from '../core/language.js';
import { PAPER_GROUPS, PAPERS } from '../core/papers.js';
import type { ThemeChoice } from '../core/storedprefs.js';
import type { CutMode, PaperId } from '../core/types.ts';
import type { Unit } from '../core/units.js';
import { t, type CopyKey } from '../copy/index.ts';
import { LANGUAGE_NAMES } from '../copy/languages.ts';
import { startCrop } from '../components/canvas/cropMode.ts';
import { fitSheet, stepZoom, zoomToPercent } from '../components/canvas/viewport.ts';
import { focusPieces, focusPropsTab } from '../hooks/useGlobalShortcuts.ts';
import { SHORTCUTS, type ShortcutKeys, type ShortcutName } from '../hooks/shortcuts.ts';
import { browserLanguage } from '../services/language.ts';
import { sizeText } from '../services/measure.ts';
import { getDocument } from './document.ts';
import { getPrefs, setLanguage, setTheme } from './prefs.ts';
import { useProject } from './project.ts';
import { currentSheet, selectedItems } from './selectors.ts';
import { used, type Route } from './tips.ts';
import { copySelection, cutSelection, hasClip, pastePieces } from './actions/clipboard.ts';
import { openPrefs, openProjects, openShortcuts } from './actions/dialogs.ts';
import { arrangeAll, redoLast, undoLast } from './actions/edit.ts';
import { openFiles } from './actions/files.ts';
import { exportPdf, printPdf } from './actions/output.ts';
import {
  actualSize,
  alignSelection,
  bringToFront,
  canDistribute,
  center,
  distributeNeeds,
  distributeSelection,
  duplicate,
  fit,
  overlapsOthers,
  remove,
  rotate,
} from './actions/pieces.ts';
import { chooseUnit } from './actions/prefs.ts';
import { createWithUi, duplicateOpenProject, renameOpenProject } from './actions/projects.ts';
import { selectAll, selectSame } from './actions/selection.ts';
import {
  addSheet,
  canMoveToNewSheet,
  choosePaper,
  clearAll,
  moveToNewSheet,
  removeSheet,
  setCuts,
  setGridVisible,
  setOrientation,
  setSnap,
  showPaperSettings,
  showSheet,
} from './actions/sheets.ts';

/** The groups the palette lists the commands in (and the shortcuts dialog its rows), in order. */
export const SECTIONS = ['general', 'projects', 'selection', 'sheets', 'view', 'prefs'] as const;
export type CommandSection = (typeof SECTIONS)[number];

/** One value of a command that needs one (a paper, a sheet): the palette's second step. */
export interface Choice {
  id: string;
  label: string;
  /** The heading it goes under (a paper's series). */
  group?: string;
  /** The value in use now. */
  current?: boolean;
  /** The language its label is in, when not the interface's (a language by its own name). */
  lang?: string;
  run: () => void;
}

interface Definition {
  section: CommandSection;
  /** Its name: a copy key, or the text when it takes parameters. */
  label: CopyKey | (() => string);
  icon: LucideIcon;
  /** Other words that find it (a comma-separated list in the copy). */
  aliases?: CopyKey;
  /** Its keys: the first is the one shown next to it; the shortcuts dialog shows them all. */
  keys?: readonly ShortcutName[];
  /** Why it can't run now (null: it can). */
  disabled?: () => string | null;
  /** It is the option in use (a theme, a unit). */
  current?: () => boolean;
  /** What it does; or, for a command that needs a value, its choices. */
  run?: () => void;
  choices?: () => readonly Choice[];
}

/** A command as the palette, the dialog and the menus use it, with its texts and state as they are now. */
export interface Command {
  id: CommandId;
  section: CommandSection;
  label: string;
  icon: LucideIcon;
  aliases: string;
  keys: readonly ShortcutName[];
  disabled: string | null;
  current: boolean;
  run: (() => void) | null;
  choices: (() => readonly Choice[]) | null;
}

// ---------- When a command can't run ----------

const noPieces = () => (getDocument().items.length ? null : t('menu.reasons.noPieces'));
const noSelection = () => (getDocument().selection.length ? null : t('announce.needSelection'));
const notSingle = () => noSelection() ?? (getDocument().selection.length === 1 ? null : t('menu.reasons.single'));
const noProject = () => (useProject.getState().id && useProject.getState().storage ? null : t('projects.statusTip.off'));

function frontReason() {
  const reason = notSingle();
  if (reason) return reason;
  return overlapsOthers(selectedItems()[0]) ? null : t('menu.reasons.front');
}

const distributeReason = () =>
  noSelection() ?? (canDistribute() ? null : t(distributeNeeds() === 2 ? 'props.distributeNeedTwo' : 'props.distributeNeedThree'));

// ---------- The commands that are a family ----------

const ALIGNS: Record<AlignMode, { label: CopyKey; icon: LucideIcon; key: ShortcutName }> = {
  left: { label: 'props.alignLeft', icon: AlignStartVertical, key: 'alignLeft' },
  centerX: { label: 'props.alignCenterX', icon: AlignCenterVertical, key: 'alignCenterX' },
  right: { label: 'props.alignRight', icon: AlignEndVertical, key: 'alignRight' },
  top: { label: 'props.alignTop', icon: AlignStartHorizontal, key: 'alignTop' },
  centerY: { label: 'props.alignCenterY', icon: AlignCenterHorizontal, key: 'alignCenterY' },
  bottom: { label: 'props.alignBottom', icon: AlignEndHorizontal, key: 'alignBottom' },
};

const align = (mode: AlignMode): Definition => ({
  section: 'selection',
  label: ALIGNS[mode].label,
  icon: ALIGNS[mode].icon,
  aliases: 'commands.aliases.align',
  keys: [ALIGNS[mode].key],
  disabled: noSelection,
  run: () => alignSelection(mode),
});

const distribute = (axis: 'x' | 'y'): Definition => ({
  section: 'selection',
  label: axis === 'x' ? 'props.distributeX' : 'props.distributeY',
  icon: axis === 'x' ? AlignHorizontalSpaceBetween : AlignVerticalSpaceBetween,
  aliases: 'commands.aliases.distribute',
  keys: [axis === 'x' ? 'distributeX' : 'distributeY'],
  disabled: distributeReason,
  run: () => distributeSelection(axis),
});

const unit = (value: Unit): Definition => ({
  section: 'prefs',
  label: () => t('commands.unit', { unit: t(`units.names.${value}`) }),
  icon: Ruler,
  aliases: 'commands.aliases.unit',
  current: () => getPrefs().unit === value,
  run: () => chooseUnit(value),
});

const THEME_ICONS: Record<ThemeChoice, LucideIcon> = { auto: SunMoon, light: Sun, dark: Moon };

const theme = (value: ThemeChoice): Definition => ({
  section: 'prefs',
  label: `commands.themes.${value}`,
  icon: THEME_ICONS[value],
  aliases: 'commands.aliases.theme',
  current: () => getPrefs().theme === value,
  run: () => setTheme(value),
});

const CUT_MODES: readonly CutMode[] = ['none', 'corners', 'outline', 'contour'];

/** «Automático» (with the browser's language) and each language by its own name, as in «Preferencias». */
function languageChoices(): Choice[] {
  const chosen = getPrefs().language;
  return [
    { id: 'auto', label: t('prefs.languageAuto', { language: LANGUAGE_NAMES[browserLanguage()] }), current: chosen === 'auto', run: () => setLanguage('auto') },
    ...LANGUAGES.map((language) => ({ id: language, label: LANGUAGE_NAMES[language], lang: language, current: chosen === language, run: () => setLanguage(language) })),
  ];
}

function paperChoices(): Choice[] {
  const { paper } = getDocument();
  const presets = PAPER_GROUPS.flatMap((group) =>
    PAPERS.filter((p) => p.group === group).map((p) => ({
      id: p.id,
      label: t('papers.option', { paper: t(`papers.names.${p.id}`), size: sizeText(p.w, p.h) }),
      group: t(`papers.groups.${group}`),
      current: paper === p.id,
      run: () => choosePaper(p.id as PaperId),
    }))
  );
  const custom: Choice = {
    id: 'custom',
    label: t('papers.custom'),
    current: typeof paper !== 'string',
    // Its width and height are typed in Papel: it goes there.
    run: () => {
      choosePaper('custom');
      showPaperSettings(currentSheet());
    },
  };
  return [...presets, custom];
}

// ---------- The commands ----------

const DEFINITIONS = {
  // General
  add: { section: 'general', label: 'bar.addTip', icon: ImagePlus, aliases: 'commands.aliases.add', keys: ['add'], run: openFiles },
  arrange: { section: 'general', label: 'bar.arrangeTip', icon: LayoutDashboard, aliases: 'commands.aliases.arrange', keys: ['arrange'], disabled: noPieces, run: arrangeAll },
  undo: {
    section: 'general',
    label: 'bar.undo',
    icon: Undo2,
    aliases: 'commands.aliases.undo',
    keys: ['undo'],
    disabled: () => (getDocument().canUndo ? null : t('commands.reasons.undo')),
    run: undoLast,
  },
  redo: {
    section: 'general',
    label: 'bar.redo',
    icon: Redo2,
    aliases: 'commands.aliases.redo',
    keys: ['redo', 'redoAlt'],
    disabled: () => (getDocument().canRedo ? null : t('commands.reasons.redo')),
    run: redoLast,
  },
  print: { section: 'general', label: 'bar.print', icon: Printer, aliases: 'commands.aliases.print', keys: ['print'], disabled: noPieces, run: () => void printPdf() },
  download: { section: 'general', label: 'bar.download', icon: Download, aliases: 'commands.aliases.download', keys: ['download', 'downloadAlt'], disabled: noPieces, run: () => void exportPdf() },
  shortcuts: { section: 'general', label: 'commands.shortcuts', icon: Keyboard, aliases: 'commands.aliases.shortcuts', keys: ['help'], run: openShortcuts },

  // Projects
  projects: { section: 'projects', label: 'commands.projects', icon: FolderOpen, aliases: 'commands.aliases.projects', keys: ['projects'], run: () => void openProjects() },
  newProject: { section: 'projects', label: 'projects.new', icon: Plus, aliases: 'commands.aliases.newProject', run: () => void createWithUi() },
  duplicateProject: { section: 'projects', label: 'commands.duplicateProject', icon: CopyPlus, aliases: 'commands.aliases.duplicateProject', disabled: noProject, run: () => void duplicateOpenProject() },
  renameProject: { section: 'projects', label: 'commands.renameProject', icon: Pencil, aliases: 'commands.aliases.renameProject', disabled: noProject, run: renameOpenProject },

  // The selection
  duplicate: {
    section: 'selection',
    label: 'menu.duplicate',
    icon: CopyPlus,
    aliases: 'commands.aliases.duplicate',
    keys: ['duplicate', 'duplicateKey'],
    disabled: noSelection,
    run: () => duplicate(1, { focus: true }),
  },
  remove: { section: 'selection', label: 'props.remove', icon: Trash2, aliases: 'commands.aliases.remove', keys: ['remove', 'removeAlt'], disabled: noSelection, run: () => remove({ focus: true }) },
  rotateLeft: { section: 'selection', label: 'menu.rotateLeft', icon: RotateCcw, aliases: 'commands.aliases.rotate', keys: ['rotateLeft'], disabled: noSelection, run: () => rotate(-1, { focus: true }) },
  rotateRight: { section: 'selection', label: 'menu.rotateRight', icon: RotateCw, aliases: 'commands.aliases.rotate', keys: ['rotateRight'], disabled: noSelection, run: () => rotate(1, { focus: true }) },
  fit: { section: 'selection', label: 'props.fit', icon: Maximize2, aliases: 'commands.aliases.fit', keys: ['fit'], disabled: notSingle, run: () => fit({ focus: true }) },
  center: { section: 'selection', label: 'props.center', icon: Crosshair, aliases: 'commands.aliases.center', keys: ['center'], disabled: notSingle, run: () => center({ focus: true }) },
  actualSize: { section: 'selection', label: 'props.actualTip', icon: Scaling, aliases: 'commands.aliases.actualSize', disabled: noSelection, run: actualSize },
  front: { section: 'selection', label: 'menu.front', icon: BringToFront, aliases: 'commands.aliases.front', keys: ['front'], disabled: frontReason, run: () => bringToFront({ focus: true }) },
  crop: { section: 'selection', label: 'menu.crop', icon: Crop, aliases: 'commands.aliases.crop', keys: ['crop'], disabled: notSingle, run: () => startCrop() },
  selectSame: { section: 'selection', label: 'menu.selectSame', icon: Images, aliases: 'commands.aliases.selectSame', keys: ['selectSame'], disabled: noSelection, run: selectSame },
  selectAll: { section: 'selection', label: 'commands.selectAll', icon: ListChecks, aliases: 'commands.aliases.selectAll', keys: ['selectAll'], disabled: noPieces, run: selectAll },
  copy: { section: 'selection', label: 'menu.copy', icon: Copy, aliases: 'commands.aliases.clipboard', keys: ['copy'], disabled: noSelection, run: () => void copySelection() },
  cut: { section: 'selection', label: 'menu.cut', icon: Scissors, aliases: 'commands.aliases.clipboard', keys: ['cut'], disabled: noSelection, run: () => void cutSelection() },
  paste: {
    section: 'selection',
    label: 'menu.paste',
    icon: ClipboardPaste,
    aliases: 'commands.aliases.clipboard',
    keys: ['paste'],
    disabled: () => (hasClip() ? null : t('menu.reasons.paste')),
    run: () => void pastePieces(),
  },
  alignLeft: align('left'),
  alignCenterX: align('centerX'),
  alignRight: align('right'),
  alignTop: align('top'),
  alignCenterY: align('centerY'),
  alignBottom: align('bottom'),
  distributeX: distribute('x'),
  distributeY: distribute('y'),
  moveToNewSheet: {
    section: 'selection',
    label: 'menu.newSheet',
    icon: SquareArrowRight,
    aliases: 'commands.aliases.newSheet',
    disabled: () => noSelection() ?? (canMoveToNewSheet() ? null : t('menu.reasons.oneSheet')),
    run: moveToNewSheet,
  },

  // Sheets
  addSheet: { section: 'sheets', label: 'menu.addSheet', icon: FilePlus, aliases: 'commands.aliases.addSheet', run: () => addSheet() },
  removeSheet: {
    section: 'sheets',
    label: 'commands.removeSheet',
    icon: FileMinus,
    aliases: 'commands.aliases.removeSheet',
    disabled: () => (getDocument().sheets.length > 1 ? null : t('commands.reasons.oneSheet')),
    run: () => removeSheet(currentSheet(), { viaKeyboard: true }),
  },
  gotoSheet: {
    section: 'sheets',
    label: 'commands.gotoSheet',
    icon: Files,
    aliases: 'commands.aliases.gotoSheet',
    choices: () => {
      const { sheets } = getDocument();
      const now = currentSheet();
      return sheets.map((sheet, i) => ({ id: String(sheet.id), label: t('sheet.numbered', { i: i + 1, total: sheets.length }), current: sheet.id === now, run: () => showSheet(sheet.id) }));
    },
  },
  paper: { section: 'sheets', label: 'sheet.changePaper', icon: FileText, aliases: 'commands.aliases.paper', choices: paperChoices },
  orientation: {
    section: 'sheets',
    label: 'commands.orientation',
    icon: RectangleHorizontal,
    aliases: 'commands.aliases.orientation',
    keys: ['landscape'],
    run: () => setOrientation(!getDocument().landscape),
  },
  cutLines: {
    section: 'sheets',
    label: 'commands.cutLines',
    icon: Scan,
    aliases: 'commands.aliases.cutLines',
    choices: () => CUT_MODES.map((mode) => ({ id: mode, label: t(`cuts.modes.${mode}`), current: getDocument().cuts.mode === mode, run: () => setCuts({ mode }) })),
  },
  clearAll: { section: 'sheets', label: 'commands.clearAll', icon: Trash2, aliases: 'commands.aliases.clearAll', disabled: noPieces, run: () => void clearAll() },

  // The view
  grid: { section: 'view', label: 'commands.grid', icon: Grid3x3, aliases: 'commands.aliases.grid', keys: ['grid'], run: () => setGridVisible(!getPrefs().grid.show) },
  snap: { section: 'view', label: 'commands.snap', icon: Magnet, aliases: 'commands.aliases.snap', run: () => setSnap(!getPrefs().grid.snap) },
  zoomFit: { section: 'view', label: 'zoom.fit', icon: Maximize, aliases: 'commands.aliases.zoom', keys: ['fitSheet'], run: () => fitSheet('fit', currentSheet()) },
  zoomWidth: { section: 'view', label: 'zoom.width', icon: MoveHorizontal, aliases: 'commands.aliases.zoom', keys: ['fitWidth'], run: () => fitSheet('width', currentSheet()) },
  zoom100: { section: 'view', label: 'commands.zoom100', icon: SearchCheck, aliases: 'commands.aliases.zoom', run: () => zoomToPercent(100) },
  zoomIn: { section: 'view', label: 'commands.zoomIn', icon: ZoomIn, aliases: 'commands.aliases.zoom', keys: ['zoomIn'], run: () => stepZoom(1) },
  zoomOut: { section: 'view', label: 'commands.zoomOut', icon: ZoomOut, aliases: 'commands.aliases.zoom', keys: ['zoomOut'], run: () => stepZoom(-1) },
  tabPiece: { section: 'view', label: 'commands.tabPiece', icon: PanelRight, aliases: 'commands.aliases.tabs', keys: ['tabPiece'], run: () => focusPropsTab('piece') },
  tabProject: { section: 'view', label: 'commands.tabProject', icon: PanelRight, aliases: 'commands.aliases.tabs', keys: ['tabProject'], run: () => focusPropsTab('project') },
  pieces: { section: 'view', label: 'commands.pieces', icon: List, aliases: 'commands.aliases.pieces', keys: ['pieces'], run: focusPieces },

  // Preferences
  prefs: { section: 'prefs', label: 'commands.prefs', icon: Settings, aliases: 'commands.aliases.prefs', run: () => openPrefs() },
  unitMm: unit('mm'),
  unitCm: unit('cm'),
  unitIn: unit('in'),
  themeAuto: theme('auto'),
  themeLight: theme('light'),
  themeDark: theme('dark'),
  language: { section: 'prefs', label: 'commands.language', icon: Languages, aliases: 'commands.aliases.language', choices: languageChoices },
} satisfies Record<string, Definition>;

export type CommandId = keyof typeof DEFINITIONS;

/** Every command id, in the order the palette lists them within their section. */
export const COMMAND_IDS = Object.keys(DEFINITIONS) as CommandId[];

/** The command `id` with its texts and state as they are now. */
export function command(id: CommandId): Command {
  const d: Definition = DEFINITIONS[id];
  return {
    id,
    section: d.section,
    label: typeof d.label === 'function' ? d.label() : t(d.label),
    icon: d.icon,
    aliases: d.aliases ? t(d.aliases) : '',
    keys: d.keys ?? [],
    disabled: d.disabled?.() ?? null,
    current: d.current?.() ?? false,
    run: d.run ?? null,
    choices: d.choices ?? null,
  };
}

/** Every command, as they are now. */
export const commands = () => COMMAND_IDS.map(command);

/**
 * Runs command `id` reached by `route` (a menu, the palette), or `run` (a
 * value of it the palette chose), and reports it to the usage tips with
 * whether a shortcut for it shows next to it.
 */
export function runCommand(id: CommandId, route: Route, run?: () => void) {
  const d: Definition = DEFINITIONS[id];
  (run ?? d.run)?.();
  used(id, route, { keyed: !!shownShortcut({ keys: d.keys ?? [] }, getPrefs().singleKeys) });
}

/**
 * The keys shown next to a command and its aria-keyshortcuts: its first
 * shortcut that works now (a single-key one only while those are on), or null.
 */
export function shownShortcut(c: Pick<Command, 'keys'>, singleKeys: boolean): { kbd: string; aria?: string } | null {
  for (const name of c.keys) {
    const keys: ShortcutKeys = SHORTCUTS[name];
    if (keys.kbd && (!keys.single || singleKeys)) return { kbd: keys.kbd, aria: keys.aria };
  }
  return null;
}

// ---------- The shortcuts dialog's rows ----------

/** A row of the shortcuts dialog: its keys (keyLabel names, alternatives to each other) and what they do. */
export interface KeyRow {
  id: string;
  section: CommandSection;
  keys: readonly string[];
  text: string;
  /** Other words that find it (a command's). */
  aliases: string;
  /** Single-key ones: they do nothing while «Atajos de 1 tecla» is off. */
  single: boolean;
}

/** The keys that aren't commands: they act on what has the focus, or go with the pointer. */
const KEY_ROWS: readonly { id: string; section: CommandSection; keys: readonly string[]; text: CopyKey; single?: boolean; first?: boolean }[] = [
  { id: 'palette', section: 'general', keys: [SHORTCUTS.palette.kbd], text: 'palette.title', first: true },
  { id: 'tab', section: 'general', keys: ['Tab', 'Shift+Tab'], text: 'shortcuts.rows.tab' },
  { id: 'escape', section: 'general', keys: ['Escape'], text: 'shortcuts.rows.escape' },
  { id: 'move', section: 'selection', keys: ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'], text: 'shortcuts.rows.move' },
  { id: 'scale', section: 'selection', keys: ['Plus', 'Minus'], text: 'shortcuts.rows.scale', single: true },
  { id: 'toolbar', section: 'selection', keys: ['Enter', 'Space'], text: 'shortcuts.rows.toolbar' },
  { id: 'toggle', section: 'selection', keys: ['Shift+Space', 'Shift+Enter'], text: 'shortcuts.rows.toggleSelect' },
  { id: 'click', section: 'selection', keys: ['Shift+Click', 'Mod+Click'], text: 'shortcuts.rows.clickSelect' },
  { id: 'menu', section: 'selection', keys: ['Shift+F10', 'ContextMenu'], text: 'shortcuts.rows.menu' },
  { id: 'double-click', section: 'selection', keys: ['DoubleClick'], text: 'shortcuts.rows.doubleClick' },
  { id: 'crop-keys', section: 'selection', keys: [SHORTCUTS.cropApply.kbd, SHORTCUTS.cropCancel.kbd], text: 'shortcuts.rows.cropKeys' },
  { id: 'pages', section: 'sheets', keys: ['PageUp', 'PageDown'], text: 'shortcuts.rows.pages' },
  { id: 'send-page', section: 'sheets', keys: ['Shift+PageUp', 'Shift+PageDown'], text: 'shortcuts.rows.sendPage' },
  { id: 'wheel', section: 'view', keys: ['Mod+Wheel'], text: 'shortcuts.rows.wheel' },
  { id: 'pan', section: 'view', keys: ['Space+Drag'], text: 'shortcuts.rows.pan' },
];

/**
 * Every row of the shortcuts dialog, section by section: the commands with
 * keys (by their name; a command with single-key and other keys gets a row for
 * each kind) and the keys that aren't commands. `params`: for the texts with
 * lengths (the arrows' steps in the chosen unit).
 */
export function shortcutRows(params: Record<string, string> = {}): KeyRow[] {
  const keyRow = (row: (typeof KEY_ROWS)[number]): KeyRow => ({ id: row.id, section: row.section, keys: row.keys, text: t(row.text, params), aliases: '', single: !!row.single });
  const all = commands();
  return SECTIONS.flatMap((section) => {
    const rows = KEY_ROWS.filter((row) => row.section === section && row.first).map(keyRow);
    for (const c of all.filter((c) => c.section === section)) {
      for (const single of [false, true]) {
        const names = c.keys.filter((name) => !!(SHORTCUTS[name] as ShortcutKeys).single === single);
        const keys = names.map((name) => (SHORTCUTS[name] as ShortcutKeys).kbd!);
        if (keys.length) rows.push({ id: single ? `${c.id}-key` : c.id, section, keys, text: c.label, aliases: c.aliases, single });
      }
    }
    return [...rows, ...KEY_ROWS.filter((row) => row.section === section && !row.first).map(keyRow)];
  });
}

/** Is `id` one of the commands (e.g. a recent one saved by an older version)? */
export const isCommandId = (id: string): id is CommandId => Object.hasOwn(DEFINITIONS, id);
