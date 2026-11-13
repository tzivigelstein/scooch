// Fechas relativas y tamaños para mostrar («hace 5 minutos», «3,2 MB»), con
// los datos de idioma de Intl. Módulo puro.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const formats = new Map();
const cached = (key, make) => {
  if (!formats.has(key)) formats.set(key, make());
  return formats.get(key);
};

/**
 * Cuándo fue `then` respecto de `now` (ms): «ahora», «hace 3 minutos», «hace
 * 2 horas», «ayer», «hace 4 días»; desde una semana, la fecha («12 nov 2026»,
 * con el año solo si no es el actual).
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

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'];

/** Bytes para mostrar: «820 B», «3,2 MB», «1,5 GB» (base 1000, como los sistemas). */
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
