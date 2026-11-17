#!/usr/bin/env node
// The README's screenshots (docs/images/*.webp), taken from the production
// build in Chromium, with the interface in English. Run it again whenever a
// change shows in one of them:
//
//   yarn screenshots                    every screenshot
//   yarn screenshots editor cut-lines   only those (the names in SHOTS below)
//
// It builds the app into a temporary folder, serves it with `vite preview` on
// 127.0.0.1:4800 (SCREENSHOTS_PORT), drives it like a person would and stops
// the server. Needs Playwright's Chromium (`yarn playwright install chromium`).
// It is not a test: nothing runs it but this command.
//
// The pictures are drawn here (simple shapes, no photos, nothing from anyone
// else) and the clock, the viewport, the motion and the storage figures are
// fixed, so two runs give the same images unless the interface changed. (One
// exception, seen in about one run in six: editor-dark, with a piece
// selected, can come out with pixels a level or two off along the frame and
// the images, too faint to see. Don't commit it again for that alone.)

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/images');
const PORT = Number(process.env.SCREENSHOTS_PORT ?? 4800);
const BASE = `http://127.0.0.1:${PORT}/`;
const VITE = join(ROOT, 'node_modules/vite/bin/vite.js');

/** WebP quality for the screenshots: high enough that text stays sharp. */
const QUALITY = 0.92;

/** Every page starts on this day (the projects list says how long ago each was changed). */
const DAY = Date.UTC(2026, 2, 12, 10, 0);
const HOUR = 3_600_000;

// ---------- Sample pictures ----------

/**
 * Draws the sample pictures in a blank page and returns them as files for a
 * file input. Sizes are in pixels; the app reads them at 300 ppi, so 1500 px
 * is 127 mm.
 */
