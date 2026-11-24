// Stickman Brawl: a comic-style web wallpaper for Wallpaper Engine.
// Skeleton poses interpolate between keyframes; fighters run on walls, fire energy blasts and knock each other into walls; a KO switches to a verlet ragdoll.
(() => {
'use strict';

// ---------- Settings ----------
const cfg = {
  count: 6,
  mode: 'ffa',          // 'ffa' free-for-all | 'teams' red vs blue
  speed: 1,
  scale: 1,
  showHP: true,
  colorful: true,
  bg: '#111318',
  line: '#ececec',
  fps: 0,               // 0 = uncapped
  reduceMotion: true,   // skip full-screen flashes and speed lines, no screen shake
  styles: { boxing: true, muaythai: true, taekwondo: true, judo: true, wrestling: true, super: true },
};
const q = new URLSearchParams(location.search);
if (q.has('count')) cfg.count = +q.get('count');
if (q.has('mode')) cfg.mode = q.get('mode');
if (q.has('speed')) cfg.speed = +q.get('speed');
if (q.has('reducemotion')) cfg.reduceMotion = !/^(0|false|off)$/i.test(q.get('reducemotion'));

// ---------- Helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const ease = u => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const easeOut = u => 1 - (1 - u) * (1 - u);
const sgn = v => (v >= 0 ? 1 : -1);
const pick = a => a[Math.floor(Math.random() * a.length)];
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// ---------- Skeleton ----------
const L = { torso: 34, neck: 5, head: 8, uarm: 17, farm: 17, thigh: 22, shin: 22 };
// Angles are in local coordinates facing right: arms and legs are 0 pointing down, positive rotates forward; the torso is 0 pointing up, positive leans forward.
// Elbows and knees bend relative to the previous segment. B = back hand/foot, F = front hand/foot.
const KEYS = ['t', 'aB', 'eB', 'aF', 'eF', 'lB', 'kB', 'lF', 'kF', 'dx', 'lift'];
const JOINTS = ['hip', 'sh', 'head', 'eB', 'hB', 'eF', 'hF', 'kB', 'fB', 'kF', 'fF'];
const GUARD = { t: 0.12, aB: 0.45, eB: 2.25, aF: 0.95, eF: 1.6, lB: -0.38, kB: -0.22, lF: 0.35, kF: -0.3, dx: 0, lift: 0 };
const P = o => Object.assign({}, GUARD, o);
const clonePose = p => Object.assign({}, p);
function lerpPose(a, b, u, out) {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * u;
  return out;
}

const FLINCH = P({ t: -0.35, aF: 1.3, eF: 1.9, aB: 0.9, eB: 2.3, lF: 0.5, kF: -0.2, lB: -0.2, kB: -0.3 });
const BLOCK = P({ t: 0.05, aF: 1.5, eF: 2.3, aB: 1.2, eB: 2.5 });
const DOWN = P({ t: 0, aF: 0.25, eF: 0.2, aB: -0.25, eB: 0.2, lF: 0.08, kF: -0.05, lB: -0.08, kB: -0.05 });
const CROUCH = P({ t: 0.6, aF: 0.6, eF: 0.8, aB: 0.2, eB: 0.6, lF: 1.2, kF: -2.2, lB: -0.2, kB: -1.6 });
const VICTORY = P({ t: -0.05, aF: 2.9, eF: 0.2, aB: 3.0, eB: -0.2, lF: 0.25, kF: 0, lB: -0.25, kB: 0 });
const AIR = P({ t: 0.2, aF: 1.2, eF: 1.5, aB: 0.6, eB: 2.0, lF: 1.2, kF: -1.6, lB: 0.4, kB: -1.4 });
const TUMBLE = P({ t: 0.5, aF: 2.2, eF: 1.0, aB: -0.8, eB: 0.8, lF: 1.6, kF: -1.0, lB: 0.9, kB: -1.6 });
const SPLAT = P({ t: 0, aF: 2.3, eF: 0.1, aB: -2.3, eB: -0.1, lF: 0.5, kF: 0, lB: -0.5, kB: 0 });
const CHARGE = P({ t: 0.15, aF: -0.7, eF: 1.9, aB: -0.6, eB: 2.0, lF: 0.7, kF: -0.6, lB: -0.7, kB: -0.3 });
const FIRE = P({ t: 0.2, aF: 1.57, eF: 0, aB: 1.52, eB: 0.05, lF: 0.7, kF: -0.35, lB: -0.7, kB: -0.1 });
const RISE = P({ t: -0.1, aF: 2.5, eF: 0.2, aB: 0.6, eB: 1.8, lF: 1.4, kF: -1.9, lB: -0.2, kB: -0.1 });
const DIVE = P({ t: -0.35, lF: 1.0, kF: 0, lB: -0.4, kB: -1.6, aF: -0.5, eF: 0.5, aB: -0.9, eB: 0.5 });
const SLAM_UP = P({ t: 0.1, aF: 2.8, eF: 0.3, aB: 2.9, eB: 0.3, lF: 0.9, kF: -1.8, lB: -0.2, kB: -1.5 });
const SLAM_DN = P({ t: 0.7, aF: 1.0, eF: 0, aB: 1.1, eB: 0, lF: 0.9, kF: -1.8, lB: -0.2, kB: -1.5 });
const FLYKICK = P({ t: -0.9, lF: 1.65, kF: 0.05, lB: 0.3, kB: -1.8, aF: 0.6, eF: 1.0, aB: -0.4, eB: 0.5 });
const RUN = P({ t: 0.35, lF: 0.6, kF: -0.8, lB: -0.5, kB: -0.6, aF: 0.9, eF: 1.3, aB: -0.6, eB: 1.0 });

function limb(J, n1, n2, o, a, b, l1, l2) {
  const m = { x: o.x + Math.sin(a) * l1, y: o.y + Math.cos(a) * l1 };
  J[n1] = m;
  J[n2] = { x: m.x + Math.sin(a + b) * l2, y: m.y + Math.cos(a + b) * l2 };
}
// Forward kinematics: returns joints in local coordinates, with the lowest foot or knee on the ground (y = 0).
function fk(p) {
  const J = {};
  const tx = Math.sin(p.t), ty = -Math.cos(p.t);
  J.hip = { x: 0, y: 0 };
  J.sh = { x: tx * L.torso, y: ty * L.torso };
  J.head = { x: J.sh.x + tx * (L.neck + L.head), y: J.sh.y + ty * (L.neck + L.head) };
  limb(J, 'eB', 'hB', J.sh, p.aB, p.eB, L.uarm, L.farm);
  limb(J, 'eF', 'hF', J.sh, p.aF, p.eF, L.uarm, L.farm);
  limb(J, 'kB', 'fB', J.hip, p.lB, p.kB, L.thigh, L.shin);
  limb(J, 'kF', 'fF', J.hip, p.lF, p.kF, L.thigh, L.shin);
  const g = Math.max(J.fB.y, J.fF.y, J.kB.y, J.kF.y);
  for (const k in J) { J[k].x += p.dx; J[k].y -= g + p.lift; }
  return J;
}

// ---------- Moves ----------
// Real martial arts (the strike point sweeps from W to A)
const MOVES = [
  { id: 'jab', style: 'boxing', hit: 'hF', wind: 0.08, act: 0.1, rec: 0.14, dmg: 4, push: 20, lunge: 8, w: 4,
    W: { aF: 1.15, eF: 1.3, t: 0.15 }, A: { t: 0.25, aF: 1.55, eF: 0.02, aB: 0.5, eB: 2.3, lF: 0.45, kF: -0.25 } },
  { id: 'cross', style: 'boxing', hit: 'hB', wind: 0.1, act: 0.1, rec: 0.18, dmg: 7, push: 35, lunge: 10, kd: 0.05, w: 3,
    W: { t: 0.05, aB: 0.55, eB: 2.1 }, A: { t: 0.45, aB: 1.58, eB: 0.02, aF: 0.7, eF: 2.0, lB: -0.55, kB: -0.05 } },
  { id: 'hook', style: 'boxing', hit: 'hF', wind: 0.12, act: 0.1, rec: 0.2, dmg: 8, push: 30, lunge: 8, kd: 0.12, w: 3,
    W: { t: -0.05, aF: 1.1, eF: 1.9 }, A: { t: 0.4, aF: 1.85, eF: 1.0 } },
  { id: 'uppercut', style: 'boxing', hit: 'hB', wind: 0.14, act: 0.1, rec: 0.22, dmg: 9, push: 25, lunge: 8, kd: 0.2, up: 1, w: 2,
    W: { t: 0.4, aB: 0.3, eB: 1.3, lF: 0.7, kF: -1.0, lB: -0.25, kB: -0.9 }, A: { t: -0.05, aB: 1.25, eB: 1.75, lF: 0.25, kF: 0, lB: -0.3, kB: 0 } },

  { id: 'teep', style: 'muaythai', hit: 'fF', wind: 0.14, act: 0.12, rec: 0.2, dmg: 6, push: 70, lunge: 6, kd: 0.12, w: 3,
    W: { t: -0.05, lF: 1.8, kF: -2.0 }, A: { t: -0.35, lF: 1.45, kF: 0.05, aF: 1.0, eF: 1.8, aB: 0.3, eB: 2.0 } },
  { id: 'roundhouse', style: 'muaythai', hit: 'fB', wind: 0.16, act: 0.12, rec: 0.26, dmg: 11, push: 45, lunge: 10, kd: 0.18, w: 3,
    W: { t: -0.1, lB: -0.7, kB: -0.9 }, A: { t: -0.6, lB: 1.9, kB: 0.15, aB: -0.5, eB: 0.4, aF: 1.1, eF: 1.9 } },
  { id: 'elbow', style: 'muaythai', hit: 'eF', wind: 0.1, act: 0.1, rec: 0.18, dmg: 10, push: 30, lunge: 10, kd: 0.2, w: 2,
    W: { aF: 0.9, eF: 2.1, t: 0.1 }, A: { t: 0.4, aF: 2.0, eF: 2.7, aB: 0.6, eB: 2.2 } },
  { id: 'knee', style: 'muaythai', hit: 'kF', wind: 0.12, act: 0.12, rec: 0.2, dmg: 9, push: 35, lunge: 12, up: 1, w: 2,
    W: { aF: 1.35, eF: 0.9, aB: 1.35, eB: 0.8, t: 0.15 }, A: { t: -0.15, lF: 1.75, kF: -2.2, lB: -0.1, kB: 0, aF: 1.1, eF: 1.2, aB: 1.1, eB: 1.2 } },
  { id: 'lowkick', style: 'muaythai', hit: 'fB', wind: 0.13, act: 0.1, rec: 0.2, dmg: 6, push: 20, lunge: 6, kd: 0.1, w: 2,
    W: { t: -0.05, lB: -0.5, kB: -0.6 }, A: { t: -0.35, lB: 1.25, kB: 0.2, aB: -0.3, eB: 0.5 } },

  { id: 'sidekick', style: 'taekwondo', hit: 'fF', wind: 0.16, act: 0.12, rec: 0.26, dmg: 10, push: 80, lunge: 14, kd: 0.25, w: 3,
    W: { t: -0.4, lF: 1.95, kF: -2.3, aF: 1.0, eF: 2.0 }, A: { t: -1.0, lF: 1.65, kF: 0.05, aF: 0.6, eF: 1.0, aB: -0.4, eB: 0.5 } },
  { id: 'backkick', style: 'taekwondo', hit: 'fB', spin: true, wind: 0.2, act: 0.12, rec: 0.28, dmg: 13, push: 90, lunge: 10, kd: 0.35, w: 1.5,
    W: { t: 0.3, lB: -0.5, kB: -1.4, aF: 0.8, eF: 1.6 }, A: { t: 0.85, lB: -1.65, kB: 0.05, aF: -0.6, eF: 0.6, aB: 0.3, eB: 1.2, lF: 0.15, kF: -0.2 } },
  { id: 'axekick', style: 'taekwondo', hit: 'fF', wind: 0.2, act: 0.1, rec: 0.24, dmg: 11, push: 30, lunge: 8, kd: 0.2, down: 1, w: 1.5,
    W: { t: -0.35, lF: 2.7, kF: 0.05, aF: 0.7, eF: 1.5 }, A: { t: 0.1, lF: 1.0, kF: 0, aF: 0.9, eF: 1.6 } },

  { id: 'seoinage', style: 'judo', grab: 'over', spin: true, reach: 26, wind: 0.16, act: 0.25, rec: 0.35, dmg: 14, lunge: 10, w: 2,
    W: { t: 0.25, aF: 1.5, eF: 0.4, aB: 1.55, eB: 0.3, lF: 0.4, kF: -0.5 }, A: { t: 1.1, lF: 0.5, kF: -1.1, lB: -0.15, kB: -1.1, aF: 2.5, eF: 0.9, aB: 2.7, eB: 0.8 } },
  { id: 'osotogari', style: 'judo', grab: 'reap', reach: 24, wind: 0.14, act: 0.14, rec: 0.25, dmg: 10, lunge: 12, w: 2,
    W: { t: 0.2, aF: 1.5, eF: 0.4, aB: 1.4, eB: 0.5, lB: 1.3, kB: -0.3 }, A: { t: 0.75, lB: -1.3, kB: 0.1, lF: 0.3, kF: -0.4, aF: 1.7, eF: 0.3, aB: 1.6, eB: 0.3 } },

  { id: 'doubleleg', style: 'wrestling', grab: 'takedown', reach: 26, wind: 0.12, act: 0.2, rec: 0.45, dmg: 9, lunge: 34, w: 2,
    W: { t: 0.55, lF: 0.9, kF: -1.7, lB: -0.5, kB: -1.3, aF: 1.2, eF: 0.6, aB: 1.0, eB: 0.6 }, A: { t: 1.25, lF: 1.15, kF: -1.9, lB: -1.2, kB: -0.2, aF: 1.5, eF: 0.25, aB: 1.4, eB: 0.35 } },
  { id: 'suplex', style: 'wrestling', grab: 'over', reach: 22, wind: 0.16, act: 0.25, rec: 0.4, dmg: 15, lunge: 8, w: 1.5,
    W: { t: 0.3, aF: 1.4, eF: 0.5, aB: 1.4, eB: 0.5, lF: 0.5, kF: -0.8, lB: -0.4, kB: -0.6 }, A: { t: -1.25, aF: 2.6, eF: 0.6, aB: 2.7, eB: 0.5, lF: 0.5, kF: -0.8, lB: -0.4, kB: -0.6 } },
];
// Comic specials (each has its own update function)
const SUPER = [
  { id: 'beam', type: 'beam', range: [90, 9999], w: 3, air: true, dmg: 22, antiAir: true },
  { id: 'blast', type: 'blast', range: [100, 9999], w: 2.5, air: true, dmg: 4, antiAir: true },
  { id: 'barrage', type: 'barrage', range: [14, 40], w: 3, dmg: 1.4, sameAlt: true },
  { id: 'rising', type: 'rising', range: [8, 42], w: 3, dmg: 10, antiAir: true },
  { id: 'dive', type: 'dive', range: [60, 480], w: 3, air: true, dmg: 12, antiAir: true },
  { id: 'slam', type: 'slam', range: [30, 240], w: 2, air: true, dmg: 12 },
  { id: 'teleport', type: 'teleport', range: [110, 9999], w: 2 },
  { id: 'wallrun', type: 'wallrun', range: [0, 9999], w: 2.5, needWall: true },
];
const MOVE_BY = {};
for (const m of MOVES) {
  MOVE_BY[m.id] = m;
  m.W = P(m.W); m.A = P(m.A);
  if (m.grab) {
    m.range = [2, m.reach + m.lunge * 0.6];
  } else {
    // Compute this move's reach automatically: the strike point sweeps from W to A, plus the distance covered while attacking.
    const s = m.spin ? -1 : 1;
    const ra = fk(m.A)[m.hit].x * s, rw = fk(m.W)[m.hit].x * s;
    const go = m.lunge * 0.7;
    m.range = [Math.max(4, Math.min(ra, rw) + go - 4), Math.max(ra, rw) + go + 8];
  }
}
for (const m of SUPER) { m.style = 'super'; MOVE_BY[m.id] = m; }

// ---------- Canvas and world ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let SW = 0, SH = 0, dpr = 1, S = 1, worldW = 0, worldH = 0, floorTop = 0;
const DEPTH = 120;           // Front-to-back depth, so a crowd doesn't stand on one line
const G = 1400;              // Comic gravity: jump high, fall fast
const groundY = z => floorTop + z;
const maxAlt = z => groundY(z) - 24;
function resize() {
  dpr = window.devicePixelRatio || 1;
  SW = window.innerWidth; SH = window.innerHeight;
  canvas.width = Math.round(SW * dpr); canvas.height = Math.round(SH * dpr);
  canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  S = cfg.scale * SH / 540;
  worldW = SW / S; worldH = SH / S;
  floorTop = worldH * 0.74 - DEPTH / 2;
  for (const f of fighters) f.x = clamp(f.x, 14, worldW - 14);
}

const TEAM_COLOR = ['#ff6b6b', '#4dabf7'];
const TEAM_NAME = ['RED', 'BLUE'];
const HIT_STATES = new Set(['idle', 'air', 'attack', 'hit', 'block', 'launched', 'splat']);
const SOLID = new Set(['idle', 'attack', 'hit', 'block']);
const isEnemy = (a, b) => a !== b && (cfg.mode === 'teams' ? a.team !== b.team : true);

let fighters = [];
const sparks = [], fx = [], shots = [];
let shake = 0, freeze = 0;
let roundOver = false, roundTimer = 0, roundTime = 0, winnerText = '', winnerColor = '#fff';
const stats = { att: {}, hits: {}, whiff: 0, blocked: 0, ko: 0, rounds: 0, throws: 0, launches: 0, splats: 0 };
window.__stickmanBrawl = { stats, cfg, MOVES, SUPER, shots, get fighters() { return fighters; } };

// ---------- Effects ----------
function spawnSparks(x, y, col, n, up, speed = 1) {
  for (let i = 0; i < n; i++) {
    const a = up ? rand(-Math.PI * 0.95, -Math.PI * 0.05) : rand(0, Math.PI * 2);
    const v = (up ? rand(20, 90) : rand(60, 200)) * speed;
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, col });
  }
}
const addFx = o => { o.t = 0; fx.push(o); return o; };
function crack(x, y, kind, size) {
  // kind: 'ground' floor crack (squashed for perspective) | 'wall' radial wall crack
  const lines = [];
  const n = kind === 'ground' ? 7 : 8;
  for (let b = 0; b < n; b++) {
    let a = kind === 'ground' ? (b % 2 ? 0 : Math.PI) + rand(-0.9, 0.9) : rand(0, Math.PI * 2);
    let px = x, py = y;
    const pts = [[px, py]];
    for (let s = 0; s < 4; s++) {
      a += rand(-0.6, 0.6);
      const l = size * rand(0.2, 0.45);
      px += Math.cos(a) * l; py += Math.sin(a) * l * (kind === 'ground' ? 0.3 : 1);
      pts.push([px, py]);
    }
    lines.push(pts);
  }
  addFx({ type: 'crack', x, y, kind, size, lines, dur: 5 });
}
function impact(x, y, big) {
  addFx({ type: 'ring', x, y, r0: 4, r1: big ? 70 : 34, dur: big ? 0.35 : 0.22, w: big ? 3 : 2 });
  spawnSparks(x, y, '#ffe28a', big ? 18 : 10, false, big ? 1.6 : 1);
  shake = Math.max(shake, big ? 9 : 4);
  freeze = Math.max(freeze, big ? 0.09 : 0.035);
  if (big) addFx({ type: 'focus', x, y, dur: 0.28 });
}
function quake(x, y, r) {
  addFx({ type: 'ring', x, y, r0: 6, r1: r, dur: 0.4, w: 3, flat: true });
  crack(x, y, 'ground', r * 0.7);
  spawnSparks(x, y, 'rgba(210,210,210,0.75)', 22, true, 2);
  shake = Math.max(shake, 10);
}

