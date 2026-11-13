#!/usr/bin/env node
// Checks e2e/ledger.csv, the record of where every check of the old browser
// suites (the custom scripts e2e/suites/*.cjs, removed once every check had a
// destination) went; see docs/testing.md. Fails when:
//   - a row has no destination;
//   - a destination isn't one of the kinds below;
//   - a destination points to a test that doesn't exist (by the test lists of
//     Playwright and Vitest, not by grepping), or to a file of another layer.
//
// Destinations («<test>» is `<file> › <describe> › … › <title>`, or the start of
// one, naming every test under a describe):
//   kept:e2e:<test>                 still a browser test
//   moved:<layer>:<test>            now a Vitest test of that layer
//   duplicate-of:<test>             a test that already asserted the same
//   fixed:<test> :: <what now>      it could not fail; now it asserts something
//   deleted:<reason>                gone, and why
// Any destination may end with « :: <note>».
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './ledger-csv.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER = join(ROOT, 'e2e/ledger.csv');

/** Where the tests of each layer live (the Vitest projects, and Playwright). */
const LAYERS = {
  e2e: ['e2e/specs/', 'e2e/support/'],
  unit: ['tests/core/'],
  properties: ['tests/properties/'],
  performance: ['tests/performance/'],
  state: ['tests/state/', 'tests/services/'],
  ui: ['tests/components/', 'tests/hooks/'],
};

const SEP = ' › ';

function playwrightTests() {
  const out = execFileSync(process.execPath, [join(ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '--list', '--reporter=json'], {
    cwd: ROOT,
    env: { ...process.env, E2E_WEBKIT: '' },
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8',
  });
  const report = JSON.parse(out);
  const titles = new Set();
  // Anonymous describes (test.describe(() => …)) have no title: Playwright leaves them out of a test's name.
  const walk = (suite, path) => {
    for (const spec of suite.specs ?? []) titles.add([...path, spec.title].join(SEP));
    for (const child of suite.suites ?? []) walk(child, child.title ? [...path, child.title] : path);
  };
  for (const file of report.suites ?? []) walk(file, [`e2e/specs/${file.file ?? file.title}`]);
  return titles;
}

function vitestTests() {
  const out = execFileSync(process.execPath, [join(ROOT, 'node_modules/vitest/vitest.mjs'), 'list', '--json'], {
    cwd: ROOT,
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8',
  });
  const titles = new Set();
  for (const test of JSON.parse(out.slice(out.indexOf('[')))) titles.add([relative(ROOT, test.file), ...test.name.split(' > ')].join(SEP));
  return titles;
}

const { rows } = parseCsv(readFileSync(LEDGER, 'utf8'));
const problems = [];
const kinds = {};

const needsTests = rows.some((r) => /^(kept|moved|duplicate-of|fixed):/.test(r.destination));
const known = needsTests ? new Set([...playwrightTests(), ...vitestTests()]) : new Set();
const exists = (ref) => {
  if (known.has(ref)) return true;
  const prefix = ref + SEP;
  for (const title of known) if (title.startsWith(prefix)) return true;
  // A fixture (e2e/support/…) that guards every test: its file names it.
  const [file, name] = ref.split(SEP);
  return file.startsWith('e2e/support/') && name && existsSync(join(ROOT, file)) && readFileSync(join(ROOT, file), 'utf8').includes(name);
};

function checkRef(row, ref, layer) {
  if (!ref) return problems.push(`${row.id}: no test named in «${row.destination}»`);
  const file = ref.split(SEP)[0];
  if (layer && !LAYERS[layer].some((dir) => file.startsWith(dir))) problems.push(`${row.id}: ${file} is not a ${layer} test file (${LAYERS[layer].join(', ')})`);
  if (!exists(ref)) problems.push(`${row.id}: no such test: ${ref}`);
}

for (const row of rows) {
  const destination = row.destination.trim();
  const main = destination.split(' :: ')[0];
  if (!destination) {
    problems.push(`${row.id}: no destination`);
    continue;
  }
  const kind = main.match(/^(kept:e2e|moved:\w+|duplicate-of|fixed|deleted):/)?.[1];
  kinds[kind?.startsWith('moved:') ? 'moved' : (kind ?? 'unknown')] = (kinds[kind?.startsWith('moved:') ? 'moved' : (kind ?? 'unknown')] ?? 0) + 1;
  if (!kind) {
    problems.push(`${row.id}: unknown destination «${destination}»`);
    continue;
  }
  const rest = main.slice(kind.length + 1).trim();
  if (kind === 'deleted') {
    if (!rest) problems.push(`${row.id}: deleted without a reason`);
  } else if (kind === 'kept:e2e') checkRef(row, rest, 'e2e');
  else if (kind.startsWith('moved:')) {
    const layer = kind.slice('moved:'.length);
    if (!LAYERS[layer] || layer === 'e2e') problems.push(`${row.id}: unknown layer «${layer}» (one of ${Object.keys(LAYERS).filter((l) => l !== 'e2e').join(', ')})`);
    else checkRef(row, rest, layer);
  } else if (kind === 'duplicate-of') checkRef(row, rest, null);
  else if (kind === 'fixed') {
    if (!destination.includes(' :: ')) problems.push(`${row.id}: fixed, but without « :: what it asserts now»`);
    checkRef(row, rest, null);
  }
}

const summary = Object.entries(kinds)
  .map(([k, n]) => `${k} ${n}`)
  .join(' · ');
console.log(`ledger: ${rows.length} rows${summary ? ` · ${summary}` : ''}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.slice(0, 200).join('\n')}${problems.length > 200 ? '\n…' : ''}`);
  process.exit(1);
}