async function drawPictures(browser) {
  const page = await browser.newPage();
  const pictures = await page.evaluate(() => {
    // A seeded random, so the stars are the same every run.
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

    function canvas(w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return [c, c.getContext('2d')];
    }
    const gradient = (ctx, y0, y1, stops) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      stops.forEach((color, i) => g.addColorStop(i / (stops.length - 1), color));
      return g;
    };
    /** A band from y = f(x) down to the bottom. */
    function band(ctx, w, h, f, color) {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 4) ctx.lineTo(x, f(x));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }
    function disc(ctx, x, y, r, color) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    const meadow = () => {
      const [c, ctx] = canvas(1500, 1050);
      ctx.fillStyle = gradient(ctx, 0, 700, ['#9fd3ef', '#e3f3fa']);
      ctx.fillRect(0, 0, 1500, 1050);
      disc(ctx, 1160, 250, 110, '#f8d35e');
      band(ctx, 1500, 1050, (x) => 560 + 70 * Math.sin(x / 260), '#a8d27a');
      band(ctx, 1500, 1050, (x) => 680 + 60 * Math.sin(x / 210 + 2), '#7fb653');
      band(ctx, 1500, 1050, (x) => 820 + 40 * Math.sin(x / 170 + 4), '#5d9340');
      for (const [x, y, s] of [[300, 560, 1], [420, 600, 0.8], [1250, 640, 1.1]]) {
        ctx.fillStyle = '#6b4f3a';
        ctx.fillRect(x - 8 * s, y - 10, 16 * s, 70 * s);
        disc(ctx, x, y - 30 * s, 52 * s, '#4f8a3a');
      }
      return c;
    };

    const coast = () => {
      const [c, ctx] = canvas(1500, 1050);
      ctx.fillStyle = gradient(ctx, 0, 620, ['#f6b98d', '#fbe0c0']);
      ctx.fillRect(0, 0, 1500, 1050);
      disc(ctx, 520, 620, 150, '#f48c5f');
      ctx.fillStyle = gradient(ctx, 620, 1050, ['#4f86b5', '#2f5f8f']);
      ctx.fillRect(0, 620, 1500, 430);
      ctx.fillStyle = 'rgba(255, 214, 170, 0.55)';
      for (let i = 0; i < 9; i++) ctx.fillRect(520 - 130 + i * 6, 650 + i * 42, 260 - i * 12, 10);
      band(ctx, 1500, 1050, (x) => 900 - 150 * Math.max(0, (x - 1050) / 450), '#e9d3a4');
      return c;
    };

    const peaks = () => {
      const [c, ctx] = canvas(1200, 1500);
      ctx.fillStyle = gradient(ctx, 0, 1000, ['#1d2747', '#4a5d8c']);
      ctx.fillRect(0, 0, 1200, 1500);
      for (let i = 0; i < 90; i++) disc(ctx, random() * 1200, random() * 700, 2 + random() * 3, 'rgba(255, 255, 255, 0.8)');
      disc(ctx, 900, 260, 80, '#f1ead2');
      const ridge = (points, color, snow) => {
        ctx.beginPath();
        ctx.moveTo(0, 1500);
        for (const [x, y] of points) ctx.lineTo(x, y);
        ctx.lineTo(1200, 1500);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        if (!snow) return;
        ctx.fillStyle = '#eef2f7';
        for (const [x, y] of points.filter(([, y]) => y < 900)) {
          ctx.beginPath();
          ctx.moveTo(x - 70, y + 90);
          ctx.lineTo(x, y);
          ctx.lineTo(x + 70, y + 90);
          ctx.lineTo(x + 25, y + 70);
          ctx.lineTo(x - 20, y + 95);
          ctx.closePath();
          ctx.fill();
        }
      };
      ridge([[0, 1000], [260, 720], [520, 960], [800, 640], [1200, 1010]], '#5c6f91', true);
      ridge([[0, 1220], [330, 1020], [640, 1210], [930, 1060], [1200, 1200]], '#3b4a68', false);
      return c;
    };

    const dunes = () => {
      const [c, ctx] = canvas(1200, 1200);
      ctx.fillStyle = gradient(ctx, 0, 700, ['#f9e7c4', '#fdf3e1']);
      ctx.fillRect(0, 0, 1200, 1200);
      disc(ctx, 380, 330, 120, '#f3a446');
      band(ctx, 1200, 1200, (x) => 640 + 90 * Math.sin(x / 300 + 1), '#ebc27d');
      band(ctx, 1200, 1200, (x) => 780 + 80 * Math.sin(x / 230 + 3), '#dba35a');
      band(ctx, 1200, 1200, (x) => 940 + 50 * Math.sin(x / 190), '#c58640');
      return c;
    };

    const forest = () => {
      const [c, ctx] = canvas(1050, 1500);
      ctx.fillStyle = gradient(ctx, 0, 900, ['#cfe8e0', '#f1f8f4']);
      ctx.fillRect(0, 0, 1050, 1500);
      band(ctx, 1050, 1500, () => 1180, '#9dc49a');
      const tree = (x, base, h, color) => {
        ctx.fillStyle = '#6f553f';
        ctx.fillRect(x - 10, base - 30, 20, 60);
        ctx.beginPath();
        ctx.moveTo(x, base - h);
        ctx.lineTo(x + h * 0.28, base - 20);
        ctx.lineTo(x - h * 0.28, base - 20);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      for (let i = 0; i < 6; i++) tree(90 + i * 175, 1000, 420 + (i % 3) * 60, '#5f9a6a');
      for (let i = 0; i < 5; i++) tree(170 + i * 185, 1240, 560 + (i % 2) * 80, '#3f7a55');
      return c;
    };

    /** A sticker: a shape on a transparent background, for the contour cut lines. */
    const leaf = () => {
      const [c, ctx] = canvas(620, 760);
      ctx.translate(310, 380);
      ctx.rotate(-0.35);
      ctx.beginPath();
      ctx.moveTo(0, -330);
      ctx.bezierCurveTo(260, -200, 250, 170, 0, 300);
      ctx.bezierCurveTo(-250, 170, -260, -200, 0, -330);
      ctx.fillStyle = '#62a95a';
      ctx.fill();
      ctx.strokeStyle = '#3e7a3a';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(0, -280);
      ctx.lineTo(0, 350);
      for (let y = -180; y <= 160; y += 85) {
        ctx.moveTo(0, y + 40);
        ctx.lineTo(120, y - 30);
        ctx.moveTo(0, y + 40);
        ctx.lineTo(-120, y - 30);
      }
      ctx.stroke();
      return c;
    };

    const star = () => {
      const [c, ctx] = canvas(640, 620);
      ctx.translate(320, 330);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 130 : 290;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
      }
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 40;
      ctx.strokeStyle = '#f2b632';
      ctx.stroke();
      ctx.fillStyle = '#f7c948';
      ctx.fill();
      return c;
    };

    const lemon = () => {
      const [c, ctx] = canvas(600, 600);
      disc(ctx, 300, 300, 285, '#f4d03f');
      disc(ctx, 300, 300, 250, '#fbeaa0');
      ctx.fillStyle = '#f7dc6f';
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(300 + 22 * Math.cos(a + Math.PI / 8), 300 + 22 * Math.sin(a + Math.PI / 8));
        ctx.arc(300, 300, 225, a + 0.08, a + Math.PI / 4 - 0.08);
        ctx.closePath();
        ctx.fill();
      }
      return c;
    };

    const heart = () => {
      const [c, ctx] = canvas(620, 560);
      ctx.translate(310, 150);
      ctx.beginPath();
      ctx.moveTo(0, 30);
      ctx.bezierCurveTo(0, -60, -280, -90, -280, 110);
      ctx.bezierCurveTo(-280, 260, -60, 330, 0, 390);
      ctx.bezierCurveTo(60, 330, 280, 260, 280, 110);
      ctx.bezierCurveTo(280, -90, 0, -60, 0, 30);
      ctx.fillStyle = '#e8716b';
      ctx.fill();
      return c;
    };

    const asFile = (name, c) => {
      const type = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return { name, mimeType: type, data: c.toDataURL(type, 0.9).split(',')[1] };
    };
    return [
      asFile('meadow.jpg', meadow()),
      asFile('coast.jpg', coast()),
      asFile('peaks.jpg', peaks()),
      asFile('dunes.jpg', dunes()),
      asFile('forest.jpg', forest()),
      asFile('leaf.png', leaf()),
      asFile('star.png', star()),
      asFile('lemon.png', lemon()),
      asFile('heart.png', heart()),
    ];
  });
  await page.close();
  return Object.fromEntries(pictures.map(({ name, mimeType, data }) => [name, { name, mimeType, buffer: Buffer.from(data, 'base64') }]));
}

