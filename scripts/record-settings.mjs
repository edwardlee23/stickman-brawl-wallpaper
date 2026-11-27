// Records the pictures of the settings shown in README.md, README.zh-TW.md and
// README.zh-CN.md into docs/images/, from the list in scripts/settings-shots.mjs. Like
// demo.gif, each is drawn on the fixed 1/20 s time step with a seeded Math.random, so a
// picture comes out the same each time.
//
// Needs Playwright and ffmpeg, which the wallpaper itself does not use:
//
//   npm install --no-save playwright-core
//   node scripts/record-settings.mjs                 # every picture
//   node scripts/record-settings.mjs items platforms # only these
//   node scripts/record-settings.mjs --check         # replay each GIF, check what it shows
//   node scripts/record-settings.mjs --check items   # only these
//
// --check records nothing: it replays each GIF shot as a recording would and fails when an
// event its shows field names (from the caption in README.md) does not happen in the clip.
//
// After a change to main.js, record them again and look at each: a seed that showed a
// knockout or an item drop may not any more, and the list's seed or skip then needs changing.
// CHROME and FFMPEG work as for scripts/record-demo.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FPS, openPage, launchOptions } from './record-demo.mjs';
import { SHOTS } from './settings-shots.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = path.join(ROOT, 'docs', 'images');
// What a shot's shows field can name, for --check: move ids started, fx types drawn, an item
// kind that drops and is picked up, fighters launched by the clicks, a knockout
export const SHOWS = ['moves', 'fx', 'item', 'launched', 'ko'];
export const fileOf = shot => shot.name + (shot.secs ? '.gif' : '.png');

// Run before main.js: the local clock stopped at that hour, for the Day and night background
export const fixedDate = hour => `(() => {
  const RealDate = Date, at = new RealDate(2026, 5, 15, ${hour}, 0, 0).getTime();
  window.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [at])); }
    static now() { return at; }
  };
})();`;

// Run before main.js: Wallpaper Engine's audio listener, fed by __advance through __music
export const musicHook = 'window.wallpaperRegisterAudioListener = cb => { window.__music = cb; };';

// 128 levels as Wallpaper Engine hands them (64 left, 64 right, low to high): a bass beat on
// every tenth frame, twice a second at 20 frames a second, over a steady quieter level
export function musicFrame(frame) {
  const beat = frame % 10 === 0;
  return Array.from({ length: 128 }, (_, i) => (i % 64 < 6 ? (beat ? 0.9 : 0.05) : 0.2));
}

// --check, then picture names as for a recording
export function parseArgs(argv) {
  const check = argv[0] === '--check';
  return { check, shots: parseNames(check ? argv.slice(1) : argv) };
}

export function parseNames(argv) {
  const names = SHOTS.map(s => s.name);
  for (const a of argv) if (!names.includes(a)) throw new Error('No picture named ' + a + '; the list has ' + names.join(', '));
  return argv.length ? SHOTS.filter(s => argv.includes(s.name)) : SHOTS;
}

// A page for one picture, with its settings applied and its fight run up to the picture
async function prepare(browser, shot, startFrame) {
  const init = (shot.hour !== undefined ? fixedDate(shot.hour) : '') + (shot.music ? musicHook : '');
  const page = await openPage(browser, shot.seed, { query: shot.query + '&sound=0', init });
  await page.evaluate(props => window.wallpaperPropertyListener.applyUserProperties(props), shot.props || {});
  // One step of the fight; with music, the frame of levels Wallpaper Engine would hand over first
  if (shot.music) await page.evaluate(`window.__musicFrame = ${musicFrame}`);
  await page.evaluate(({ music, fps }) => {
    window.__frame = 0;
    window.__step = () => {
      if (music && window.__music) window.__music(window.__musicFrame(window.__frame));
      window.__advance(1000 / fps); window.__frame++;
    };
  }, { music: !!shot.music, fps: FPS });
  await page.evaluate(n => { for (let i = 0; i < n; i++) window.__step(); }, startFrame);
  return page;
}

