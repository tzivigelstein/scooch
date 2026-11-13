#!/usr/bin/env node
// Builds e2e/ledger.csv from the browser suites that ran with the old runner
// (e2e/suites/*.cjs, `node e2e/run.mjs`): one row per check that ran (the
// PASS/FAIL lines of e2e/out/logs/<suite>.log), plus one per state the axe
// suites without check() scanned (e2e/out/<suite>.json), plus the detectors of
// the screenshots suite (which never asserted). Each row gets the line of the
// check() call that produced it and that call's condition, so the ledger says
// what each check asserted. Destinations start empty; see check-ledger.mjs.
//
// Run it after a full run of the old suites: node e2e/scripts/build-ledger.mjs
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatCsv, LEDGER_COLUMNS } from './ledger-csv.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const E2E = resolve(HERE, '..');
const SUITES = join(E2E, 'suites');
const LOGS = join(E2E, 'out', 'logs');
const OUT = join(E2E, 'out');

/** Index of the character that closes the bracket opened at `open` (skipping strings, templates, comments). */
function scanTo(src, start, stops) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"') {
      i = skipString(src, i);
      continue;
    }
    if (c === '`') {
      i = skipTemplate(src, i);
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i) + 1;
      continue;
    }
    if (c === '/' && isRegexStart(src, i)) {
      i = skipRegex(src, i);
      continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      if (depth === 0 && stops.includes(c)) return i;
      depth--;
    } else if (depth === 0 && stops.includes(c)) return i;
  }
  return -1;
}

function skipString(src, i) {
  const q = src[i];
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === q) return i;
  }
  return i;
}

function skipTemplate(src, i) {
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === '`') return i;
    else if (src[i] === '$' && src[i + 1] === '{') i = scanTo(src, i + 2, '}');
  }
  return i;
}

function isRegexStart(src, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  return j < 0 || '(,=:[!&|?{};'.includes(src[j]) || /\b(return|typeof)$/.test(src.slice(Math.max(0, j - 6), j + 1));
}

function skipRegex(src, i) {
  let inClass = false;
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') i++;
    else if (src[i] === '[') inClass = true;
    else if (src[i] === ']') inClass = false;
    else if (src[i] === '/' && !inClass) break;
  }
  while (/[a-z]/.test(src[i + 1] ?? '')) i++;
  return i;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A regex for the labels a check() label argument can produce, and how specific it is. */