/** A one-page PDF, A6, that looks like a printed card: a band, a title and lines of text. */
async function samplePdf() {
  const doc = await PDFDocument.create();
  doc.setTitle('Sample page');
  doc.setCreationDate(new Date(DAY));
  doc.setModificationDate(new Date(DAY));
  const mm = 72 / 25.4;
  const page = doc.addPage([105 * mm, 148 * mm]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 118 * mm, width: 105 * mm, height: 30 * mm, color: rgb(0.27, 0.45, 0.64) });
  page.drawText('Garden notes', { x: 9 * mm, y: 128 * mm, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText('A sample PDF page', { x: 9 * mm, y: 107 * mm, size: 10, font: regular, color: rgb(0.3, 0.3, 0.3) });
  for (let i = 0; i < 9; i++) {
    const width = (i % 3 === 2 ? 52 : 87) * mm;
    page.drawRectangle({ x: 9 * mm, y: (96 - i * 8) * mm, width, height: 2.2 * mm, color: rgb(0.82, 0.84, 0.87) });
  }
  page.drawRectangle({ x: 9 * mm, y: 9 * mm, width: 87 * mm, height: 12 * mm, borderColor: rgb(0.27, 0.45, 0.64), borderWidth: 1.2 });
  return { name: 'garden-notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await doc.save({ useObjectStreams: false })) };
}

// ---------- The app ----------

/**
 * A page of its own (fresh storage) in English, at a fixed size and time,
 * with reduced motion, the usage tips and the advice before printing off, the
 * summary after it on, and the storage estimate fixed. A page error fails the
 * run once it ends.
 */
async function openApp(browser, { width = 1440, height = 900, scale = 1, theme = 'light', mobile = false, time = DAY } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: theme,
    reducedMotion: 'reduce',
    acceptDownloads: true,
  });
  await context.addInitScript((stored) => {
    for (const [key, value] of Object.entries(stored)) if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
    // How full this browser's storage is depends on the machine: a fixed figure.
    if (navigator.storage) navigator.storage.estimate = async () => ({ usage: 4_200_000, quota: 2_000_000_000 });
  }, {
    'scooch:usage-tips': { v: 1, on: false, dismissed: [], known: [], counts: {} },
    'scooch:print-preferences': { v: 1, tip: false, summary: true },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    console.error(`  page error: ${e.message}`);
    process.exitCode = 1;
  });
  await page.clock.setSystemTime(time);
  await page.goto(BASE);
  await ready(page);
  return page;
}

