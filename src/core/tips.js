// Usage tips: when someone does something the slow way again and again, the
// app offers the faster way, once. Pure module: which uses count toward which
// tip (noteUse) and which tip to show now, if any (decideTip). The table of
// tips, their texts and the showing are in state/tips.ts.
//
// A tip's count is kept per session and, for the ones that say so, in total
// (across sessions, in this browser). Tips about the same thing share a
// topic: «No volver a mostrar», showing it this session or doing it the fast
// way (`knownBy`) silences the whole topic.

/** The ways an action is reached. */
export const ROUTES = Object.freeze(['pointer', 'touch', 'keyboard', 'menu', 'palette', 'shortcut', 'gesture']);

/** At most one tip every `cooldown` ms, and `perSession` tips per page load. */
export const TIP_LIMITS = Object.freeze({ cooldown: 5 * 60_000, perSession: 2 });

export const topicOf = (tip) => tip.topic ?? tip.id;

const fits = (rule, event) => (!rule.actions || rule.actions.includes(event.action)) && (!rule.routes || rule.routes.includes(event.route));

/** The key of one action's count for a tip that counts each action apart (`each`). */
const eachKey = (tip, action) => `${tip.id}:${action}`;

/**
 * The counts after `event`: an action reached by a route (`{action, route,
 * keyed}`; `keyed`: a shortcut for it was shown right there), or how long a
 * repetition the app watches for is now (`{pattern, n}`). Returns the same
 * objects for what didn't change (`counts.total` and `counts.known` are what
 * gets saved).
 */
export function noteUse(tips, counts, event) {
  let session = counts.session;
  let total = counts.total;
  let known = counts.known;
  const set = (id, n) => {
    if ((session[id] ?? 0) !== n) session = { ...session, [id]: n };
  };
  if ('pattern' in event) {
    for (const tip of tips) if ('pattern' in tip.when && tip.when.pattern === event.pattern) set(tip.id, event.n);
    return session === counts.session ? counts : { session, total, known };
  }
  // An action another tip counts belongs to that tip: the ones that count each other action skip it.
  const claimed = (tip) => tips.some((other) => other !== tip && other.when.actions?.includes(event.action));
  for (const tip of tips) {
    const topic = topicOf(tip);
    if (tip.knownBy?.some((rule) => fits(rule, event)) && !known.includes(topic)) known = [...known, topic];
    const when = tip.when;
    if ('pattern' in when || !fits(when, event) || (when.keyless && event.keyed !== false)) continue;
    if (when.each) {
      if (claimed(tip)) continue;
      const key = eachKey(tip, event.action);
      const n = (session[key] ?? 0) + 1;
      set(key, n);
      set(tip.id, Math.max(n, session[tip.id] ?? 0));
      continue;
    }
    set(tip.id, (session[tip.id] ?? 0) + 1);
    if (tip.total !== undefined) total = { ...total, [tip.id]: (total[tip.id] ?? 0) + 1 };
  }
  return session === counts.session && total === counts.total && known === counts.known ? counts : { session, total, known };
}

/** The counts with a tip's back at zero (it just showed: it needs as many uses again). */
export function forgetCounts(tip, counts) {
  const prefix = `${tip.id}:`;
  const session = Object.fromEntries(Object.entries(counts.session).filter(([key]) => key !== tip.id && !key.startsWith(prefix)));
  const total = tip.id in counts.total ? Object.fromEntries(Object.entries(counts.total).filter(([key]) => key !== tip.id)) : counts.total;
  return { session, total, known: counts.known };
}

const reached = (threshold, n) => threshold !== undefined && (n ?? 0) >= threshold;

/**
 * The tip to show now, the first of `tips` (in their order) that is due, or
 * null: none while tips are off, after `limits.perSession` this session or
 * within `limits.cooldown` ms of the last one; never one whose topic was
 * dismissed, already shown this session or is known; never a keyboard one
 * on a touch-only device, nor one meant for the other state of «Atajos de 1
 * tecla».
 */
export function decideTip(tips, state, limits = TIP_LIMITS) {
  if (!state.on || state.shown.length >= limits.perSession) return null;
  if (state.lastShownAt !== null && state.now - state.lastShownAt < limits.cooldown) return null;
  return (
    tips.find((tip) => {
      const topic = topicOf(tip);
      if (state.dismissed.includes(topic) || state.shown.includes(topic) || state.known.includes(topic)) return false;
      if (tip.keys && state.touchOnly) return false;
      if (tip.singleKeys !== undefined && tip.singleKeys !== state.singleKeys) return false;
      return reached(tip.session, state.session[tip.id]) || reached(tip.total, state.total[tip.id]);
    }) ?? null
  );
}