// ---------- ragdoll ----------
const BONES = [['hip', 'sh'], ['sh', 'head'], ['sh', 'eB'], ['eB', 'hB'], ['sh', 'eF'], ['eF', 'hF'],
  ['hip', 'kB'], ['kB', 'fB'], ['hip', 'kF'], ['kF', 'fF'], ['hip', 'head']];
const RAG_H = 1 / 120;
const UPPER = { head: 1, sh: 1, eB: 0.9, hB: 0.9, eF: 0.9, hF: 0.9, hip: 0.6, kB: 0.35, kF: 0.35, fB: 0.2, fF: 0.2 };
function makeRag(J, vx, vy) {
  const pts = {};
  for (const k in J) {
    const f = UPPER[k];
    pts[k] = { x: J[k].x, y: J[k].y, px: J[k].x - vx * f * RAG_H, py: J[k].y - vy * f * RAG_H };
  }
  const bones = BONES.map(([a, b]) => [a, b, Math.hypot(J[a].x - J[b].x, J[a].y - J[b].y)]);
  return { pts, bones, acc: 0, age: 0 };
}
function stepRag(r, gy) {
  const p = r.pts;
  for (const k in p) {
    const o = p[k];
    const vx = (o.x - o.px) * 0.998, vy = (o.y - o.py) * 0.998;
    o.px = o.x; o.py = o.y;
    o.x += vx; o.y += vy + 900 * RAG_H * RAG_H;
  }
  for (let it = 0; it < 6; it++) {
    for (const [a, b, len] of r.bones) {
      const A = p[a], B = p[b];
      let dx = B.x - A.x, dy = B.y - A.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const k = (d - len) / d * 0.5;
      dx *= k; dy *= k;
      A.x += dx; A.y += dy; B.x -= dx; B.y -= dy;
    }
    for (const k in p) {
      const o = p[k];
      const fl = gy - (k === 'head' ? L.head : 1.5);
      if (o.y > fl) {
        const vy = o.y - o.py, vx = o.x - o.px;
        o.y = fl; o.py = fl + vy * 0.3; o.px = o.x - vx * 0.75;
      }
      if (o.y < 4) { const vy = o.y - o.py; o.y = 4; o.py = 4 + vy * 0.5; }
      if (o.x < 4 || o.x > worldW - 4) {
        const vx = o.x - o.px, w = o.x < 4 ? 4 : worldW - 4;
        o.x = w; o.px = w + vx * 0.5;          // Bounce off the wall
      }
    }
  }
}