async function ready(page) {
  await page.locator('#paper option').first().waitFor({ state: 'attached' });
  await page.waitForFunction(() => !document.body.classList.contains('is-loading'));
}

/** Waits until nothing is loading, the project is saved and every image is decoded and painted. */
async function settled(page) {
  await page.waitForFunction(() => !document.querySelector('#canvas[aria-busy="true"]') && document.getElementById('project')?.dataset.status === 'saved', null, { timeout: 60_000 });
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

async function addFiles(page, files) {
  const before = await page.locator('#sheets .piece').count();
  await page.locator('#file').setInputFiles(files);
  await page.waitForFunction((n) => document.querySelectorAll('#sheets .piece').length === n, before + files.length, { timeout: 60_000 });
  await settled(page);
}

async function arrange(page) {
  await page.locator('#arrange').click();
  await settled(page);
}

async function rename(page, name) {
  await page.locator('#project-name').click();
  await page.locator('#project-name-input').fill(name);
  await page.keyboard.press('Enter');
  await settled(page);
}

async function projectTab(page) {
  const toggle = page.locator('#props-toggle');
  if (!(await page.locator('#props-panel').isVisible()) && (await toggle.isVisible())) await toggle.click();
  await page.locator('#props-tab-project').click();
}

async function cutLines(page, mode) {
  await projectTab(page);
  await page.locator(`#cut-mode input[value="${mode}"]`).click();
  await settled(page);
}

/** Closes the passing notice, whose timer would decide whether it is in the picture. */
async function dismissNotice(page) {
  if (await page.locator('#pill-close').isVisible()) await page.locator('#pill-close').click();
  await page.waitForFunction(() => !document.getElementById('pill-close')?.checkVisibility());
}

/** Clears the selection and the notice, and moves the pointer and the focus out of the way. */
async function calm(page) {
  await dismissNotice(page);
  await page.mouse.move(0, 0);
  for (let i = 0; i < 3 && (await page.locator('#sheets .piece.is-selected').count()); i++) {
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await settled(page);
}

// ---------- Writing the images ----------

let encoder;

/** Saves a screenshot as WebP (Chromium encodes it). */
async function save(name, png) {
  const data = await encoder.evaluate(
    async ([base64, quality]) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
      const c = document.createElement('canvas');
      c.width = bitmap.width;
      c.height = bitmap.height;
      c.getContext('2d').drawImage(bitmap, 0, 0);
      return c.toDataURL('image/webp', quality).split(',')[1];
    },
    [png.toString('base64'), QUALITY]
  );
  const file = join(OUT, `${name}.webp`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`${relative(ROOT, file)}  ${(statSync(file).size / 1000).toFixed(1)} kB`);
}

/**
 * A screenshot once the page stops changing: two in a row, a moment apart,
 * the same (as Playwright's toHaveScreenshot waits). Floating controls find
 * their place and images get their final filtering a little after they show.
 */
async function shot(page, options = {}) {
  const take = () => page.screenshot({ animations: 'disabled', caret: 'hide', ...options });
  let last = await take();
  for (let i = 0; i < 20; i++) {
    await new Promise((done) => setTimeout(done, 250));
    const next = await take();
    if (next.equals(last)) return next;
    last = next;
  }
  throw new Error('The page kept changing: no stable screenshot');
}

// ---------- The screenshots ----------

const PHOTOS = ['meadow.jpg', 'coast.jpg', 'peaks.jpg', 'dunes.jpg', 'forest.jpg'];
const STICKERS = ['leaf.png', 'star.png', 'lemon.png', 'heart.png'];

/**
 * Each screenshot by the name of its file: it opens a page with openApp and
 * returns the PNG (the page's context is closed after).
 */
const SHOTS = {
  /** The editor with an arranged sheet, corner marks on: the README's first image. */
  async editor(browser, files) {
    const page = await openApp(browser);
    await photoProject(page, files);
    await calm(page);
    return shot(page);
  },

  /** The same project in the dark theme, with one photo selected: its toolbar and the Item tab. */
  async 'editor-dark'(browser, files) {
    const page = await openApp(browser, { theme: 'dark' });
    await photoProject(page, files);
    await calm(page);
    await page.locator('#sheets .piece').first().click();
    await settled(page);
    await page.mouse.move(0, 0);
    return shot(page);
  },

  /** The same project on a phone (390 × 844 at 2×): the bar in two rows, the panels behind two buttons. */
  async phone(browser, files) {
    const page = await openApp(browser, { width: 390, height: 844, scale: 2, mobile: true });
    await photoProject(page, files);
    await calm(page);
    return shot(page);
  },

  /** A sheet of stickers with contour cut lines, and the cut line options open. */
  async 'cut-lines'(browser, files) {
    const page = await openApp(browser);
    await stickerProject(page, files);
    await calm(page);
    return shot(page);
  },

  /** The command palette finding the rotate commands for the selected photo, with their keys. */
  async 'command-palette'(browser, files) {
    const page = await openApp(browser);
    await photoProject(page, files);
    await page.locator('#sheets .piece').first().click();
    await settled(page);
    await page.mouse.move(0, 0);
    await page.keyboard.press('Control+k');
    await page.locator('#palette-input').waitFor();
    await page.keyboard.type('rot');
    await settled(page);
    return shot(page, { clip: await around(page, '#palette') });
  },

  /**
   * Three projects changed at different times. «Photo prints» goes first: a
   * new project keeps the open one's settings, and it has the defaults then.
   */
  async projects(browser, files) {
    const page = await openApp(browser, { time: DAY - 50 * HOUR });
    await photoProject(page, files);
    await page.clock.setSystemTime(DAY - 26 * HOUR);
    await newProject(page);
    await stickerProject(page, files);
    await page.clock.setSystemTime(DAY - 0.2 * HOUR);
    await newProject(page);
    await rename(page, 'Postcards');
    await addFiles(page, ['meadow.jpg', 'coast.jpg', 'dunes.jpg', 'peaks.jpg'].map((name) => files[name]));
    await cutLines(page, 'outline');
    await arrange(page);
    await page.clock.setSystemTime(DAY);
    await calm(page);
    await page.keyboard.press('Control+o');
    await page.locator('#projects .project-card').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('#projects .project-thumb img')].every((img) => img.complete && img.naturalWidth > 0));
    await page.locator('#projects-usage').waitFor();
    await settled(page);
    return shot(page, { clip: await around(page, '#projects') });
  },

  /** The summary after downloading the photos' PDF: the sheets saved against one item per sheet. */
  async 'savings-summary'(browser, files) {
    const page = await openApp(browser);
    await photoProject(page, files);
    await calm(page);
    const download = page.waitForEvent('download');
    await page.locator('#export').click();
    await download;
    await page.locator('#summary-done').waitFor();
    await settled(page);
    return shot(page, { clip: await around(page, '#print-summary') });
  },
};

