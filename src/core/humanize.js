// Relative dates and sizes to show («5 minutes ago», «3.2 MB»), with Intl's
// language data.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const formats = new Map();
const cached = (key, make) => {
  if (!formats.has(key)) formats.set(key, make());
  return formats.get(key);
};

/**
 * When `then` was relative to `now` (ms): «now», «3 minutes ago», «2 hours
 * ago», «yesterday», «4 days ago»; from a week on, the date («Nov 12, 2026»,
 * with the year only when it isn't the current one).
 */
export function relativeTime(then, now = Date.now(), { locale = 'es' } = {}) {
  const rtf = cached(`rtf|${locale}`, () => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }));
  const diff = Math.max(0, now - then);
  if (diff < 45_000) return rtf.format(0, 'second');
  if (diff < HOUR) return rtf.format(-Math.max(1, Math.round(diff / MINUTE)), 'minute');
  if (diff < DAY) return rtf.format(-Math.round(diff / HOUR), 'hour');
  const days = Math.round(diff / DAY);
  if (days < 7) return rtf.format(-days, 'day');
  const sameYear = new Date(then).getFullYear() === new Date(now).getFullYear();
  const dtf = cached(`dtf|${locale}|${sameYear}`, () =>
    new Intl.DateTimeFormat(locale, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
  );
  return dtf.format(then);
}

/** From this share of the space on, using it is a warning. */
export const STORAGE_WARN = 0.8;

/**
 * How much of the browser's space is used, for a bar: `share` (0–1), the
 * whole percent to say (null when it rounds to 0 but something is used: «less
 * than 1 %»), the bar's visible `fill` (at least 2 % when anything is used,
 * so it never looks empty) and whether it is a `warning`. Null without a
 * quota (the browser doesn't say).
 */
export function storageShare(usage, quota) {
  if (!(quota > 0) || !Number.isFinite(usage)) return null;
  const share = Math.min(1, Math.max(0, usage / quota));
  const percent = Math.round(share * 100);
  return {
    share,
    percent: percent === 0 && usage > 0 ? null : percent,
    fill: usage > 0 ? Math.max(0.02, share) : 0,
    warning: share >= STORAGE_WARN,
  };
}

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];

/** Bytes to show: «820 B», «3.2 MB», «1.5 GB» (base 1000, as operating systems count). */
export function formatBytes(bytes, { locale = 'es' } = {}) {
  let value = Math.max(0, Number(bytes) || 0);
  let i = 0;
  while (value >= 1000 && i < UNITS.length - 1) {
    value /= 1000;
    i++;
  }
  const digits = i === 0 || value >= 100 ? 0 : 1;
  return cached(`b|${locale}|${i}|${digits}`, () =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: UNITS[i], unitDisplay: 'short', maximumFractionDigits: digits })
  ).format(value);
}
