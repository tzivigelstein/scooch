/**
 * How an action was reached: a control clicked (`pointer`), tapped (`touch`)
 * or activated with Enter or Space (`keyboard`); a menu entry; the command
 * palette; its keyboard shortcut; a gesture on the canvas (wheel, pinch).
 */
export type Route = 'pointer' | 'touch' | 'keyboard' | 'menu' | 'palette' | 'shortcut' | 'gesture';
export const ROUTES: readonly Route[];

/** Some actions (any, without `actions`) reached by some routes (any, without `routes`). */
export interface ActionRule {
  actions?: readonly string[];
  routes?: readonly Route[];
}

/** What counts toward a tip. */
export type TipTrigger =
  | (ActionRule & {
      /**
       * Each action counts apart and the tip's count is the highest: «the same
       * action again and again». An action that another tip counts doesn't.
       */
      each?: boolean;
      /** Only when no shortcut for it was shown where it was chosen. */
      keyless?: boolean;
    })
  | {
      /** A repetition the app watches for (state/tips.ts): the count is its length now. */
      pattern: string;
    };

export interface TipRule {
  id: string;
  /** Tips about the same thing share one (default: the id). */
  topic?: string;
  when: TipTrigger;
  /** It is due once its count reaches this within the session… */
  session?: number;
  /** …or this in total, across sessions (the count is saved). */
  total?: number;
  /** Doing any of these shows the fast way is known: the topic never shows again. */
  knownBy?: readonly ActionRule[];
  /** It is about the keyboard: never on a touch-only device. */
  keys?: boolean;
  /** Only while «Atajos de 1 tecla» is on (true) or off (false). */
  singleKeys?: boolean;
}

/** An action reached by a route, or how long a watched repetition is now. */
export type UsageEvent = { action: string; route: Route; keyed?: boolean } | { pattern: string; n: number };

export interface TipCounts {
  /** This session's counts, by tip id. */
  session: Readonly<Record<string, number>>;
  /** The counts across sessions (saved), by tip id. */
  total: Readonly<Record<string, number>>;
  /** The topics whose fast way the person already used (saved). */
  known: readonly string[];
}

export interface TipState {
  /** The «Consejos de uso» switch in Preferencias. */
  on: boolean;
  /** Topics with «No volver a mostrar». */
  dismissed: readonly string[];
  known: readonly string[];
  session: Readonly<Record<string, number>>;
  total: Readonly<Record<string, number>>;
  /** Topics shown this session. */
  shown: readonly string[];
  /** When the last tip showed (ms), or null. */
  lastShownAt: number | null;
  now: number;
  /** No mouse, trackpad or keyboard to speak of: only touch. */
  touchOnly: boolean;
  singleKeys: boolean;
}

export const TIP_LIMITS: Readonly<{ cooldown: number; perSession: number }>;

export function topicOf(tip: Pick<TipRule, 'id' | 'topic'>): string;
export function noteUse(tips: readonly TipRule[], counts: TipCounts, event: UsageEvent): TipCounts;
export function forgetCounts(tip: TipRule, counts: TipCounts): TipCounts;
export function decideTip<T extends TipRule>(tips: readonly T[], state: TipState, limits?: { cooldown: number; perSession: number }): T | null;