// The event a shot starts at, lead seconds before it: the first knockout (ko), or the first
// item drop (item: seconds), or the first drop of one kind (item: { kind, lead }); null for skip.
// It is data only: firstEvent checks for it in the page.
export function startEvent(shot) {
  if (shot.ko !== undefined) return { name: 'ko', lead: shot.ko, ko: true };
  if (shot.item === undefined) return null;
  const { kind, lead } = typeof shot.item === 'object' ? shot.item : { lead: shot.item };
  return kind ? { name: kind + ' item', lead, kind } : { name: 'item', lead };
}
// Runs inside the page, passed to page.evaluate as a function with its data as the argument:
// steps the fight until the event ev (from startEvent) happens, up to max frames, and returns
// the frame, or -1. It uses only its argument and win, so no data is spliced into source.
export function firstEvent([ev, max], win = window) {
  const seen = () => ev.ko ? win.__fighters().some(f => !f.alive)
    : ev.kind ? win.__stickmanBrawl.items.some(it => it.kind === ev.kind)
    : win.__stickmanBrawl.items.length > 0;
  for (let i = 0; i < max; i++) { win.__step(); if (seen()) return i; }
  return -1;
}
async function eventFrame(browser, shot, ev) {
  const page = await prepare(browser, shot, 0);
  const f = await page.evaluate(firstEvent, [ev, FPS * 180]);
  await page.close();
  if (f < 0) throw new Error(shot.name + ': no ' + ev.name + ' in 180 s');
  return f;
}
// The frame the picture starts on
async function startFrame(browser, shot) {
  const ev = startEvent(shot);
  return ev ? Math.max(0, (await eventFrame(browser, shot, ev)) - Math.round(ev.lead * FPS)) : Math.round((shot.skip || 0) * FPS);
}

// Runs inside the page, for --check: steps through a clip of n frames as frames() does, clicks
// included, and returns what happened in it. Like firstEvent it is passed to page.evaluate as a
// function, with [n, clicks] as its argument, and uses only that and win.
export function watchClip([n, clicks], win = window) {
  const sb = win.__stickmanBrawl, at = new Map(clicks);
  const moves = new Set(), fx = new Set(), drops = new Set(), pickups = new Set();
  const oldFx = new WeakSet(), oldItems = new WeakSet(), move = new WeakMap(), held = new WeakMap(), alive = new WeakMap();
  let launched = 0, ko = false;
  // Notes what changed since the last look; the first look, before the clip, only notes
  const look = clip => {
    for (const f of win.__fighters()) {
      const m = f.state === 'attack' ? f.move : null, h = f.held ? f.held.kind : null;
      if (clip && m && move.get(f) !== m) moves.add(m.id);
      if (clip && h && held.get(f) !== h) pickups.add(h);
      if (clip && !f.alive && alive.get(f)) ko = true;
      move.set(f, m); held.set(f, h); alive.set(f, f.alive);
    }
    for (const o of sb.fx) if (!oldFx.has(o)) { oldFx.add(o); if (clip) fx.add(o.type); }
    for (const o of sb.items) if (!oldItems.has(o)) { oldItems.add(o); if (clip) drops.add(o.kind); }
  };
  look(false);
  for (let i = 0; i < n; i++) {
    const click = at.get(i);
    if (click) {
      // Counts the fighters the click itself launches, not those a hit launches
      const fs = win.__fighters();
      for (const f of fs) f.launch = function (...a) { launched++; return Object.getPrototypeOf(this).launch.apply(this, a); };
      win.dispatchEvent(new PointerEvent('pointerdown', { clientX: click[0], clientY: click[1], button: 0, isPrimary: true }));
      for (const f of fs) delete f.launch;
    }
    win.__step();
    look(true);
  }
  return { moves: [...moves], fx: [...fx], drops: [...drops], pickups: [...pickups], launched, ko };
}