/**
 * The photos and the PDF page, arranged, with corner marks and the spacing
 * they ask for, in a project called «Photo prints».
 */
async function photoProject(page, files) {
  await rename(page, 'Photo prints');
  await addFiles(page, [...PHOTOS.map((name) => files[name]), files['garden-notes.pdf']]);
  await cutLines(page, 'corners');
  if (await page.locator('#cut-gap-fix').isVisible()) await page.locator('#cut-gap-fix').click();
  await arrange(page);
}

/**
 * Three of each sticker, arranged, with contour cut lines 2 mm away from
 * each shape in a medium weight, in a project called «Stickers».
 */
async function stickerProject(page, files) {
  await rename(page, 'Stickers');
  await addFiles(page, [1, 2, 3].flatMap(() => STICKERS.map((name) => files[name])));
  await cutLines(page, 'contour');
  if (!(await page.locator('#cut-margin').isVisible())) await page.locator('#cut-options > summary').click();
  await page.locator('#cut-margin').fill('2');
  await page.locator('#cut-margin').press('Enter');
  await page.locator('#cut-weight input[value="medium"]').click();
  await arrange(page);
}

/** The area of a dialog and some of what is behind it, inside the window. */
async function around(page, selector, pad = 40) {
  const box = await page.locator(selector).boundingBox();
  const { width, height } = page.viewportSize();
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  return { x, y, width: Math.min(width, Math.ceil(box.x + box.width + pad)) - x, height: Math.min(height, Math.ceil(box.y + box.height + pad)) - y };
}

