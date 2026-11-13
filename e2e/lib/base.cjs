// Shared helpers for the browser suites (run them with `yarn e2e`, see e2e/run.mjs).
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:4317/';
const FIX = path.resolve(__dirname, '../fixtures');
const OUT = path.resolve(__dirname, '../out');
fs.mkdirSync(OUT, { recursive: true });

function makeChecker(title) {
  const results = [];
  let failures = 0;
  const check = (name, ok, detail = '') => {
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    if (!ok) failures++;
    return ok;
  };
  const report = () => {
    console.log(`\n=== ${title} ===`);
    console.log(results.join('\n'));
    console.log(`\n${results.length - failures}/${results.length} OK`);
    return failures;
  };
  process.on('exit', (code) => {
    if (code === 2) report();
  });
  return { check, report, get failures() { return failures; } };
}

// Default: Chromium's headless shell (no built-in PDF viewer, so printing opens another tab).
// With { channel: 'chromium' }: full Chromium in headless mode (with the PDF viewer).
const launch = ({ channel, ...opts } = {}) => chromium.launch({ ...(channel === 'chromium' ? { channel } : {}), ...opts });

async function open({ viewport = { width: 1440, height: 900 }, colorScheme = 'light', reducedMotion = 'reduce', storage = null, launch: launchOpts = {}, init = [] } = {}) {
  const browser = await launch(launchOpts);
  const context = await browser.newContext({ viewport, colorScheme, reducedMotion, acceptDownloads: true });
  if (storage) await context.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  for (const script of init) await context.addInitScript(script);
  const page = await context.newPage();
  const errors = [];
  // With E2E_CONSOLE=strict (yarn e2e --dev --strict-console), warnings count too.
  const strict = process.env.E2E_CONSOLE === 'strict';
  page.on('console', (m) => {
    if (m.type() === 'error' || (strict && m.type() === 'warning')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  await page.goto(BASE);
  await page.waitForSelector('#paper option', { state: 'attached' });
  // El proyecto se restaura (o se crea) de forma asíncrona al abrir.
  await page.waitForFunction(() => !document.body.classList.contains('is-loading'));
  return { browser, context, page, errors };
}

// Geometría leída del DOM, en mm (x/y de cada pieza relativas a su hoja).
const GEOM = () => {
  const label = document.getElementById('paper-label').textContent;
  const m = label.match(/· ([\d.,]+)\s×\s([\d.,]+)\smm/);
  const W = parseFloat(m[1].replace(',', '.'));
  const H = parseFloat(m[2].replace(',', '.'));
  const box = document.querySelector('#sheets .sheet-box');
  const zoom = parseFloat(box.style.width) / W;
  const pill = document.getElementById('pill');
  const pieces = [...document.querySelectorAll('#sheets .piece')].map((p) => ({
    id: p.dataset.id,
    sheet: p.closest('.page')?.dataset.sheet,
    x: parseFloat(p.style.left) / zoom,
    y: parseFloat(p.style.top) / zoom,
    w: parseFloat(p.style.width) / zoom,
    h: parseFloat(p.style.height) / zoom,
    label: p.getAttribute('aria-label'),
    name: p.getAttribute('aria-label').split(',')[0].replace(/ \(página \d+\)$/, ''),
    rot: Number((p.querySelector('img').style.transform.match(/rotate\((\d+)deg\)/) || [0, 0])[1]),
    active: p.classList.contains('is-selected'),
  }));
  return {
    W,
    H,
    zoom,
    margin: parseFloat(document.getElementById('margin').value.replace(',', '.')),
    gap: parseFloat(document.getElementById('gap').value.replace(',', '.')),
    pieces,
    notice: pill.hidden ? '' : document.getElementById('pill-text').textContent.trim().replace(/ /g, ' '),
    warn: !pill.hidden && pill.dataset.tone === 'warning',
    action: pill.hidden || document.getElementById('pill-action').hidden ? '' : document.getElementById('pill-action').textContent.replace(/ /g, ' '),
  };
};

function overlaps(pieces, gap = 0, eps = 0.02) {
  const bad = [];
  for (let i = 0; i < pieces.length; i++)
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      if (a.sheet !== b.sheet) continue; // solo chocan las de la misma hoja
      if (a.x < b.x + b.w + gap - eps && b.x < a.x + a.w + gap - eps && a.y < b.y + b.h + gap - eps && b.y < a.y + a.h + gap - eps)
        bad.push([a.name, b.name]);
    }
  return bad;
}

function outsideMargin(g, eps = 0.02) {
  return g.pieces.filter(
    (p) => p.x < g.margin - eps || p.y < g.margin - eps || p.x + p.w > g.W - g.margin + eps || p.y + p.h > g.H - g.margin + eps
  );
}

function helpers(page) {
  const geom = () => page.evaluate(GEOM);
  const count = () => page.locator('#sheets .piece').count();
  const waitIdle = () =>
    page.waitForFunction(() => !/Cargando|Creando|Preparando/.test(document.getElementById('pill').hidden ? '' : document.getElementById('pill-text').textContent), null, { timeout: 30000 });
  const load = async (...names) => {
    await page.locator('#file').setInputFiles(names.map((n) => path.join(FIX, n)));
    await page.waitForTimeout(50);
    await waitIdle();
  };
  const pieceByName = (name) => page.locator(`#sheets .piece[aria-label^="${name}"]`);
  const clickPiece = async (locatorOrIndex) => {
    const loc = typeof locatorOrIndex === 'number' ? page.locator('#sheets .piece').nth(locatorOrIndex) : locatorOrIndex;
    const box = await loc.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const covered = await loc.evaluate((el, [x, y]) => document.elementFromPoint(x, y)?.closest('.piece') !== el, [cx, cy]);
    if (covered) await loc.focus();
    else await page.mouse.click(cx, cy);
  };
  const active = () => page.evaluate(() => {
    const el = document.activeElement;
    return { id: el.id, tag: el.tagName, cls: el.className?.baseVal ?? el.className, label: el.getAttribute('aria-label'), piece: el.classList.contains('piece') ? el.dataset.id : null };
  });
  const openMeasures = async () => {
    if (!(await page.locator('#pos-x').isVisible())) {
      if (await page.locator('#props-toggle').isVisible()) await page.click('#props-toggle');
    }
    await page.waitForSelector('#pos-x', { state: 'visible' });
  };
  const openSheet = async () => {
    if (!(await page.locator('#paper').isVisible())) {
      if (await page.locator('#props-toggle').isVisible()) await page.click('#props-toggle');
      const toggle = page.locator('[aria-controls="section-sheet"]');
      if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    }
    await page.waitForSelector('#paper', { state: 'visible' });
  };
  const closePopover = async () => {
    if (!(await page.evaluate(() => !!document.activeElement.closest('.panel')))) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(30);
  };
  const setMeasure = async (id, value) => {
    await openMeasures();
    await page.fill(`#${id}`, String(value));
    await page.locator(`#${id}`).dispatchEvent('change');
  };
  const drag = async (loc, dxPx, dyPx, steps = 12) => {
    const box = await loc.boundingBox();
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(sx + (dxPx * i) / steps, sy + (dyPx * i) / steps);
    await page.mouse.up();
    await page.waitForTimeout(30);
  };
  return { geom, count, waitIdle, load, pieceByName, clickPiece, active, openMeasures, openSheet, closePopover, setMeasure, drag };
}

const norm = (s) => String(s ?? '').replace(/ /g, ' ');

module.exports = { norm, open, launch, makeChecker, helpers, overlaps, outsideMargin, GEOM, BASE, FIX, OUT, path, fs };
