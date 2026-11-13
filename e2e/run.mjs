#!/usr/bin/env node
// Runs the browser suites in e2e/suites against a local server: by default the
// production build (`vite build` + `vite preview`), or the dev server with --dev.
//
//   yarn e2e                        build, serve and run every suite
//   yarn e2e --no-build             reuse the current dist/
//   yarn e2e --dev                  run against `vite` (dev mode); with
//                                   --strict-console, console warnings fail too
//   yarn e2e --only a-papers,axe    run some suites (names without .cjs)
//   yarn e2e --jobs 3               run suites in parallel (timings get noisier)
//   yarn e2e --parity URL           also run c-export-parity against the build at URL
//
// Logs go to e2e/out/logs/<suite>.log and a summary to e2e/out/logs/summary.txt.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SUITES = join(HERE, 'suites');
const LOGS = join(HERE, 'out', 'logs');
const VITE = join(ROOT, 'node_modules', '.bin', 'vite');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const dev = flag('--dev');
const build = !dev && !flag('--no-build');
const port = Number(option('--port', process.env.E2E_PORT ?? 4317));
const jobs = Math.max(1, Number(option('--jobs', 1)));
const only = option('--only')?.split(',').map((name) => name.trim().replace(/\.cjs$/, ''));
const parity = option('--parity', process.env.PARITY_BASE ?? null);
const base = `http://127.0.0.1:${port}/`;

// Suites that only make sense against the production build.
const BUILD_ONLY = new Set(['smoke-build', 'copy-check']);

function run(command, commandArgs, options = {}) {
  return new Promise((done) => {
    const child = spawn(command, commandArgs, { cwd: ROOT, stdio: 'inherit', ...options });
    child.on('exit', (code) => done(code ?? 1));
  });
}

async function waitFor(url, ms = 30000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function startServer() {
  const serverArgs = dev
    ? ['--host', '127.0.0.1', '--port', String(port), '--strictPort']
    : ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  const server = spawn(VITE, serverArgs, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  server.stderr.on('data', (chunk) => (output += chunk));
  return { server, output: () => output };
}

function summarize(name, log) {
  const lines = log.split('\n');
  const totals = lines.filter((line) => /\d+\/\d+ OK|estados|states/.test(line)).slice(-2);
  return totals.map((line) => line.trim()).join(' · ');
}

async function runSuite(name) {
  const started = Date.now();
  const env = { ...process.env, BASE: base, ...(dev && flag('--strict-console') ? { E2E_CONSOLE: 'strict' } : {}) };
  if (parity) env.PARITY_BASE = parity;
  let log = '';
  const code = await new Promise((done) => {
    const child = spawn(process.execPath, [join(SUITES, `${name}.cjs`)], { cwd: SUITES, env });
    child.stdout.on('data', (chunk) => (log += chunk));
    child.stderr.on('data', (chunk) => (log += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), 25 * 60_000);
    child.on('exit', (exitCode) => {
      clearTimeout(timer);
      done(exitCode ?? 1);
    });
  });
  writeFileSync(join(LOGS, `${name}.log`), log);
  const seconds = Math.round((Date.now() - started) / 1000);
  return { name, code, seconds, summary: summarize(name, log) };
}

async function main() {
  mkdirSync(LOGS, { recursive: true });
  let names = readdirSync(SUITES)
    .filter((file) => file.endsWith('.cjs'))
    .map((file) => file.replace(/\.cjs$/, ''))
    .sort();
  if (only) names = names.filter((name) => only.includes(name));
  if (dev) names = names.filter((name) => !BUILD_ONLY.has(name));
  const skipped = [];
  if (!parity && names.includes('c-export-parity')) {
    names = names.filter((name) => name !== 'c-export-parity');
    skipped.push('c-export-parity (needs --parity URL)');
  }

  if (build && (await run(VITE, ['build', '--logLevel', 'warn'])) !== 0) process.exit(1);
  const { server, output } = startServer();
  const stop = () => {
    try {
      process.kill(-server.pid);
    } catch {
      // already gone
    }
  };
  process.on('exit', stop);
  process.on('SIGINT', () => process.exit(130));
  if (!(await waitFor(base))) {
    console.error(`The server did not start on ${base}\n${output()}`);
    process.exit(1);
  }

  const results = [];
  const queue = [...names];
  const worker = async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      const result = await runSuite(name);
      results.push(result);
      console.log(`${result.code === 0 ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${String(result.seconds).padStart(4)}s  ${result.summary}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, names.length) }, worker));
  stop();

  results.sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
  const failed = results.filter((result) => result.code !== 0);
  const summary = [
    ...results.map((r) => `${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.name}  ${r.seconds}s  ${r.summary}`),
    ...skipped.map((name) => `SKIP  ${name}`),
    `${results.length - failed.length}/${results.length} suites passed (${dev ? 'dev server' : 'production build'})`,
  ].join('\n');
  writeFileSync(join(LOGS, 'summary.txt'), `${summary}\n`);
  console.log(`\n${summary}`);
  if (failed.length) {
    for (const result of failed) {
      const log = readFileSync(join(LOGS, `${result.name}.log`), 'utf8');
      const failures = log.split('\n').filter((line) => line.startsWith('FAIL') || /Error|error/.test(line));
      console.log(`\n--- ${result.name}\n${failures.slice(0, 15).join('\n')}`);
    }
  }
  process.exit(failed.length ? 1 : 0);
}

main();