// What shows names that the clip did not show (seen, from watchClip), as messages
export function shortfall(shows, seen) {
  if (!shows) return [];
  const out = [];
  for (const id of shows.moves || []) if (!seen.moves.includes(id)) out.push('no ' + id + ' move');
  for (const t of shows.fx || []) if (!seen.fx.includes(t)) out.push('no ' + t + ' fx');
  if (shows.item !== undefined) {
    if (!seen.drops.includes(shows.item)) out.push('no ' + shows.item + ' drops');
    if (!seen.pickups.includes(shows.item)) out.push('no ' + shows.item + ' picked up');
  }
  if (shows.launched !== undefined && seen.launched < shows.launched) out.push(seen.launched + ' fighters launched by the clicks, not at least ' + shows.launched);
  if (shows.ko && !seen.ko) out.push('no knockout');
  return out;
}

const clickFrames = clicks => (clicks || []).map(([t, x, y]) => [Math.round(t * FPS), [x, y]]);

// Replays a GIF shot as recordShot does and returns what happened and what shows misses
export async function checkShot(browser, shot) {
  const page = await prepare(browser, shot, await startFrame(browser, shot));
  const seen = await page.evaluate(watchClip, [shot.secs * FPS, clickFrames(shot.clicks)]);
  await page.close();
  return { seen, missing: shortfall(shot.shows, seen) };
}

async function frames(page, n, clicks = []) {
  const at = new Map(clickFrames(clicks));
  const out = [];
  for (let i = 0; i < n; i++) {
    const png = await page.evaluate(click => {
      if (click) window.dispatchEvent(new PointerEvent('pointerdown', { clientX: click[0], clientY: click[1], button: 0, isPrimary: true }));
      window.__step();
      return document.querySelector('canvas').toDataURL('image/png');
    }, at.get(i) || null);
    out.push(Buffer.from(png.split(',')[1], 'base64'));
  }
  return out;
}

const ffmpeg = args => execFileSync(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

async function recordShot(browser, shot, dir) {
  const out = path.join(OUT_DIR, fileOf(shot));
  const start = await startFrame(browser, shot);
  if (shot.secs) {
    const page = await prepare(browser, shot, start);
    (await frames(page, shot.secs * FPS, shot.clicks)).forEach((b, i) => fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.png'), b));
    await page.close();
    ffmpeg(['-framerate', String(FPS), '-i', path.join(dir, '%04d.png'),
      '-vf', 'scale=480:270:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
      '-loop', '0', out]);
    return out;
  }
  const tiles = shot.tiles || [{}];
  const inputs = [];
  for (const [k, t] of tiles.entries()) {
    const one = { ...shot, ...t, props: { ...(shot.props || {}), ...(t.props || {}) } };
    const page = await prepare(browser, one, start);
    const [png] = await frames(page, 1);
    await page.close();
    const f = path.join(dir, 'tile' + k + '.png');
    fs.writeFileSync(f, png);
    inputs.push('-i', f);
  }
  const scale = tiles.map((_, k) => `[${k}:v]scale=640:360:flags=lanczos[t${k}]`).join(';');
  const join = tiles.length === 1 ? '[t0]null'
    : tiles.length === 2 ? '[t0][t1]hstack=inputs=2'
    : '[t0][t1][t2][t3]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0';
  ffmpeg([...inputs, '-filter_complex', scale + ';' + join, '-frames:v', '1', out]);
  return out;
}

async function main() {
  const { check, shots } = parseArgs(process.argv.slice(2));
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { throw new Error('playwright-core is missing: run npm install --no-save playwright-core'); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch(launchOptions(process.env));
  try {
    if (check) {
      let failed = 0;
      for (const shot of shots.filter(s => s.secs)) {
        const { seen, missing } = await checkShot(browser, shot);
        if (missing.length) failed++;
        console.log((missing.length ? 'FAIL ' : 'ok   ') + shot.name + (missing.length ? ': ' + missing.join(', ') + '\n     seen ' + JSON.stringify(seen) : ''));
      }
      if (failed) throw new Error(failed + ' of the clips do not show what their shows field names');
      return;
    }
    for (const shot of shots) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stickman-shot-'));
      try {
        const out = await recordShot(browser, shot, dir);
        console.log('Wrote ' + path.relative(process.cwd(), out) + ' (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