async function newProject(page) {
  await page.keyboard.press('Control+o');
  await page.locator('#project-new').click();
  await page.waitForFunction(() => !document.getElementById('projects')?.hasAttribute('open'));
  await settled(page);
}

// ---------- Running ----------

const answers = () => fetch(BASE).then((response) => response.ok, () => false);

/** Waits until the server answers; fails if it stopped first (the port was taken, say). */
async function waitForServer(server) {
  let exited = false;
  server.once('exit', () => (exited = true));
  for (let i = 0; i < 100 && !exited; i++) {
    if (await answers()) return;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`vite preview didn't answer on ${BASE}`);
}

async function main() {
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter((name) => !(name in SHOTS));
  if (unknown.length) throw new Error(`Unknown screenshot: ${unknown.join(', ')}. Known: ${Object.keys(SHOTS).join(', ')}`);
  const names = wanted.length ? wanted : Object.keys(SHOTS);
  // Something else answering there would end up in the pictures.
  if (await answers()) throw new Error(`Port ${PORT} is in use: stop what serves ${BASE} or set SCREENSHOTS_PORT`);

  const build = mkdtempSync(join(tmpdir(), 'scooch-screenshots-'));
  let server;
  let browser;
  try {
    console.log('Building…');
    const built = spawnSync(process.execPath, [VITE, 'build', '--outDir', build, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit' });
    if (built.status !== 0) throw new Error('The build failed');
    server = spawn(process.execPath, [VITE, 'preview', '--outDir', build, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    await waitForServer(server);

    browser = await chromium.launch();
    encoder = await browser.newPage();
    const files = { ...(await drawPictures(browser)), 'garden-notes.pdf': await samplePdf() };
    mkdirSync(OUT, { recursive: true });
    for (const name of names) {
      await save(name, await SHOTS[name](browser, files));
      await Promise.all(browser.contexts().map((context) => context !== encoder.context() && context.close()));
    }
  } finally {
    await browser?.close();
    server?.kill();
    rmSync(build, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