// ---------- Hit detection ----------
function segDist(px, py, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, l = vx * vx + vy * vy;
  const t = l ? clamp(((px - a.x) * vx + (py - a.y) * vy) / l, 0, 1) : 0;
  return Math.hypot(px - a.x - vx * t, py - a.y - vy * t);
}
function hitTest(P0, P1, J, pad = 0) {
  for (let i = 0; i <= 4; i++) {
    const u = i / 4, x = P0.x + (P1.x - P0.x) * u, y = P0.y + (P1.y - P0.y) * u;
    if (Math.hypot(x - J.head.x, y - J.head.y) < L.head + 3 + pad) return 'head';
    if (segDist(x, y, J.hip, J.sh) < 7 + pad) return 'body';
    if (segDist(x, y, J.hip, J.kF) < 5.5 + pad || segDist(x, y, J.hip, J.kB) < 5.5 + pad ||
        segDist(x, y, J.kF, J.fF) < 4.5 + pad || segDist(x, y, J.kB, J.fB) < 4.5 + pad) return 'leg';
  }
  return null;
}

function pickTarget(me) {
  let best = null, bs = Infinity;
  for (const e of fighters) {
    if (!e.alive || !isEnemy(me, e)) continue;
    // Opponents already targeted by many fighters score lower, so big crowds split into several fights instead of one pile.
    let crowd = 0;
    for (const o of fighters) if (o !== me && o.alive && o.target === e) crowd++;
    const s = crowd * 30 + Math.abs(e.x - me.x) + Math.abs(e.z - me.z) * 2 + (e.hittable ? 0 : 80) +
      (e === me.target ? -20 : 0) + rand(0, 40);
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}
function pickMove(me, t) {
  const items = [];
  const tAir = t && t.alt > 50, meAir = me.alt > 0;
  for (const m of MOVES) {
    if (!cfg.styles[m.style] || meAir) continue;
    items.push([m, m.w * (tAir ? 0.15 : 1)]);
  }
  if (cfg.styles.super) {
    for (const m of SUPER) {
      if (meAir && !m.air) continue;
      if (m.needWall && Math.min(me.x, worldW - me.x) > 320) continue;
      items.push([m, m.w * 1.6 * (tAir && m.antiAir ? 3 : 1)]);
    }
  }
  // Every style turned off: fight with all the martial-arts moves rather than stand still (see README)
  if (!items.length) for (const m of MOVES) items.push([m, m.w]);
  let r = Math.random() * items.reduce((s, it) => s + it[1], 0);
  for (const [m, w] of items) { r -= w; if (r <= 0) return m; }
  return items[items.length - 1][0];
}

// ---------- Stickman ----------
const TMP = clonePose(GUARD);
const TELEPORT_FOLLOW = ['hook', 'roundhouse', 'backkick', 'uppercut', 'elbow', 'rising', 'barrage'];
const INIT_PHASE = { beam: 'charge', blast: 0, barrage: 0, rising: 0, dive: 'jump', slam: 'up', teleport: 'out', wallrun: 'run' };
class Fighter {
  constructor(id, x, z, team, hue) {
    Object.assign(this, { id, x, z, team, hue });
    this.hp = 100; this.facing = 1; this.vx = 0; this.vz = 0; this.alt = 0; this.va = 0;
    this.state = 'idle'; this.st = 0; this.dur = 0; this.time = Math.random() * 10;
    this.pose = clonePose(GUARD); this.from = null; this.move = null; this.md = null; this.nextMove = null;
    this.target = null; this.retarget = 0; this.cool = rand(0.4, 1.4); this.evade = 0; this.dash = 0;
    this.rot = 0; this.rotV = 0; this.fallSign = -1; this.walk = 0; this.spin = false; this.hover = false;
    this.flash = 0; this.hitDone = false; this.prevHP = null; this.juggle = 0; this.dashed = false; this.dj = false;
    this.th = null; this.rag = null; this.hipH = 44; this.W = null; this.downDur = 1; this.koPending = false;
    this.aura = 0; this.alpha = 1; this.invis = false; this.ghost = false;
    this.trail = []; this.trailOn = false; this.trailT = 0;
  }
  get alive() { return this.state !== 'ko'; }
  get hittable() {
    if (this.invis) return false;
    if (this.state === 'launched' || this.state === 'splat') return this.juggle < 4;
    return HIT_STATES.has(this.state);
  }
  drawFacing() { return this.spin ? -this.facing : this.facing; }

  joints() {
    const J = fk(this.pose);
    this.hipH = -J.hip.y;
    const fac = this.drawFacing();
    let px = 0, py = 0, ax = this.x, ay = groundY(this.z) - this.alt;
    if (this.state === 'thrown') { px = J.hip.x; py = J.hip.y; ax = this.th.hx; ay = this.th.hy; }
    else if (this.state === 'launched' || this.state === 'splat') { px = J.hip.x; py = J.hip.y; ay -= 14; }
    else if (this.alt <= 0) ay -= Math.abs(Math.sin(this.rot)) * 5;
    const c = Math.cos(this.rot), s = Math.sin(this.rot), W = {};
    for (const k in J) {
      const lx = J[k].x - px, ly = J[k].y - py;
      W[k] = { x: ax + fac * (lx * c - ly * s), y: ay + lx * s + ly * c };
    }
    return W;
  }

  update(dt) {
    this.st += dt; this.time += dt;
    if (this.flash > 0) this.flash -= dt;
    this.aura = Math.max(0, this.aura - dt * 2);
    switch (this.state) {
      case 'idle': this.updIdle(dt); break;
      case 'air': this.updAir(dt); break;
      case 'attack': this.updAttack(dt); break;
      case 'hit': {
        const u = clamp((this.st / this.dur - 0.3) / 0.7, 0, 1);
        lerpPose(FLINCH, GUARD, ease(u), this.pose);
        if (this.st >= this.dur) this.state = this.alt > 0 ? 'air' : 'idle';
        break;
      }
      case 'block':
        lerpPose(this.pose, BLOCK, Math.min(1, dt * 20), this.pose);
        if (this.st >= this.dur) this.state = 'idle';
        break;
      case 'fall': {
        const u = Math.min(1, this.st / this.dur);
        this.rot = this.fallSign * Math.PI / 2 * u * u;
        lerpPose(this.from, DOWN, ease(u), this.pose);
        if (u >= 1) {
          quake(this.x, groundY(this.z), 50);
          this.state = 'down'; this.st = 0; this.downDur = rand(0.7, 1.4);
          if (this.hp <= 0) this.koPending = true;
        }
        break;
      }
      case 'down':
        if (this.st >= this.downDur) { this.state = 'getup'; this.st = 0; }
        break;
      case 'getup': {
        // Comic kip-up: spring straight back up
        const u = Math.min(1, this.st / 0.45);
        this.rot = this.fallSign * Math.PI / 2 * (1 - ease(u));
        if (u < 0.5) lerpPose(DOWN, CROUCH, ease(u * 2), this.pose);
        else lerpPose(CROUCH, GUARD, ease((u - 0.5) * 2), this.pose);
        if (u >= 1) { this.rot = 0; this.state = 'idle'; this.cool = rand(0.2, 0.6); this.juggle = 0; }
        break;
      }
      case 'thrown': {
        const th = this.th, u = Math.min(1, this.st / th.dur), e = ease(u);
        th.hx = th.hx0 + (th.hx1 - th.hx0) * e;
        th.hy = th.hy0 + (th.hy1 - th.hy0) * e - Math.sin(Math.PI * u) * 150;
        this.rot = 1.5 * Math.PI * e;
        lerpPose(this.from, DOWN, Math.min(1, u * 1.5), this.pose);
        if (u >= 1) {
          quake(th.hx, groundY(this.z), 90);
          impact(th.hx, groundY(this.z) - 6, true);
          this.rot = -Math.PI / 2; this.fallSign = -1;
          this.x = clamp(th.hx1 + this.facing * this.hipH, 14, worldW - 14);
          this.th = null; this.state = 'down'; this.st = 0; this.downDur = rand(0.9, 1.5);
          if (this.hp <= 0) this.koPending = true;
        }
        return;
      }
      case 'launched': this.updLaunched(dt); return;
      case 'splat':
        lerpPose(this.pose, SPLAT, Math.min(1, dt * 20), this.pose);
        if (this.st > 0.4) this.launch(-this.splatSide * 90, 0, true);
        return;
      case 'ko': {
        const r = this.rag;
        r.age += dt;
        if (r.age < 5) {
          r.acc = Math.min(r.acc + dt, RAG_H * 12);
          while (r.acc >= RAG_H) { stepRag(r, groundY(this.z)); r.acc -= RAG_H; }
        }
        return;
      }
    }
    if (this.state !== 'idle' && this.state !== 'attack' && this.state !== 'air') {
      this.vx = approach(this.vx, 0, 520 * dt);
      this.vz = approach(this.vz, 0, 300 * dt);
    }
    this.x = clamp(this.x + this.vx * dt, 14, worldW - 14);
    this.z = clamp(this.z + this.vz * dt, 0, DEPTH);
    if (this.hover) {
      this.alt = clamp(this.alt + this.va * dt, 0, maxAlt(this.z));
    } else if (this.alt > 0 || this.va > 0) {
      this.va -= G * dt;
      this.alt = Math.min(this.alt + this.va * dt, maxAlt(this.z));
      if (this.alt <= 0) { this.alt = 0; this.va = 0; this.onLand(); }
    }
  }

  onLand() {
    this.dashed = false; this.dj = false;
    spawnSparks(this.x, groundY(this.z), 'rgba(200,200,200,0.6)', 5, true);
    if (this.state === 'air') { this.state = 'idle'; this.st = 0; this.trailOn = false; }
    else if (this.state === 'attack' && this.move.type === 'wallrun') this.endMove();
  }

  updIdle(dt) {
    const tp = Object.assign(TMP, GUARD);
    if (this.alt > 0) { this.state = 'air'; return; }
    this.retarget -= dt; this.cool -= dt;
    let t = this.target;
    if (!t || !t.alive || this.retarget <= 0) { t = this.target = pickTarget(this); this.retarget = rand(1.2, 3); }
    if (this.evade > 0) { this.evade -= dt; this.vx = approach(this.vx, 0, 500 * dt); }
    if (this.dash > 0) { this.dash -= dt; if (this.dash <= 0) this.trailOn = false; }
    if (!t) {
      this.vx = approach(this.vx, 0, 300 * dt); this.vz = approach(this.vz, 0, 200 * dt);
      if (roundOver) {
        Object.assign(tp, VICTORY);
        tp.aF += Math.sin(this.time * 6) * 0.25; tp.aB += Math.sin(this.time * 6 + 1) * 0.25;
        this.aura = 0.6;
      }
    } else {
      if (!this.nextMove) this.nextMove = pickMove(this, t);
      const m = this.nextMove, dx = t.x - this.x, dist = Math.abs(dx), dz = t.z - this.z;
      if (dist > 1) this.facing = sgn(dx);
      let dir;
      if (!t.hittable) dir = dist < 60 ? -1 : dist > 90 ? 1 : 0;
      else if (dist > m.range[1] - 2) dir = 1;
      else if (dist < m.range[0] + 2) dir = -1;
      else dir = Math.sin(this.time * 2.3 + this.id) * 0.35;   // Footwork shuffle
      if (this.evade <= 0 && this.dash <= 0) {
        this.vx = approach(this.vx, dir * this.facing * 110, 600 * dt);
        this.vz = approach(this.vz, clamp(dz * 4, -45, 45), 300 * dt);
        // Dash when far away
        if (dir > 0 && dist > 200 && Math.random() < dt * 0.9) {
          this.vx = this.facing * 520; this.dash = 0.22; this.trailOn = true;
        }
      }
      // Jump at random; jump more often when the opponent is airborne
      if (Math.random() < dt * (t.alt > 60 ? 1.2 : 0.22)) {
        this.va = rand(480, 640); this.alt = 1; this.vx = this.facing * rand(100, 260);
        this.state = 'air'; this.st = 0; this.cool = rand(0.1, 0.35);
        return;
      }
      const altOK = m.type && !m.sameAlt ? true : Math.abs(t.alt - this.alt) < 35;
      if (this.cool <= 0 && t.hittable && altOK && dist >= m.range[0] && dist <= m.range[1] && Math.abs(dz) < 9) {
        this.startMove(m);
        return;
      }
    }
    const sp = this.vx * this.facing;
    this.walk += dt * sp * 0.11;
    const amp = Math.min(1, Math.abs(sp) / 60) * 0.32;
    tp.lF += Math.sin(this.walk) * amp; tp.lB -= Math.sin(this.walk) * amp;
    if (Math.abs(sp) > 300) tp.t += 0.4;
    const b = Math.sin(this.time * 7 + this.id);
    tp.kF += b * 0.07; tp.kB += b * 0.07; tp.t += b * 0.02;
    lerpPose(this.pose, tp, Math.min(1, dt * 14), this.pose);
  }

  updAir(dt) {
    lerpPose(this.pose, AIR, Math.min(1, dt * 10), this.pose);
    this.cool -= dt;
    let t = this.target;
    if (!t || !t.alive) t = this.target = pickTarget(this);
    if (this.dash > 0) { this.dash -= dt; if (this.dash <= 0) this.trailOn = false; return; }
    if (!t) return;
    const dx = t.x - this.x;
    if (Math.abs(dx) > 1) this.facing = sgn(dx);
    this.vx = approach(this.vx, this.facing * 90, 200 * dt);
    if (this.cool > 0) return;
    const r = Math.random();
    if (!this.dashed && r < 0.3 && Math.abs(dx) > 80) {
      // Air dash
      this.dashed = true; this.vx = this.facing * 560; this.va = Math.max(this.va, 60);
      this.dash = 0.25; this.trailOn = true; this.cool = rand(0.1, 0.3);
    } else if (!this.dj && r < 0.45 && t.alt > this.alt - 20) {
      // Double jump
      this.dj = true; this.va = 560; this.cool = rand(0.1, 0.3);
      addFx({ type: 'ring', x: this.x, y: groundY(this.z) - this.alt, r0: 3, r1: 22, dur: 0.2, w: 1.5, flat: true });
    } else {
      const m = pickMove(this, t);
      const dist = Math.abs(dx);
      if (m && m.type && m.air && dist >= m.range[0] && dist <= m.range[1] && Math.abs(t.z - this.z) < 20) this.startMove(m);
      else this.cool = rand(0.15, 0.4);
    }
  }

  startMove(m, surprise) {
    this.state = 'attack'; this.st = 0; this.move = m; this.nextMove = null; this.hover = false;
    this.hitDone = false; this.prevHP = null; this.from = clonePose(this.pose);
    this.md = { ph: INIT_PHASE[m.type], next: 0.05, fired: 0 };
    stats.att[m.id] = (stats.att[m.id] || 0) + 1;
    if (!m.type && !surprise) this.warn(m.range[1] + 15, !!m.grab);
  }

  // Nearby opponents may block or back off to dodge. Throws cannot be blocked.
  warn(reach, grab) {
    for (const e of fighters) {
      if (!isEnemy(this, e) || e.state !== 'idle') continue;
      if (Math.abs(e.x - this.x) > reach || Math.abs(e.z - this.z) > 14) continue;
      if (sgn(e.x - this.x) !== this.facing) continue;
      const r = Math.random();
      if (!grab && r < 0.25) {
        e.state = 'block'; e.st = 0; e.dur = (this.move.wind || 0.3) + (this.move.act || 0.4) + rand(0.05, 0.2);
        e.facing = sgn(this.x - e.x);
      } else if (r < 0.37) {
        e.evade = 0.3; e.vx = sgn(e.x - this.x) * rand(160, 230);
      }
    }
  }

  endMove() {
    if (this.move && !this.move.type && !this.hitDone) stats.whiff++;
    this.state = this.alt > 0 ? 'air' : 'idle'; this.st = 0;
    this.move = null; this.md = null; this.spin = false; this.hover = false; this.ghost = false;
    this.rot = 0; this.trailOn = false; this.invis = false; this.alpha = 1; this.vz = 0;
    this.cool = rand(0.15, 0.7);
  }

  updAttack(dt) {
    const m = this.move;
    if (m.type) { this['u_' + m.type](dt); return; }
    const st = this.st, T1 = m.wind, T2 = T1 + m.act, T3 = T2 + m.rec;
    if (st < T1) lerpPose(this.from, m.W, ease(st / T1), this.pose);
    else if (st < T2) lerpPose(m.W, m.A, easeOut(Math.min(1, (st - T1) / (m.act * 0.5))), this.pose);
    else if (st < T3) lerpPose(m.A, GUARD, ease((st - T2) / m.rec), this.pose);
    else { this.endMove(); return; }
    this.spin = !!m.spin && st >= T1 && st < T2 + m.rec * 0.5;
    if (st < T2) this.vx = this.facing * m.lunge * 1.4 / T2;
    else this.vx = approach(this.vx, 0, 500 * dt);
    this.vz = approach(this.vz, 0, 300 * dt);
  }

  // Nearest enemy in front (for moves like rapid punches and the rising uppercut that don't use skeleton hit detection)
  frontEnemy(reach, altRange = 45) {
    let best = null, bd = Infinity;
    for (const e of fighters) {
      if (!isEnemy(this, e) || !e.hittable || Math.abs(e.z - this.z) > 16) continue;
      const d = (e.x - this.x) * this.facing;
      if (d < -6 || d > reach || Math.abs(e.alt - this.alt) > altRange) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  sweepHit(P0, P1, pad = 0) {
    for (const e of fighters) {
      if (!isEnemy(this, e) || !e.hittable || Math.abs(e.z - this.z) > 16 || !e.W) continue;
      const zone = hitTest(P0, P1, e.W, pad);
      if (zone) return [e, zone];
    }
    return null;
  }
  // Steer the flight toward the target (comic homing); turn is the max turn rate in radians per second
  homeTo(t, speed, turn, dt) {
    if (!t || !t.alive || !t.W) return;
    const me = this.W ? mid(this.W.hip, this.W.fF) : { x: this.x, y: groundY(this.z) - this.alt };
    const c = mid(t.W.sh, t.W.hip);
    const want = Math.atan2(c.y - me.y, c.x - me.x);
    let cur = Math.atan2(-this.va, this.vx);
    let d = want - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cur += clamp(d, -turn * dt, turn * dt);
    this.vx = Math.cos(cur) * speed; this.va = -Math.sin(cur) * speed;
    this.vz = clamp((t.z - this.z) * 6, -120, 120);
  }
  bodyPoint() { return this.W ? mid(this.W.sh, this.W.hip) : { x: this.x, y: groundY(this.z) - this.alt - 50 }; }

  // ---- Specials ----
  u_beam(dt) {
    const md = this.md, m = this.move, t = this.target;
    if (this.alt > 0) { this.hover = true; this.va = 0; }
    this.vx = approach(this.vx, 0, 800 * dt);
    if (md.ph === 'charge') {
      this.aura = 1;
      lerpPose(this.pose, CHARGE, Math.min(1, dt * 10), this.pose);
      if (t && t.alive) this.facing = sgn(t.x - this.x);

      if (this.st >= 0.75) {
        md.ph = 'fire'; md.t0 = this.st; md.hit = new Set();
        const H = mid(this.W.hF, this.W.hB);
        let aim = 0;
        if (t && t.W) {
          const c = mid(t.W.sh, t.W.hip);
          aim = clamp(Math.atan2(c.y - H.y, Math.abs(c.x - H.x) + 1), -0.7, 0.9);
        }
        md.aim = aim;
        this.warn(9999, false);
        addFx({ type: 'flash', dur: 0.15 });
        shake = Math.max(shake, 7);
      }
    } else if (md.ph === 'fire') {
      this.aura = 1;
      const p = Object.assign(TMP, FIRE);
      p.aF = 1.57 - md.aim; p.aB = 1.52 - md.aim;
      lerpPose(this.pose, p, Math.min(1, dt * 25), this.pose);
      const ft = this.st - md.t0;
      md.w = Math.min(1, ft / 0.08) * (11 + Math.sin(this.time * 70) * 1.8) * (ft > 0.5 ? Math.max(0, 1 - (ft - 0.5) / 0.15) : 1);
      const O = mid(this.W.hF, this.W.hB);
      const d = { x: this.facing * Math.cos(md.aim), y: Math.sin(md.aim) };
      let tt = d.x > 0 ? (worldW - O.x) / d.x : -O.x / d.x, ground = false;
      const gy = groundY(this.z);
      if (d.y > 0.01) { const tg = (gy - O.y) / d.y; if (tg < tt) { tt = tg; ground = true; } }
      if (d.y < -0.01) tt = Math.min(tt, -O.y / d.y);
      md.O = O; md.E = { x: O.x + d.x * tt, y: O.y + d.y * tt }; md.ground = ground;
      this.vx = -this.facing * 25;
      shake = Math.max(shake, 3);
      if (ground && !md.cracked) { md.cracked = true; quake(md.E.x, md.E.y, 110); }
      if (Math.random() < 0.5) spawnSparks(md.E.x, md.E.y, '#ffffff', 2, false, 1.5);
      for (const e of fighters) {
        if (!isEnemy(this, e) || md.hit.has(e) || !e.hittable || Math.abs(e.z - this.z) > 22 || !e.W) continue;
        const dd = Math.min(segDist(e.W.head.x, e.W.head.y, md.O, md.E), segDist(e.W.sh.x, e.W.sh.y, md.O, md.E),
          segDist(e.W.hip.x, e.W.hip.y, md.O, md.E));
        if (dd < md.w + 8) {
          md.hit.add(e);
          e.takeHit(this, m, 'body', e.bodyPoint(), { launch: { vx: d.x * 780, va: -d.y * 780 + 220 }, big: true });
        }
      }
      if (ft >= 0.65) { md.ph = 'rec'; md.t0 = this.st; md.w = 0; }
    } else {
      lerpPose(this.pose, GUARD, Math.min(1, dt * 8), this.pose);
      if (this.st - md.t0 > 0.3) this.endMove();
    }
  }

  u_blast(dt) {
    const md = this.md, t = this.target, N = 6, gap = 0.13;
    if (this.alt > 0) { this.hover = true; this.va = 0; }
    if (t && t.alive) this.facing = sgn(t.x - this.x);
    this.vx = approach(this.vx, 0, 600 * dt);
    const k = Math.floor(this.st / gap);
    if (k < N) {
      const back = k % 2, p = Object.assign(TMP, GUARD);
      if (back) { p.aB = 1.6; p.eB = 0; p.t = 0.3; } else { p.aF = 1.6; p.eF = 0; p.t = 0.25; }
      lerpPose(this.pose, p, Math.min(1, dt * 30), this.pose);
      this.aura = 0.6;
      if (k >= md.fired && this.W) {
        md.fired = k + 1;
        const H = this.W[back ? 'hB' : 'hF'];
        let a = 0;
        if (t && t.W) { const c = mid(t.W.sh, t.W.hip); a = Math.atan2(c.y - H.y, Math.abs(c.x - H.x) + 1); }
        a = clamp(a + rand(-0.12, 0.12), -1, 1.1);
        const sp = 540;
        shots.push({ x: H.x, y: H.y, vx: this.facing * Math.cos(a) * sp, vy: Math.sin(a) * sp, z: this.z, owner: this, m: this.move, life: 3, col: colorOf(this) });
        spawnSparks(H.x, H.y, '#ffffff', 3);
      }
    } else {
      lerpPose(this.pose, GUARD, Math.min(1, dt * 10), this.pose);
      if (this.st > N * gap + 0.25) this.endMove();
    }
  }

  u_barrage(dt) {
    const md = this.md, m = this.move;
    if (this.st < 0.95) {
      const k = Math.floor(this.st / 0.045) % 2;
      lerpPose(this.pose, k ? MOVE_BY.cross.A : MOVE_BY.jab.A, Math.min(1, dt * 40), this.pose);
      this.ghost = true; this.vx = this.facing * 25;
      if (this.st >= md.next) {
        md.next += 0.08;
        const e = this.frontEnemy(48);
        if (e) {
          const pt = e.bodyPoint();
          e.takeHit(this, m, 'body', pt, { dmg: 1.4, hold: true });
          spawnSparks(pt.x, pt.y, '#ffe28a', 4);
        }
      }
    } else if (!md.fin) {
      md.fin = true; this.ghost = false;
      this.pose = clonePose(MOVE_BY.cross.A);
      const e = this.frontEnemy(56);
      if (e) e.takeHit(this, m, 'head', e.bodyPoint(), { dmg: 9, launch: { vx: this.facing * 720, va: 260 }, big: true });
    } else {
      lerpPose(this.pose, GUARD, Math.min(1, dt * 8), this.pose);
      if (this.st > 1.3) this.endMove();
    }
  }

  u_rising(dt) {
    const md = this.md, m = this.move;
    if (md.ph === 0) {
      lerpPose(this.pose, MOVE_BY.uppercut.W, Math.min(1, dt * 20), this.pose);
      if (this.st > 0.1) {
        md.ph = 1; this.va = 720; this.alt = Math.max(this.alt, 1); this.vx = this.facing * 150; this.trailOn = true;
      }
    } else {
      lerpPose(this.pose, RISE, Math.min(1, dt * 25), this.pose);
      this.aura = 0.7;
      if (!this.hitDone) {
        const e = this.frontEnemy(46, 70);
        if (e) {
          this.hitDone = true;
          e.takeHit(this, m, 'head', this.W.hF, { launch: { vx: this.facing * 160, va: 860 }, big: true });
        }
      }
      if (this.va < 0) this.endMove();
    }
  }

  u_dive(dt) {
    const md = this.md, m = this.move, t = this.target;
    this.trailOn = md.ph !== 'rec';
    if (md.ph === 'jump') {
      if (!md.jumped) {
        md.jumped = true;
        if (this.alt <= 0) {
          this.va = 660; this.alt = 1;
          this.vx = this.facing * Math.min(260, (t ? Math.abs(t.x - this.x) : 100) * 0.6);
        }
      }
      lerpPose(this.pose, AIR, Math.min(1, dt * 12), this.pose);
      if (this.va < 120 || this.alt > 230) {
        md.ph = 'dive'; this.hover = true; md.prev = null;
        let a = 0.8;
        if (t) {
          const tx = t.x, ty = groundY(t.z) - t.alt - 30, my = groundY(this.z) - this.alt;
          if (Math.abs(tx - this.x) > 1) this.facing = sgn(tx - this.x);
          a = clamp(Math.atan2(ty - my, Math.abs(tx - this.x)), 0.3, 1.25);
        }
        md.a = a;
        this.vx = this.facing * Math.cos(a) * 860; this.va = -Math.sin(a) * 860;
      }
    } else if (md.ph === 'dive') {
      const p = Object.assign(TMP, DIVE);
      p.lF = Math.PI / 2 - md.a + 0.15;
      lerpPose(this.pose, p, Math.min(1, dt * 25), this.pose);
      this.aura = 0.5;
      this.homeTo(t, 860, 2.5, dt);
      if (this.vx !== 0) this.facing = sgn(this.vx);
      md.a = clamp(Math.atan2(-this.va, Math.abs(this.vx)), 0, 1.4);
      if (this.W) {
        const H = this.W.fF, P0 = md.prev || H;
        md.prev = { x: H.x, y: H.y };
        const r = this.sweepHit(P0, H, 8);
        if (r) {
          const [e, zone] = r;
          e.takeHit(this, m, zone, H, { launch: { vx: this.facing * 680, va: e.alt > 30 ? -650 : 300 }, big: true });
          this.hover = false; this.va = 400; this.vx = -this.facing * 160;
          this.hitDone = true; this.endMove();
          return;
        }
      }
      if (this.alt <= 0 || this.st > 2.5) {
        this.alt = 0; this.va = 0; this.hover = false; this.vx = 0; this.vz = 0;
        quake(this.x, groundY(this.z), 70);
        md.ph = 'rec'; md.t0 = this.st;
      }
    } else {
      lerpPose(this.pose, CROUCH, Math.min(1, dt * 15), this.pose);
      if (this.st - md.t0 > 0.3) this.endMove();
    }
  }

  u_slam(dt) {
    const md = this.md, m = this.move, t = this.target;
    if (md.ph === 'up') {
      if (!md.jumped) {
        md.jumped = true; md.wasAir = this.alt > 0;
        if (!md.wasAir) {
          this.va = 720; this.alt = 1;
          this.vx = this.facing * clamp((t ? Math.abs(t.x - this.x) : 0) * 1.1, 0, 320);
        }
      }
      lerpPose(this.pose, SLAM_UP, Math.min(1, dt * 12), this.pose);
      this.aura = 0.8;
      if ((this.va < 0 && this.st > 0.25) || (md.wasAir && this.st > 0.12)) {
        md.ph = 'down'; this.hover = true; this.va = -1300; this.vx *= 0.2; this.trailOn = true;
      }
    } else if (md.ph === 'down') {
      lerpPose(this.pose, SLAM_DN, Math.min(1, dt * 25), this.pose);
      if (this.alt <= 0) {
        this.alt = 0; this.va = 0; this.hover = false; this.vx = 0; this.trailOn = false;
        const gx = this.x, gy = groundY(this.z);
        quake(gx, gy, 160);
        shake = Math.max(shake, 13); freeze = Math.max(freeze, 0.08);
        for (const e of fighters) {
          if (!isEnemy(this, e) || !e.hittable || e.alt > 40 || Math.abs(e.z - this.z) > 50) continue;
          const d = Math.abs(e.x - gx);
          if (d > 150) continue;
          e.takeHit(this, m, 'leg', { x: e.x, y: groundY(e.z) - 10 },
            { dmg: m.dmg * (1 - d / 200), launch: { vx: sgn(e.x - gx) * 330, va: 540 } });
        }
        md.ph = 'rec'; md.t0 = this.st;
      }
    } else {
      lerpPose(this.pose, CROUCH, Math.min(1, dt * 15), this.pose);
      if (this.st - md.t0 > 0.35) this.endMove();
    }
  }

  u_teleport(dt) {
    const md = this.md, t = this.target;
    if (!t || !t.alive) { this.endMove(); return; }
    if (md.ph === 'out') {
      this.alpha = Math.max(0, 1 - this.st / 0.12); this.trailOn = true;
      if (this.st >= 0.12) {
        md.ph = 'gone'; this.invis = true;
        addFx({ type: 'ring', x: this.x, y: groundY(this.z) - this.alt - 45, r0: 30, r1: 2, dur: 0.15, w: 1.5 });
      }
    } else if (this.st >= 0.24) {
      this.invis = false; this.alpha = 1; this.trailOn = false; this.trail.length = 0;
      this.x = clamp(t.x - t.facing * 28, 14, worldW - 14);
      this.z = t.z; this.alt = t.alt; this.va = 0;
      this.facing = sgn(t.x - this.x);
      addFx({ type: 'ring', x: this.x, y: groundY(this.z) - this.alt - 45, r0: 2, r1: 40, dur: 0.2, w: 2 });
      // Follow up with an attack right after appearing behind, from the styles that are turned on
      const ids = TELEPORT_FOLLOW.filter(id => cfg.styles[MOVE_BY[id].style]);
      this.startMove(MOVE_BY[pick(ids.length ? ids : TELEPORT_FOLLOW)], true);
    }
  }

  u_wallrun(dt) {
    const md = this.md, m = this.move, t = this.target;
    if (md.ph === 'run') {
      if (md.dir === undefined) md.dir = this.x < worldW / 2 ? -1 : 1;
      this.facing = md.dir; this.vx = md.dir * 450; this.trailOn = true;
      this.walk += dt * 26;
      const p = Object.assign(TMP, RUN);
      p.lF += Math.sin(this.walk) * 0.7; p.lB -= Math.sin(this.walk) * 0.7;
      lerpPose(this.pose, p, Math.min(1, dt * 20), this.pose);
      if ((md.dir < 0 && this.x <= 16) || (md.dir > 0 && this.x >= worldW - 16)) {
        md.ph = 'climb'; md.t0 = this.st; md.dur = rand(0.35, 0.75);
        this.vx = 0; this.hover = true; this.va = 440; this.alt = Math.max(this.alt, 1);
        this.rot = -Math.PI / 2;                       // Body turns sideways, feet on the wall, running upward
      }
      if (this.st > 2.5) this.endMove();
    } else if (md.ph === 'climb') {
      this.walk += dt * 26;
      const p = Object.assign(TMP, RUN);
      p.lF += Math.sin(this.walk) * 0.7; p.lB -= Math.sin(this.walk) * 0.7;
      lerpPose(this.pose, p, Math.min(1, dt * 20), this.pose);
      if (Math.random() < 0.3) spawnSparks(this.x, groundY(this.z) - this.alt, 'rgba(200,200,200,0.6)', 1, false);
      if (this.st - md.t0 > md.dur || this.alt > maxAlt(this.z) - 70) {
        md.ph = 'leap'; this.rot = 0; this.hover = false; md.prev = null;
        this.facing = -md.dir;
        this.hover = true; md.t0 = this.st;
        this.va = 0; this.vx = this.facing * 700;
        this.pose = clonePose(FLYKICK);
      }
    } else {
      lerpPose(this.pose, FLYKICK, Math.min(1, dt * 20), this.pose);
      this.aura = 0.5;
      this.homeTo(t, 700, 3, dt);
      if (Math.abs(this.vx) > 1) this.facing = sgn(this.vx);
      // End on landing, hitting the other wall, or flying too long
      if (this.alt <= 0 || this.st - md.t0 > 1.6 ||
          (this.st - md.t0 > 0.2 && (this.x <= 14 || this.x >= worldW - 14))) {
        this.hover = false; this.vz = 0;
        this.endMove();
        return;
      }
      if (!this.hitDone && this.W) {
        const H = this.W.fF, P0 = md.prev || H;
        md.prev = { x: H.x, y: H.y };
        const r = this.sweepHit(P0, H, 8);
        if (r) {
          const [e, zone] = r;
          e.takeHit(this, m, zone, H, { dmg: 12, launch: { vx: this.facing * 720, va: 320 }, big: true });
          this.hitDone = true; this.hover = false; this.vz = 0; this.va = 320; this.vx = -this.facing * 120;
          this.endMove();
        }
      }
    }
  }

  checkHit() {
    if (this.state !== 'attack' || this.hitDone || this.move.type) return;
    const m = this.move, T1 = m.wind;
    if (this.st < T1 || this.st > T1 + m.act * 0.85) { this.prevHP = null; return; }
    if (m.grab) {
      if (this.st < T1 + m.act * 0.35) return;
      let best = null, bd = Infinity;
      for (const e of fighters) {
        if (!isEnemy(this, e) || !e.hittable || Math.abs(e.z - this.z) > 14 || Math.abs(e.alt - this.alt) > 30) continue;
        const dx = e.x - this.x, d = Math.abs(dx);
        if (d < m.reach && (sgn(dx) === this.facing || d < 8) && d < bd) { bd = d; best = e; }
      }
      if (best) { this.hitDone = true; this.applyGrab(best); }
      return;
    }
    const H = this.W[m.hit], P0 = this.prevHP || H;
    this.prevHP = { x: H.x, y: H.y };
    const r = this.sweepHit(P0, H);
    if (r) { this.hitDone = true; r[0].takeHit(this, m, r[1], H); }
  }

  applyGrab(e) {
    const m = this.move, af = this.facing;
    e.hp -= m.dmg * rand(0.9, 1.1); e.flash = 0.12; e.clearMove();
    stats.hits[m.id] = (stats.hits[m.id] || 0) + 1; stats.throws++;
    spawnSparks(e.W.sh.x, e.W.sh.y, '#ffe28a', 6);
    if (m.grab === 'over') {
      e.facing = -af; e.state = 'thrown'; e.st = 0; e.from = clonePose(e.pose); e.alt = 0;
      e.th = { hx0: e.W.hip.x, hy0: e.W.hip.y, hx1: clamp(this.x - af * 68, 40, worldW - 40),
        hy1: groundY(e.z) - 5, hx: e.W.hip.x, hy: e.W.hip.y, dur: 0.75 };
    } else {
      e.knockDown(af, m.grab === 'takedown' ? 0.25 : 0.3);
    }
  }

  // Drops the current move and every visual state a special leaves behind
  // (afterimage fists, fade, invisibility, aura, trail, body rotation).
  clearMove() {
    this.move = null; this.md = null; this.spin = false; this.hover = false; this.ghost = false;
    this.invis = false; this.alpha = 1; this.aura = 0; this.rot = 0; this.trailOn = false;
  }

  takeHit(att, m, zone, H, o = {}) {
    const dir = att.facing;
    if (this.state === 'block' && this.facing === -dir) {
      this.hp -= (o.dmg ?? m.dmg) * 0.15;
      this.vx = dir * (o.launch ? Math.abs(o.launch.vx) * 0.5 : (m.push || 30) * 1.2 + 60);
      spawnSparks(H.x, H.y, '#9fd4ff', 8); stats.blocked++;
      if (this.hp <= 0) this.ko(dir * 300, -250);
      return;
    }
    const dmg = (o.dmg ?? m.dmg) * (zone === 'head' ? 1.35 : zone === 'leg' ? 0.8 : 1) * rand(0.85, 1.15) * 0.85;
    this.hp -= dmg; this.flash = 0.1;
    this.clearMove();
    stats.hits[m.id] = (stats.hits[m.id] || 0) + 1;
    let Lv = o.launch;
    if (!Lv && !o.hold && (this.alt > 0 || Math.random() < (m.kd || 0) * 2 + (dmg >= 8 ? 0.3 : 0))) {
      Lv = { vx: dir * ((m.push || 30) * 4 + 200), va: m.down ? -400 : (m.up ? 620 : 200 + rand(0, 240)) };
    }
    const big = o.big || (Lv && Math.hypot(Lv.vx, Lv.va) > 650);
    impact(H.x, H.y, big);
    if (this.hp <= 0) {
      const v = Lv || { vx: dir * 520, va: 380 };
      freeze = Math.max(freeze, 0.16); shake = Math.max(shake, 12);
      addFx({ type: 'focus', x: H.x, y: H.y, dur: 0.4 });
      this.ko(v.vx * 1.4, -v.va * 1.3 - 150);
      return;
    }
    if (Lv) { this.launch(Lv.vx, Lv.va); return; }
    this.state = 'hit'; this.st = 0;
    if (o.hold) {
      this.dur = 0.22; this.vx = dir * 20;
      if (this.alt > 0) this.va = Math.max(this.va, 90);
      return;
    }
    this.dur = 0.16 + dmg * 0.025;
    this.vx = dir * ((m.push || 30) + dmg * 2) * 2.2;
  }

  launch(vx, va, quiet) {
    this.state = 'launched'; this.st = 0; this.vx = vx; this.va = va;
    this.alt = Math.max(this.alt, 2); this.hover = false; this.move = null; this.spin = false;
    if (!quiet) { this.juggle++; stats.launches++; }
    this.rotV = sgn(vx) * this.facing * -rand(7, 13);
    this.trailOn = !quiet;
  }

  updLaunched(dt) {
    this.va -= G * dt;
    this.x += this.vx * dt; this.alt += this.va * dt; this.rot += this.rotV * dt;
    this.z = clamp(this.z + this.vz * dt, 0, DEPTH);
    lerpPose(this.pose, TUMBLE, Math.min(1, dt * 8), this.pose);
    const top = maxAlt(this.z);
    if (this.x < 14 || this.x > worldW - 14) {
      const side = this.x < 14 ? -1 : 1;
      this.x = clamp(this.x, 14, worldW - 14);
      if (Math.abs(this.vx) > 380) {
        // Wall hit: the wall cracks and the fighter sticks to it briefly
        const wy = groundY(this.z) - this.alt - 14;
        crack(side < 0 ? 0 : worldW, wy, 'wall', 70);
        addFx({ type: 'ring', x: side < 0 ? 0 : worldW, y: wy, r0: 4, r1: 60, dur: 0.3, w: 3 });
        shake = Math.max(shake, 10); freeze = Math.max(freeze, 0.07);
        this.state = 'splat'; this.st = 0; this.vx = 0; this.va = 0; this.splatSide = side;
        this.rot = side * this.facing * Math.PI / 2; this.trailOn = false; stats.splats++;
        if (this.hp <= 0) this.koPending = true;
        return;
      }
      this.vx = -this.vx * 0.5;
    }
    if (this.alt > top) {
      this.alt = top;
      if (this.va > 0) { this.va = -this.va * 0.4; shake = Math.max(shake, 5); }
    }
    if (this.alt <= 0 && this.va < 0) {
      this.alt = 0;
      const gy = groundY(this.z);
      if (this.va < -450) {
        // Slam into the ground and bounce
        this.va = -this.va * 0.42; this.vx *= 0.6; this.rotV *= 0.7;
        quake(this.x, gy, 80);
      } else {
        this.trailOn = false;
        const r = ((this.rot % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const fs = r < Math.PI ? 1 : -1;
        this.fallSign = fs; this.rot = fs * Math.PI / 2; this.pose = clonePose(DOWN);
        this.x = clamp(this.x - fs * this.facing * 44, 14, worldW - 14);
        this.vx = 0; this.va = 0; this.state = 'down'; this.st = 0; this.downDur = rand(0.6, 1.2);
        spawnSparks(this.x, gy, 'rgba(200,200,200,0.6)', 8, true);
        if (this.hp <= 0) this.koPending = true;
      }
    }
  }

  knockDown(dir, dur) {
    this.state = 'fall'; this.st = 0; this.dur = dur; this.from = clonePose(this.pose);
    this.fallSign = this.facing === -dir ? -1 : 1;     // Facing the attacker means falling backward
    this.clearMove();
  }

  ko(vx, vy) {
    this.state = 'ko'; this.st = 0; this.clearMove(); this.trailOn = true;
    this.rag = makeRag(this.W, vx, vy); stats.ko++;
  }
}

// ---------- Rounds ----------
function newRound() {
  fighters = []; sparks.length = 0; fx.length = 0; shots.length = 0;
  roundOver = false; roundTime = 0; shake = 0; freeze = 0;
  const n = clamp(Math.round(cfg.count), 2, 16);
  const per = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    const team = cfg.mode === 'teams' ? i % 2 : 0;
    let x;
    if (cfg.mode === 'teams') {
      // Red and blue pair off one-on-one across the whole screen instead of crowding the middle
      const k = Math.floor(i / 2);
      x = 40 + (worldW - 80) * (k + 0.5) / per + (team ? 30 : -30);
    } else {
      x = 40 + (worldW - 80) * (i + 0.5) / n + rand(-10, 10);
    }
    const f = new Fighter(i, x, rand(0, DEPTH), team, (i * 360 / n + 10) % 360);
    f.facing = cfg.mode === 'teams' ? (team ? -1 : 1) : x < worldW / 2 ? 1 : -1;
    fighters.push(f);
  }
}
function checkRound(dt) {
  roundTime += dt;
  if (roundOver) { roundTimer -= dt; if (roundTimer <= 0) newRound(); return; }
  const alive = fighters.filter(f => f.alive);
  const sides = new Set(alive.map(f => (cfg.mode === 'teams' ? f.team : f.id)));
  if (sides.size <= 1) {
    roundOver = true; roundTimer = 4.5; stats.rounds++;
    const w = alive[0];
    winnerText = !w ? 'DRAW' : cfg.mode === 'teams' ? TEAM_NAME[w.team] + ' WINS!' : '#' + (w.id + 1) + ' WINS!';
    winnerColor = w ? colorOf(w) : cfg.line;
  } else if (roundTime > 150) {
    newRound();
  }
}

function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    const P0 = { x: s.x, y: s.y };   // Sweep from the last position so a fast blast can't skip a body
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let boom = s.life <= 0 || s.x < -20 || s.x > worldW + 20 || s.y < -20;
    if (!boom && s.y >= groundY(s.z)) { boom = true; crack(s.x, groundY(s.z), 'ground', 25); }
    if (!boom) {
      for (const e of fighters) {
        if (!isEnemy(s.owner, e) || !e.hittable || Math.abs(e.z - s.z) > 16 || !e.W) continue;
        const zone = hitTest(P0, s, e.W, 4);
        if (zone) {
          const air = e.alt > 0 || Math.random() < 0.25;
          e.takeHit({ facing: sgn(s.vx) }, s.m, zone, { x: s.x, y: s.y },
            air ? { dmg: 4, launch: { vx: sgn(s.vx) * 280, va: 200 } } : { dmg: 4, hold: true });
          boom = true;
          break;
        }
      }
    }
    if (boom) {
      addFx({ type: 'ring', x: s.x, y: s.y, r0: 3, r1: 22, dur: 0.2, w: 2, col: s.col });
      spawnSparks(s.x, s.y, s.col, 6);
      shots.splice(i, 1);
    }
  }
}

function update(dt) {
  for (const f of fighters) f.update(dt);
  // Avoid overlap
  for (let i = 0; i < fighters.length; i++) {
    const a = fighters[i];
    if (!SOLID.has(a.state) || a.alt > 20) continue;
    for (let j = i + 1; j < fighters.length; j++) {
      const b = fighters[j];
      const dz = b.z - a.z, adz = Math.abs(dz);
      if (!SOLID.has(b.state) || b.alt > 20 || adz > 10) continue;
      const dx = b.x - a.x, ad = Math.abs(dx);
      if (ad < 16) {
        const s = dx !== 0 ? sgn(dx) : (a.id < b.id ? 1 : -1), push = (16 - ad) * 0.5;
        a.x = clamp(a.x - s * push, 14, worldW - 14); b.x = clamp(b.x + s * push, 14, worldW - 14);
        // Teammates bunched together also spread front to back
        if (!isEnemy(a, b)) {
          const sz = dz !== 0 ? sgn(dz) : (a.id < b.id ? 1 : -1), pz = (10 - adz) * 0.08;
          a.z = clamp(a.z - sz * pz, 0, DEPTH); b.z = clamp(b.z + sz * pz, 0, DEPTH);
        }
      }
    }
  }
  for (const f of fighters) {
    f.W = f.rag ? f.rag.pts : f.joints();
    if (f.koPending) { f.koPending = false; f.ko(0, -40); f.W = f.rag.pts; }
    // Afterimages
    if (f.trailOn && !f.invis) {
      f.trailT -= dt;
      if (f.trailT <= 0) {
        f.trailT = 0.03;
        const snap = {};
        for (const k of JOINTS) snap[k] = { x: f.W[k].x, y: f.W[k].y };
        f.trail.push({ p: snap, life: 1 });
        if (f.trail.length > 10) f.trail.shift();
      }
    }
    for (let i = f.trail.length - 1; i >= 0; i--) {
      f.trail[i].life -= dt * 3.5;
      if (f.trail[i].life <= 0) f.trail.splice(i, 1);
    }
  }
  for (const f of fighters) f.checkHit();
  updateShots(dt);
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt; s.life -= dt * 2.5;
    if (s.life <= 0) sparks.splice(i, 1);
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    fx[i].t += dt;
    if (fx[i].t >= fx[i].dur) fx.splice(i, 1);
  }
  checkRound(dt);
}

// ---------- Rendering ----------
function colorOf(f) {
  if (cfg.mode === 'teams') return TEAM_COLOR[f.team];
  if (cfg.colorful) return `hsl(${f.hue},80%,66%)`;
  return cfg.line;
}
function path(...pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}
function drawSkeleton(J, col, alpha, width, headFill) {
  ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha * 0.55;
  path(J.sh, J.eB, J.hB); path(J.hip, J.kB, J.fB);
  ctx.globalAlpha = alpha;
  path(J.hip, J.sh, J.head);
  path(J.hip, J.kF, J.fF); path(J.sh, J.eF, J.hF);
  ctx.beginPath(); ctx.arc(J.head.x, J.head.y, L.head, 0, Math.PI * 2);
  if (headFill) { ctx.fillStyle = cfg.bg; ctx.fill(); }
  ctx.stroke();
}
function drawAura(f, col) {
  const J = f.W;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = 12;
  for (let i = 0; i < 12; i++) {
    const j = J[pick(JOINTS)];
    const x = j.x + rand(-9, 9), y = j.y + rand(-6, 6);
    ctx.globalAlpha = rand(0.2, 0.6) * f.aura;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + rand(-7, 7), y - rand(8, 16), x + rand(-4, 4), y - rand(18, 32));
    ctx.stroke();
  }
  ctx.restore();
}
function drawFighter(f) {
  const J = f.W;
  if (!J || f.invis) return;
  const col = colorOf(f);
  for (const tr of f.trail) drawSkeleton(tr.p, col, tr.life * 0.3 * f.alpha, 2, false);
  if (f.aura > 0 && f.alive) drawAura(f, col);
  const base = (f.alive ? 1 : 0.5) * f.alpha;
  drawSkeleton(J, f.flash > 0 ? '#ffffff' : col, base, 3.2, true);
  ctx.globalAlpha = 1;
  const m = f.move;
  if (f.ghost) {
    // Rapid punches: several afterimage fists
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    for (let i = 0; i < 7; i++) {
      const p = { x: J.sh.x + f.facing * rand(16, 38), y: J.sh.y + rand(-16, 10) };
      ctx.globalAlpha = rand(0.25, 0.6);
      path(J.sh, p);
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (m && m.type === 'beam' && f.md) {
    const md = f.md, H = mid(J.hF, J.hB);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    if (md.ph === 'charge') {
      const r = 3 + Math.min(1, f.st / 0.75) * 8 + Math.sin(f.time * 50);
      const g = ctx.createRadialGradient(H.x, H.y, 0, H.x, H.y, r * 1.8);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(H.x, H.y, r * 1.8, 0, Math.PI * 2); ctx.fill();
    } else if (md.ph === 'fire' && md.w > 0 && md.O) {
      ctx.shadowColor = col; ctx.shadowBlur = 25;
      ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = md.w * 2.8; path(md.O, md.E);
      ctx.globalAlpha = 0.85; ctx.lineWidth = md.w * 1.7; path(md.O, md.E);
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.lineWidth = md.w * 0.8; path(md.O, md.E);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(md.O.x, md.O.y, md.w * 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(md.E.x, md.E.y, md.w * rand(1.8, 2.8), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
function drawFx(o, layer) {
  // Full-screen effects that flash or flicker; Reduce motion hides them
  if (cfg.reduceMotion && (o.type === 'flash' || o.type === 'focus')) return;
  const u = o.t / o.dur;
  if (o.type === 'crack' && layer === 0) {
    const a = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    if (o.kind === 'ground') {
      ctx.globalAlpha = 0.35 * a; ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(o.x, o.y, o.size * 0.35, o.size * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = cfg.line; ctx.lineWidth = 0.9;
    for (const pts of o.lines) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  } else if (o.type === 'ring' && layer === 1) {
    const r = o.r0 + (o.r1 - o.r0) * easeOut(u);
    ctx.globalAlpha = 1 - u; ctx.strokeStyle = o.col || '#ffffff'; ctx.lineWidth = o.w * (1 - u * 0.6);
    ctx.beginPath();
    if (o.flat) ctx.ellipse(o.x, o.y, r, r * 0.22, 0, 0, Math.PI * 2);
    else ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (o.type === 'focus' && layer === 2) {
    // Speed lines
    const R = Math.hypot(worldW, worldH);
    ctx.globalAlpha = 0.35 * (1 - u); ctx.fillStyle = cfg.line;
    for (let i = 0; i < 46; i++) {
      const a = rand(0, Math.PI * 2), w = rand(0.004, 0.014), rin = rand(70, 130);
      ctx.beginPath();
      ctx.moveTo(o.x + Math.cos(a) * rin, o.y + Math.sin(a) * rin);
      ctx.lineTo(o.x + Math.cos(a - w) * R, o.y + Math.sin(a - w) * R);
      ctx.lineTo(o.x + Math.cos(a + w) * R, o.y + Math.sin(a + w) * R);
      ctx.fill();
    }
  } else if (o.type === 'flash' && layer === 3) {
    ctx.globalAlpha = 0.35 * (1 - u); ctx.fillStyle = '#ffffff';
    ctx.fillRect(-50, -50, worldW + 100, worldH + 100);
  }
  ctx.globalAlpha = 1;
}
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = cfg.bg; ctx.fillRect(0, 0, SW, SH);
  const sk = cfg.reduceMotion ? 0 : shake;
  const ox = sk ? rand(-sk, sk) : 0, oy = sk ? rand(-sk, sk) : 0;
  ctx.setTransform(dpr * S, 0, 0, dpr * S, ox * dpr, oy * dpr);
  ctx.fillStyle = cfg.line;
  ctx.globalAlpha = 0.035; ctx.fillRect(-20, floorTop - 6, worldW + 40, DEPTH + 12);
  ctx.globalAlpha = 0.12; ctx.fillRect(-20, floorTop + DEPTH + 6, worldW + 40, 0.7);
  ctx.globalAlpha = 1;
  for (const o of fx) drawFx(o, 0);

  const list = fighters.slice().sort((a, b) => (a.alive - b.alive) || (a.z - b.z));
  for (const f of list) {
    if (f.invis) continue;
    const x = f.rag ? f.rag.pts.hip.x : f.state === 'thrown' ? f.th.hx : f.x;
    const k = 1 - Math.min(0.7, f.alt / 300);
    ctx.globalAlpha = 0.12 * k; ctx.fillStyle = cfg.line;
    ctx.beginPath(); ctx.ellipse(x, groundY(f.z), 14 * k, 2.5 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of list) drawFighter(f);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of shots) {
    ctx.shadowColor = s.col; ctx.shadowBlur = 14;
    ctx.fillStyle = s.col; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  for (const o of fx) drawFx(o, 1);
  ctx.lineWidth = 1.2;
  for (const s of sparks) {
    ctx.globalAlpha = Math.max(0, s.life); ctx.strokeStyle = s.col;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (cfg.showHP) {
    for (const f of list) {
      if (!f.alive || !f.W || f.invis) continue;
      const hx = f.W.head.x, hy = Math.min(f.W.head.y, f.W.hip.y - 30);
      ctx.globalAlpha = 0.25; ctx.fillStyle = cfg.line; ctx.fillRect(hx - 13, hy - 17, 26, 2.5);
      ctx.globalAlpha = 0.9; ctx.fillStyle = colorOf(f); ctx.fillRect(hx - 13, hy - 17, 26 * clamp(f.hp / 100, 0, 1), 2.5);
    }
  }
  for (const o of fx) drawFx(o, 2);
  for (const o of fx) drawFx(o, 3);
  if (roundOver) {
    ctx.globalAlpha = clamp(roundTimer, 0, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = '900 26px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000000';
    ctx.strokeText(winnerText, worldW / 2, worldH * 0.2);
    ctx.fillStyle = winnerColor; ctx.fillText(winnerText, worldW / 2, worldH * 0.2);
  }
  ctx.globalAlpha = 1;
}

// ---------- Main loop ----------
const SUBSTEP = 1 / 60, MAX_SUBSTEPS = 12;   // real is capped at 0.05 s, so 300% needs at most 9
let paused = false, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) { last = now; return; }
  if (cfg.fps > 0 && now - last < 1000 / cfg.fps - 2) return;
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  shake = shake > 0.3 ? shake * Math.pow(0.0015, real) : 0;
  if (freeze > 0) { freeze -= real; render(); return; }   // Hit stop
  // Split the simulated time into equal substeps of at most about 1/60 s, so blasts,
  // strike and grab windows and ragdolls see the same step size at any speed or frame rate.
  // The 0.1 slack keeps a slightly long 60 fps frame at 100% speed in one step.
  const sim = real * cfg.speed;
  const n = clamp(Math.ceil(sim / SUBSTEP - 0.1), 1, MAX_SUBSTEPS);
  for (let i = 0; i < n; i++) {
    update(sim / n);
    // A hit started a hit stop: drop the rest of this frame's time, so the fight pauses
    // at the hit instead of running on past it. At 100% speed a frame is one step anyway.
    if (freeze > 0) break;
  }
  render();
}

// ---------- Wallpaper Engine settings ----------
const weColor = v => 'rgb(' + v.split(' ').map(c => Math.round(clamp(+c, 0, 1) * 255)).join(',') + ')';
window.wallpaperPropertyListener = {
  applyUserProperties(p) {
    let reset = false;
    if (p.fightercount) { cfg.count = p.fightercount.value; reset = true; }
    if (p.gamemode) { cfg.mode = p.gamemode.value; reset = true; }
    if (p.gamespeed) cfg.speed = p.gamespeed.value / 100;
    if (p.figurescale) { cfg.scale = p.figurescale.value / 100; resize(); reset = true; }
    if (p.showhealth) cfg.showHP = p.showhealth.value;
    if (p.colorful) cfg.colorful = p.colorful.value;
    if (p.backgroundcolor) { cfg.bg = weColor(p.backgroundcolor.value); document.body.style.background = cfg.bg; }
    if (p.linecolor) cfg.line = weColor(p.linecolor.value);
    if (p.reducemotion) cfg.reduceMotion = p.reducemotion.value;
    for (const s of Object.keys(cfg.styles)) if (p['style' + s]) cfg.styles[s] = p['style' + s].value;
    if (reset) newRound();
  },
  applyGeneralProperties(p) { if (p.fps !== undefined) cfg.fps = p.fps; },
  setPaused(v) { paused = v; },
};

window.addEventListener('resize', resize);
resize();
newRound();
requestAnimationFrame(frame);
})();
