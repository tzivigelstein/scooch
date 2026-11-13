// Reading and writing e2e/ledger.csv (RFC 4180: fields with commas, quotes or
// line breaks go between double quotes, and their quotes are doubled).

export const LEDGER_COLUMNS = ['id', 'suite', 'line', 'label', 'asserts', 'destination'];

const field = (value) => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const formatCsv = (columns, rows) => `${[columns.join(','), ...rows.map((row) => columns.map((c) => field(row[c])).join(','))].join('\n')}\n`;

export function parseCsv(text) {
  const records = [];
  let record = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      record.push(value);
      value = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      record.push(value);
      records.push(record);
      record = [];
      value = '';
    } else value += c;
  }
  if (value || record.length) {
    record.push(value);
    records.push(record);
  }
  const [columns, ...rows] = records;
  return { columns, rows: rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? '']))) };
}