function labelPattern(arg) {
  const a = arg.trim();
  if (/^(['"])/.test(a) && skipString(a, 0) === a.length - 1) {
    const text = Function(`return ${a}`)();
    return { re: new RegExp(`^${escapeRe(text)}$`), weight: text.length + 1000 };
  }
  if (a.startsWith('`') && skipTemplate(a, 0) === a.length - 1) {
    let re = '';
    let weight = 0;
    for (let i = 1; i < a.length - 1; i++) {
      if (a[i] === '$' && a[i + 1] === '{') {
        i = scanTo(a, i + 2, '}');
        re += '(.*?)';
      } else if (a[i] === '\\') {
        const text = Function(`return \`${a.slice(i, i + 2)}\``)();
        re += escapeRe(text);
        weight++;
        i++;
      } else {
        re += escapeRe(a[i]);
        weight++;
      }
    }
    return { re: new RegExp(`^${re}$`, 's'), weight };
  }
  // A variable or an expression: could be anything.
  return { re: /^.*$/s, weight: -1 };
}

/** The check() calls of a suite: line, label pattern and condition source. */
function checkCalls(src) {
  const calls = [];
  const re = /(?<![\w.$])check\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const start = m.index + m[0].length;
    const labelEnd = scanTo(src, start, ',)');
    if (labelEnd < 0 || src[labelEnd] !== ',') continue;
    const condEnd = scanTo(src, labelEnd + 1, ',)');
    if (condEnd < 0) continue;
    const line = src.slice(0, m.index).split('\n').length;
    // Skip the definition `const check = (name, ok, detail) => …`.
    if (/^\s*name\s*$/.test(src.slice(start, labelEnd))) continue;
    calls.push({ line, ...labelPattern(src.slice(start, labelEnd)), asserts: src.slice(labelEnd + 1, condEnd).replace(/\s+/g, ' ').trim() });
  }
  return calls;
}

/** The PASS/FAIL labels in a suite's log, in order. */
function ranChecks(log) {
  return log
    .split('\n')
    .map((line) => line.match(/^(PASS|FAIL) {2}(.*)$/))
    .filter(Boolean)
    .map((m) => m[2].split('  — ')[0]);
}

const short = (s, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const rows = [];
const suites = readdirSync(SUITES)
  .filter((f) => f.endsWith('.cjs'))
  .map((f) => f.replace(/\.cjs$/, ''))
  .sort();
const missing = [];
for (const suite of suites) {
  const src = readFileSync(join(SUITES, `${suite}.cjs`), 'utf8');
  const calls = checkCalls(src);
  const logFile = join(LOGS, `${suite}.log`);
  if (!existsSync(logFile)) {
    missing.push(suite);
    continue;
  }
  let n = 0;
  for (const label of ranChecks(readFileSync(logFile, 'utf8'))) {
    const call = calls.filter((c) => c.re.test(label)).sort((a, b) => b.weight - a.weight)[0];
    rows.push({ id: `${suite}:${++n}`, suite, line: call ? String(call.line) : '', label, asserts: short(call ? call.asserts : ''), destination: '' });
  }
  // The axe suites without check(): one row per scanned state.
  const states = join(OUT, `${suite}.json`);
  if (!calls.length && existsSync(states)) {
    const scanLine = src.split('\n').findIndex((l) => /new AxeBuilder/.test(l)) + 1;
    for (const state of JSON.parse(readFileSync(states, 'utf8'))) {
      rows.push({ id: `${suite}:${++n}`, suite, line: String(scanLine), label: `axe: ${state.label}`, asserts: 'no axe violations (wcag2a, wcag2aa, wcag21a, wcag21aa, best-practice) in this state', destination: '' });
    }
  }
}

// screenshots never called check(): in each state its detector printed clipped
// texts and wrapped one-line controls, and the suite passed anyway. One row per
// state it looked at (the same states as its screenshots).
{
  const src = readFileSync(join(SUITES, 'screenshots.cjs'), 'utf8');
  const line = String(src.split('\n').findIndex((l) => /const issues = await p\.evaluate\(OVERFLOW\)/.test(l)) + 1);
  const shots = ['1-proyectos-vacio', '2-varias-hojas', '3-lista-agrupada', '3b-arrastrando-afuera', '3c-soltada-afuera', '4-confirmar-quitar-hoja', '5-final-agregar-hoja', '6-papel-personalizado-error', '7-preferencias', '8-proyectos'];
  let n = 0;
  for (const scheme of ['light', 'dark'])
    for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]])
      for (const shot of shots) {
        if (shot === '3-lista-agrupada' && w >= 1100) continue;
        rows.push({ id: `screenshots:${++n}`, suite: 'screenshots', line, label: `${w}x${h} ${scheme} ${shot}: no clipped text, no wrapped one-line control`, asserts: 'nothing: OVERFLOW() findings were printed and the suite exited 0', destination: '' });
      }
}

writeFileSync(join(E2E, 'ledger.csv'), formatCsv(LEDGER_COLUMNS, rows));
console.log(`${rows.length} rows from ${suites.length - missing.length} suites${missing.length ? ` (no log for: ${missing.join(', ')})` : ''}`);
const unmatched = rows.filter((r) => !r.line);
if (unmatched.length) console.log(`${unmatched.length} rows without a check() line:\n${unmatched.map((r) => `  ${r.id} ${r.label}`).join('\n')}`);
