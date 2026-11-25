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
  showScore: false,    // running score board in a top corner
  bg: '#111318',
  bgTheme: 'plain',     // 'plain' | 'dojo' | 'rooftop' | 'comic' | 'daynight'
  line: '#ececec',
  fps: 0,               // 0 = uncapped
  reduceMotion: true,   // skip full-screen flashes and speed lines, no screen shake
  sound: false,         // sound effects, off unless turned on
  volume: 0.5,          // 0 to 1
  names: [],            // fighter names from the settings panel; '' keeps #n
  headgear: false,      // headband, ninja mask, cap or topknot per fighter
  slowmo: false,        // slow-motion finish on the knockout that ends a round
  audio: false,         // React to music (Wallpaper Engine's audio listener)
  audioStrength: 0.5,   // 0 to 1
  clickBlast: false,    // a click on the wallpaper launches the fighters near it
  rules: 'normal',      // Round rules: 'normal' | 'king' | 'ladder' | 'survival'
  platforms: false,     // floating platforms, off by default
  styles: { boxing: true, muaythai: true, taekwondo: true, judo: true, wrestling: true, super: true, magic: true, ninjutsu: true },
};
// ---------- Helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const ease = u => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
const easeOut = u => 1 - (1 - u) * (1 - u);
const sgn = v => (v >= 0 ? 1 : -1);
const pick = a => a[Math.floor(Math.random() * a.length)];
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Query string, for a plain browser: numbers are clamped to the settings panel's ranges,
// switches take 1/true/on/yes or 0/false/off/no, and any other value keeps the default.
const q = new URLSearchParams(location.search);
const qNum = (k, lo, hi, d) => {
  const s = (q.get(k) ?? '').trim();
  const v = s === '' ? NaN : Number(s);
  return Number.isFinite(v) ? clamp(v, lo, hi) : d;
};
const qBool = (k, d) => {
  const s = q.get(k) ?? '';
  return /^(1|true|on|yes)$/i.test(s) ? true : /^(0|false|off|no)$/i.test(s) ? false : d;
};
cfg.count = Math.round(qNum('count', 2, 16, cfg.count));
cfg.speed = qNum('speed', 0.25, 3, cfg.speed);
if (q.get('mode') === 'ffa' || q.get('mode') === 'teams') cfg.mode = q.get('mode');
cfg.reduceMotion = qBool('reducemotion', cfg.reduceMotion);
cfg.sound = qBool('sound', cfg.sound);
cfg.volume = qNum('volume', 0, 100, cfg.volume * 100) / 100;

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
const CALL = P({ t: -0.1, aF: 2.95, eF: 0.1, aB: 0.9, eB: 1.6 });              // Front arm raised to call down lightning
const FLING = P({ t: -0.15, aF: -0.3, eF: 1.2, aB: 0.6, eB: 1.8, lF: 0.6, kF: -0.4 });  // Front hand drawn back to throw
const SEAL = P({ t: 0.05, aF: 1.0, eF: 2.4, aB: 1.1, eB: 2.3 });              // Hands together in a seal
const WARD = P({ t: 0.05, aF: 1.6, eF: 0.25, aB: 1.3, eB: 2.4, lF: 0.5, kF: -0.4 });  // Open palm held out for a shield

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
  { id: 'blast', type: 'blast', range: [100, 9999], w: 2.5, air: true, dmg: 4, antiAir: true, speed: 540 },
  { id: 'barrage', type: 'barrage', range: [14, 40], w: 3, dmg: 1.4, sameAlt: true },
  { id: 'rising', type: 'rising', range: [8, 42], w: 3, dmg: 10, antiAir: true },
  { id: 'dive', type: 'dive', range: [60, 480], w: 3, air: true, dmg: 12, antiAir: true },
  { id: 'slam', type: 'slam', range: [30, 240], w: 2, air: true, dmg: 12 },
  { id: 'teleport', type: 'teleport', range: [110, 9999], w: 2 },
  { id: 'wallrun', type: 'wallrun', range: [0, 9999], w: 2.5, needWall: true },
];
// Elemental spells. The shield is never picked as an attack: a fighter raises it when warned of a hit.
const MAGIC = [
  { id: 'fireball', type: 'fireball', range: [90, 9999], w: 2.5, air: true, dmg: 10, speed: 430 },
  { id: 'lightning', type: 'lightning', range: [120, 9999], w: 2, dmg: 14 },
  { id: 'ice', type: 'ice', range: [80, 9999], w: 2.5, air: true, dmg: 5, speed: 720 },
  { id: 'shield', type: 'shield', range: [0, 9999], w: 0, reactive: true },
];
// Ninja techniques. Smoke escape and substitution are reactions to a warned attack, never picked as attacks.
const NINJA = [
  { id: 'shuriken', type: 'shuriken', range: [80, 9999], w: 2.5, air: true, dmg: 3, speed: 620 },
  { id: 'clones', type: 'clones', range: [40, 220], w: 2, dmg: 5 },
  { id: 'smoke', type: 'smoke', range: [0, 9999], w: 0, reactive: true },
  { id: 'substitute', type: 'substitute', range: [0, 9999], w: 0, reactive: true },
];
const SPECIALS = [...SUPER, ...MAGIC, ...NINJA];
const SHIELD_UP = 1.1;       // Seconds a shield stays up, longer against a far projectile
const SMOKE_OUT = 0.3;       // Seconds hidden in a smoke escape, longer against a far projectile
const BEAM_FIRE = 0.65;      // Seconds an energy beam fires and can hit
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
for (const m of MAGIC) { m.style = 'magic'; MOVE_BY[m.id] = m; }
for (const m of NINJA) { m.style = 'ninjutsu'; MOVE_BY[m.id] = m; }
const ELEMENT = { fire: '#ff8a3d', ice: '#9fe8ff', bolt: '#fff3a0', star: '#d8dde6' };
const SMOKE = 'rgba(190,190,200,0.55)', WOOD = '#a0703f';

// ---------- Canvas and world ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let SW = 0, SH = 0, dpr = 1, S = 1, worldW = 0, worldH = 0, floorTop = 0;
const DEPTH = 120;           // Front-to-back depth, so a crowd doesn't stand on one line
const G = 1400;              // Comic gravity: jump high, fall fast
const groundY = z => floorTop + z;
// A standing figure's health bar tops out about 108 above its feet; the highest altitude
// keeps it on screen, which matters at large figure sizes, where the screen is short
const FIG_TOP = 110;
const maxAlt = z => groundY(z) - FIG_TOP;

// ---------- Platforms ----------
// Optional thin floating ledges (setting "Floating platforms", off by default). A platform is
// a span x0..x1 at the screen height y; a fighter stands on it with its feet at y whatever its
// depth, so its altitude there is groundY(z) - y. No top is higher on screen than FIG_TOP, so
// heads stay on screen; one that would not fit at this figure size is left out.
let platforms = [];
function layoutPlatforms() {
  platforms = [];
  if (!cfg.platforms) return;
  const add = (a, b, y) => { if (y >= FIG_TOP && y <= floorTop - 40) platforms.push({ x0: worldW * a, x1: worldW * b, y }); };
  add(0.1, 0.32, floorTop - 60); add(0.68, 0.9, floorTop - 60);
  if (worldW >= 700) add(0.4, 0.6, floorTop - 125);
}
// The platform whose top is at the screen height feet (within half a unit) under x, or null
function platformAt(x, feet) {
  for (const p of platforms) if (x >= p.x0 && x <= p.x1 && Math.abs(p.y - feet) <= 0.5) return p;
  return null;
}
// Altitude at depth z of the highest platform top under x that is at or below the screen
// height feet, or 0 (the floor) when there is none
function platformAlt(x, z, feet) {
  let h = 0;
  for (const p of platforms) {
    if (x >= p.x0 && x <= p.x1 && p.y >= feet - 0.5) h = Math.max(h, groundY(z) - p.y);
  }
  return h;
}
// A ragdoll point that crossed a platform top from above this step lands on it, as on the floor
function ragPlatform(o, k) {
  for (const p of platforms) {
    const top = p.y - (k === 'head' ? L.head : 1.5);
    if (o.x >= p.x0 && o.x <= p.x1 && o.sy <= top + 0.5 && o.y > top) {
      const vy = o.y - o.py, vx = o.x - o.px;
      o.y = top; o.py = top + vy * 0.3; o.px = o.x - vx * 0.75;
    }
  }
}
function drawPlatforms() {
  ctx.fillStyle = cfg.line;
  for (const p of platforms) {
    ctx.globalAlpha = 0.85; ctx.fillRect(p.x0, p.y, p.x1 - p.x0, 2.5);
    ctx.globalAlpha = 0.15; ctx.fillRect(p.x0 + 3, p.y + 2.5, p.x1 - p.x0 - 6, 4);
  }
  ctx.globalAlpha = 1;
}
let laidOut = false;         // Whether the world has had a real (non-zero) size yet
function resize() {
  // A window that is 0 in either dimension (a page opened hidden, a 0-size frame) has no
  // world to lay out: dividing by it would put every fighter at NaN or Infinity. Keep the
  // last layout and wait for a real size.
  if (!(window.innerWidth > 0 && window.innerHeight > 0)) return;
  dpr = window.devicePixelRatio || 1;
  SW = window.innerWidth; SH = window.innerHeight;
  canvas.width = Math.round(SW * dpr); canvas.height = Math.round(SH * dpr);
  canvas.style.width = SW + 'px'; canvas.style.height = SH + 'px';
  S = cfg.scale * SH / 540;
  worldW = SW / S; worldH = SH / S;
  floorTop = worldH * 0.74 - DEPTH / 2;
  layoutPlatforms();
  // Fighters placed before the first real size stood on a 0-wide floor; spread them over this one
  if (!laidOut) { laidOut = true; if (fighters.length) { newRound(); return; } }
  for (const f of fighters) {
    f.x = clamp(f.x, 14, worldW - 14);
    // A body at rest no longer simulates, so slide it whole back inside a narrower screen
    if (f.rag) {
      const xs = Object.values(f.rag.pts).map(o => o.x);
      const lo = Math.min(...xs), hi = Math.max(...xs);
      const dx = hi > worldW - 4 ? Math.max(worldW - 4 - hi, 4 - lo) : lo < 4 ? 4 - lo : 0;
      if (dx) for (const o of Object.values(f.rag.pts)) { o.x += dx; o.px += dx; }
    }
  }
  // Items on the floor too, or one left past the edge could never be picked up
  for (const it of items) it.x = clamp(it.x, 40, worldW - 40);
}

const TEAM_COLOR = ['#ff6b6b', '#4dabf7'];
const TEAM_NAME = ['RED', 'BLUE'];
const HIT_STATES = new Set(['idle', 'air', 'attack', 'hit', 'block', 'launched', 'splat', 'frozen']);
const SOLID = new Set(['idle', 'attack', 'hit', 'block', 'frozen']);
const SUB_STATES = new Set(['idle', 'air', 'attack', 'hit', 'block']);   // States a substitution can be made from
const isEnemy = (a, b) => a !== b && (cfg.mode === 'teams' ? a.team !== b.team : true);

let fighters = [];
const sparks = [], fx = [], shots = [];
let shake = 0, freeze = 0, freezeGap = 0;
// Hit stop: the whole fight pauses for t seconds of game time at a hit. After one ends, the
// fight runs at least FREEZE_GAP times as long before a new one can start, so with many
// fighters hit stops take at most a small share of the time and Speed is still honored.
// A hit inside a hit stop (a knockout on the same blow, say) may still lengthen it.
const FREEZE_GAP = 12;
function hitStop(t) {
  if (freeze <= 0 && freezeGap > 0) return;
  freeze = Math.max(freeze, t);
  freezeGap = Math.max(freezeGap, freeze * FREEZE_GAP);
}
let roundOver = false, roundTimer = 0, roundTime = 0, winnerText = '', winnerColor = '#fff';
// Slow-motion finish (optional, issue #90): the knockout that ends a round runs game time at a
// quarter for SLOWMO_HOLD s of real time, then eases back to full speed over SLOWMO_EASE s.
// Unless motion is reduced, the view also zooms in up to 1 + SLOWMO_ZOOM times toward the
// fighter knocked out, and back out as the slow motion ends.
const SLOWMO_HOLD = 0.8, SLOWMO_EASE = 0.4, SLOWMO_ZOOM = 0.4, SLOWMO_ZOOM_IN = 0.2;
let slowmoT = -1, slowmoOn = null, lastKO = null;   // slowmoT: real time since it began, -1 when off
// The world transform render() last drew with, in CSS pixels: screen = world * S * z + (x, y).
// A click is turned back into world units with it, zoom and screen shake included.
let view = { z: 1, x: 0, y: 0 };
function startSlowmo() { if (cfg.slowmo) { slowmoT = 0; slowmoOn = lastKO; } }
// 1 while time is slow, easing to 0 as full speed comes back
function slowmoLevel() {
  if (slowmoT < 0) return 0;
  return slowmoT < SLOWMO_HOLD ? 1 : 1 - ease(clamp((slowmoT - SLOWMO_HOLD) / SLOWMO_EASE, 0, 1));
}
// The share of real time this frame runs as game time; moves the slow motion on by real seconds
function slowmoRate(real) {
  if (slowmoT < 0) return 1;
  const k = slowmoLevel();
  slowmoT += real;
  if (slowmoT >= SLOWMO_HOLD + SLOWMO_EASE) slowmoT = -1;
  return 1 - 0.75 * k;
}
// Replaces the world transform with one zoomed in about the knocked-out fighter, which stays
// where it is on screen; (ox, oy) is the screen shake
function slowmoView(ox, oy) {
  if (slowmoT < 0 || cfg.reduceMotion) return;
  const z = 1 + SLOWMO_ZOOM * ease(clamp(slowmoT / SLOWMO_ZOOM_IN, 0, 1)) * slowmoLevel();
  const f = slowmoOn, p = !f ? { x: worldW / 2, y: worldH / 2 } : f.rag ? f.rag.pts.hip : { x: f.x, y: groundY(f.z) };
  const cx = clamp(p.x * S, 0, SW), cy = clamp(p.y * S, 0, SH);
  view = { z, x: ox * z + cx * (1 - z), y: oy * z + cy * (1 - z) };
  ctx.setTransform(dpr * S * z, 0, 0, dpr * S * z, view.x * dpr, view.y * dpr);
}
const stats = { att: {}, hits: {}, whiff: 0, blocked: 0, shielded: 0, subs: 0, ko: 0, rounds: 0, throws: 0, launches: 0, splats: 0, sfx: {} };
window.__stickmanBrawl = { stats, cfg, MOVES, SUPER, MAGIC, NINJA, shots, fx, sfx, soundSetVolume, soundSetPaused, checkRound, update, pickMove, pickTarget,
  render: () => render(),
  get fighters() { return fighters; } };
Object.defineProperty(window.__stickmanBrawl, 'platforms', { get: () => platforms });
window.__stickmanBrawl.groundY = groundY;

// ---------- Score board ----------
// Wins per side across rounds: per team in teams mode, per fighter number in free-for-all.
// Draws are not counted. The tally starts over when the fighter count or mode changes, since
// fighter numbers mean something else then; other settings keep it.
const score = { key: '', wins: [] };
window.__stickmanBrawl.score = score;
function scoreRound(n) {
  const key = cfg.mode + n;
  if (key !== score.key) { score.key = key; score.wins = new Array(cfg.mode === 'teams' ? 2 : n).fill(0); }
}
function scoreWin(w) { if (w) score.wins[cfg.mode === 'teams' ? w.team : w.id]++; }
// Draws the score line in the top left corner: "RED 5 : 3 BLUE" in teams mode, the top three
// fighters by wins ("#3 ×4  #1 ×2") in free-for-all. Text stays language-neutral.
function drawScore() {
  const parts = [];
  if (cfg.mode === 'teams') {
    parts.push([TEAM_NAME[0] + ' ' + score.wins[0], TEAM_COLOR[0]], [' : ', cfg.line], [score.wins[1] + ' ' + TEAM_NAME[1], TEAM_COLOR[1]]);
  } else {
    const top = score.wins.map((w, id) => ({ w, id })).filter(o => o.w > 0).sort((a, b) => b.w - a.w || a.id - b.id).slice(0, 3);
    for (const o of top) {
      if (parts.length) parts.push(['  ', null]);
      const f = fighters[o.id];
      parts.push([(f ? labelOf(f) : '#' + (o.id + 1)) + ' ×' + o.w, f ? colorOf(f) : cfg.line]);
    }
  }
  if (!parts.length) return;
  ctx.globalAlpha = 0.85;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = '700 14px "Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';
  ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000000';
  let x = 14;
  for (const [text, col] of parts) {
    if (col) { ctx.strokeText(text, x, 24); ctx.fillStyle = col; ctx.fillText(text, x, 24); }
    x += ctx.measureText(text).width;
  }
  ctx.globalAlpha = 1;
}

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
  if (kind === 'wall') sfx('wall', x);
}
function impact(x, y, big) {
  addFx({ type: 'ring', x, y, r0: 4, r1: big ? 70 : 34, dur: big ? 0.35 : 0.22, w: big ? 3 : 2 });
  spawnSparks(x, y, '#ffe28a', big ? 18 : 10, false, big ? 1.6 : 1);
  sfx(big ? 'hitBig' : 'hit', x);
  shake = Math.max(shake, big ? 9 : 4);
  hitStop(big ? 0.09 : 0.035);
  if (big) addFx({ type: 'focus', x, y, dur: 0.28 });
}
// A cloud of smoke: a few grey balls that swell and fade
function puff(x, y, size) {
  const balls = [];
  for (let i = 0; i < 7; i++) balls.push({ dx: rand(-14, 14) * size, dy: rand(-20, 20) * size, r: rand(8, 15) * size });
  addFx({ type: 'puff', x, y, balls, dur: 0.5 });
}
function quake(x, y, r) {
  addFx({ type: 'ring', x, y, r0: 6, r1: r, dur: 0.4, w: 3, flat: true });
  crack(x, y, 'ground', r * 0.7);
  sfx('boom', x, r / 110);
  spawnSparks(x, y, 'rgba(210,210,210,0.75)', 22, true, 2);
  shake = Math.max(shake, 10);
}

// ---------- Sound ----------
// Every sound is synthesized from noise and oscillators, so nothing is loaded.
// The AudioContext is created on the first sound played while sound is on.
const MAX_VOICES = 6, SFX_GAP = 0.04;      // sounds at once; seconds between two of one kind
const snd = { ac: null, master: null, noise: null, ends: [], last: {} };
function soundContext() {
  if (snd.ac) return snd.ac;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { snd.ac = new AC(); } catch (e) { return null; }
  snd.master = snd.ac.createGain();
  snd.master.gain.value = cfg.volume;
  // A limiter after the master, so several loud sounds at once do not clip
  const lim = snd.ac.createDynamicsCompressor();
  lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 12;
  lim.attack.value = 0.002; lim.release.value = 0.2;
  snd.master.connect(lim);
  lim.connect(snd.ac.destination);
  const n = Math.floor(snd.ac.sampleRate * 0.5);
  snd.noise = snd.ac.createBuffer(1, n, snd.ac.sampleRate);
  const d = snd.noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return snd.ac;
}
// A gain that rises to peak in 5 ms and decays to silence by t + dur.
function envGain(ac, out, t, peak, dur) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  return g;
}
// An oscillator gliding from f0 to f1 Hz.
function tone(ac, out, t, type, f0, f1, dur, peak) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  o.connect(envGain(ac, out, t, peak, dur));
  o.start(t); o.stop(t + dur + 0.02);
}
// White noise through a filter whose frequency glides from f0 to f1 Hz.
function noise(ac, out, t, filter, f0, f1, dur, peak, q = 1) {
  const s = ac.createBufferSource();
  s.buffer = snd.noise;
  const f = ac.createBiquadFilter();
  f.type = filter; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  s.connect(f); f.connect(envGain(ac, out, t, peak, dur));
  s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.02);
}
// Each recipe plays one sound at time t and returns how long it lasts.
// s scales loudness (0.3 to 1.6); v is a small random detune, so repeats differ.
const SFX = {
  hit: (ac, o, t, s, v) => { noise(ac, o, t, 'bandpass', 1800 * v, 1500 * v, 0.06, 0.4 * s, 1.2); tone(ac, o, t, 'sine', 160 * v, 70 * v, 0.09, 0.5 * s); return 0.1; },
  hitBig: (ac, o, t, s, v) => { noise(ac, o, t, 'bandpass', 1200 * v, 800 * v, 0.12, 0.55 * s, 1); tone(ac, o, t, 'sine', 120 * v, 45 * v, 0.18, 0.7 * s); return 0.2; },
  block: (ac, o, t, s, v) => { noise(ac, o, t, 'highpass', 2500 * v, 2500 * v, 0.04, 0.25 * s); tone(ac, o, t, 'triangle', 900 * v, 700 * v, 0.03, 0.2 * s); return 0.05; },
  whiff: (ac, o, t, s, v) => { noise(ac, o, t, 'bandpass', 600 * v, 2000 * v, 0.15, 0.12 * s, 2); return 0.16; },
  boom: (ac, o, t, s, v) => { tone(ac, o, t, 'sine', 90 * v, 35 * v, 0.4, 0.6 * s); noise(ac, o, t, 'lowpass', 400 * v, 150 * v, 0.35, 0.4 * s); return 0.4; },
  wall: (ac, o, t, s, v) => { noise(ac, o, t, 'lowpass', 1500 * v, 400 * v, 0.3, 0.5 * s); tone(ac, o, t, 'square', 70 * v, 50 * v, 0.2, 0.1 * s); return 0.3; },
  ko: (ac, o, t, s, v) => { tone(ac, o, t, 'sine', 110 * v, 30 * v, 0.45, 0.75 * s); noise(ac, o, t, 'lowpass', 600 * v, 200 * v, 0.2, 0.25 * s); return 0.45; },
  charge: (ac, o, t, s, v) => { tone(ac, o, t, 'triangle', 200 * v, 800 * v, 0.5, 0.1 * s); return 0.5; },
  fire: (ac, o, t, s, v) => { noise(ac, o, t, 'bandpass', 3000 * v, 500 * v, 0.25, 0.35 * s); tone(ac, o, t, 'sine', 300 * v, 80 * v, 0.2, 0.4 * s); return 0.25; },
  step: (ac, o, t, s, v) => { noise(ac, o, t, 'bandpass', 900 * v, 900 * v, 0.025, 0.1 * s, 1.5); return 0.03; },
  zap: (ac, o, t, s, v) => { noise(ac, o, t, 'highpass', 5000 * v, 1200 * v, 0.35, 0.5 * s); tone(ac, o, t, 'square', 1400 * v, 90 * v, 0.2, 0.12 * s); return 0.35; },
  freeze: (ac, o, t, s, v) => { tone(ac, o, t, 'triangle', 2600 * v, 1700 * v, 0.14, 0.18 * s); noise(ac, o, t, 'highpass', 6000 * v, 4000 * v, 0.12, 0.2 * s); return 0.14; },
  toss: (ac, o, t, s, v) => { noise(ac, o, t, 'bandpass', 4500 * v, 2500 * v, 0.09, 0.2 * s, 3); return 0.1; },
  poof: (ac, o, t, s, v) => { noise(ac, o, t, 'lowpass', 1400 * v, 250 * v, 0.3, 0.45 * s); return 0.3; },
  shield: (ac, o, t, s, v) => { tone(ac, o, t, 'sine', 520 * v, 880 * v, 0.22, 0.25 * s); tone(ac, o, t, 'triangle', 1040 * v, 1760 * v, 0.18, 0.08 * s); return 0.22; },
  win: (ac, o, t, s) => { [523, 659, 784].forEach((f, i) => tone(ac, o, t + i * 0.13, 'triangle', f, f, 0.12, 0.2 * s)); return 0.4; },
};
// Plays a sound of the given kind, panned to world x; false if it did not start.
function sfx(kind, x, strength = 1) {
  if (!cfg.sound || !SFX[kind]) return false;
  const ac = soundContext();
  // A suspended context (a browser before the first click) has its clock stopped: a sound
  // scheduled now would wait and play with every other one at once when it resumes.
  if (!ac || ac.state !== 'running') return false;
  const t = ac.currentTime;
  if (t - (snd.last[kind] ?? -1) < SFX_GAP) return false;
  snd.ends = snd.ends.filter(end => end > t);
  if (snd.ends.length >= MAX_VOICES) return false;
  let out = snd.master;
  if (ac.createStereoPanner) {
    out = ac.createStereoPanner();
    out.pan.value = x === undefined || !worldW ? 0 : clamp(x / worldW * 2 - 1, -1, 1) * 0.6;
    out.connect(snd.master);
  }
  const dur = SFX[kind](ac, out, t, clamp(strength, 0.3, 1.6), rand(0.94, 1.06));
  snd.last[kind] = t; snd.ends.push(t + dur);
  stats.sfx[kind] = (stats.sfx[kind] || 0) + 1;
  return true;
}
function soundSetVolume() { if (snd.master) snd.master.gain.value = cfg.volume; }
// Suspends the context while the wallpaper is paused or sound is off, so it does not
// keep processing silence for hours; resumes it otherwise.
function soundSetPaused(v) {
  if (!snd.ac) return;
  const p = v || !cfg.sound ? snd.ac.suspend() : snd.ac.resume();
  if (p && p.catch) p.catch(() => {});
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
    o.sy = o.y;                                  // Height before this step, for platforms
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
      if (platforms.length) ragPlatform(o, k);
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
  const forced = ruleTarget(me); if (forced !== undefined) return forced;
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
function pickMove(me, t, dist) {
  let items = [];
  // Height is measured from the surface the fighter stands on, so a ledge is not the air
  const tAir = t && t.alt - me.surfaceAlt() > 50, meAir = me.aloft();
  for (const m of MOVES) {
    if (!cfg.styles[m.style] || meAir) continue;
    items.push([m, m.w * (tAir ? 0.15 : 1)]);
  }
  for (const m of SPECIALS) {
    if (!cfg.styles[m.style] || m.reactive || (meAir && !m.air)) continue;
    if (m.needWall && Math.min(me.x, worldW - me.x) > 320) continue;
    items.push([m, m.w * 1.6 * (tAir && m.antiAir ? 3 : 1) * musicSpecial()]);
  }
  // Every style turned off: fight with all the martial-arts moves rather than stand still (see README)
  if (!items.length) for (const m of MOVES) items.push([m, m.w]);
  // Given a distance, only the moves that reach it, when any of them does
  if (dist !== undefined) {
    const near = items.filter(([m]) => dist >= m.range[0] && dist <= m.range[1]);
    if (near.length) items = near;
  }
  let r = Math.random() * items.reduce((s, it) => s + it[1], 0);
  for (const [m, w] of items) { r -= w; if (r <= 0) return m; }
  return items[items.length - 1][0];
}

// ---------- Music ----------
// "React to music": Wallpaper Engine hands the listener about 30 frames a second of 128 levels
// (64 left, 64 right, low to high frequency). A smoothed level and bass beats (low bins well
// above their running average) shorten the wait between moves and favor specials for a moment;
// they never change game speed. Silence, or no frames for 3 s, brings everything back to normal.
const music = { level: 0, avg: 0, beat: 0, hold: 0, t: 0, glow: musicGlow };
function musicReset() { music.level = 0; music.avg = 0; music.beat = 0; music.hold = 0; }
function musicListener(a) {
  if (!cfg.audio || !a || !a.length) return;
  let bass = 0, all = 0;
  const half = a.length >> 1;
  for (let i = 0; i < a.length; i++) { const v = Math.min(1, +a[i] || 0); all += v; if (i % half < 6) bass += v; }
  bass /= 12; all /= a.length;
  music.level += (Math.min(1, all * 2) - music.level) * 0.1;
  music.beat *= 0.88; music.hold--;
  if (bass > 0.15 && bass > music.avg * 1.5 + 0.05 && music.hold <= 0) { music.beat = 1; music.hold = 6; }
  music.avg += (bass - music.avg) * 0.05;
  if (music.level < 0.002) music.level = 0;
  if (music.beat < 0.01) music.beat = 0;
  if (music.avg < 0.002) music.avg = 0;
  music.t = performance.now();
}
// How strongly the music drives the fight now, 0 to 1 (0 when the setting is off)
function musicDrive(beatOnly) {
  if (!cfg.audio || !cfg.audioStrength) return 0;
  if (performance.now() - music.t > 3000) musicReset();
  return cfg.audioStrength * Math.min(1, music.beat + (beatOnly ? 0 : music.level * 1.5));
}
const musicDelay = () => 1 / (1 + 2 * musicDrive());          // Scales the wait after a move
const musicTempo = () => 1 + 2 * musicDrive(true);            // How fast that wait runs out
const musicSpecial = () => 1 + 2 * musicDrive(true);          // Extra weight for specials
function musicGlow() { return cfg.reduceMotion ? 0 : musicDrive(true); }
window.__stickmanBrawl.music = music;
if (typeof window.wallpaperRegisterAudioListener === 'function') window.wallpaperRegisterAudioListener(musicListener);

// ---------- Stickman ----------
const TMP = clonePose(GUARD);
// Attacks made right after appearing next to a target (teleport, substitution)
const TELEPORT_FOLLOW = ['hook', 'roundhouse', 'backkick', 'uppercut', 'elbow', 'rising', 'barrage', 'clones'];
const INIT_PHASE = { beam: 'charge', blast: 0, barrage: 0, rising: 0, dive: 'jump', slam: 'up', teleport: 'out', wallrun: 'run',
  fireball: 'charge', lightning: 'cast', ice: 'cast', shield: 'up',
  shuriken: 'cast', clones: 'split', smoke: 'out', substitute: 'in' };
class Fighter {
  constructor(id, x, z, team, hue) {
    Object.assign(this, { id, x, z, team, hue });
    this.maxHp = 100;                     // Full health; a king has double
    this.hp = 100; this.facing = 1; this.vx = 0; this.vz = 0; this.alt = 0; this.va = 0;
    this.state = 'idle'; this.st = 0; this.dur = 0; this.time = Math.random() * 10;
    this.pose = clonePose(GUARD); this.from = null; this.move = null; this.md = null; this.nextMove = null;
    this.target = null; this.retarget = 0; this.cool = rand(0.4, 1.4); this.evade = 0; this.dash = 0;
    this.rot = 0; this.rotV = 0; this.fallSign = -1; this.walk = 0; this.spin = false; this.hover = false;
    this.flash = 0; this.hitDone = false; this.prevHP = null; this.juggle = 0; this.dashed = false; this.dj = false;
    this.th = null; this.rag = null; this.hipH = 44; this.W = null; this.downDur = 1; this.koPending = false;
    this.aura = 0; this.alpha = 1; this.invis = false; this.ghost = false;
    this.trail = []; this.trailOn = false; this.trailT = 0;
    this.subFrom = null; this.subT = 0;   // A substitution readied against this attacker, for subT seconds
    this.reachT = 0;                      // Seconds the queued move has been out of reach
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
    else if (!this.aloft()) ay -= Math.abs(Math.sin(this.rot)) * 5;
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
    if (this.subFrom && (this.subT -= dt) <= 0) this.subFrom = null;
    switch (this.state) {
      case 'idle': this.updIdle(dt); break;
      case 'air': this.updAir(dt); break;
      case 'attack': this.updAttack(dt); break;
      case 'hit': {
        const u = clamp((this.st / this.dur - 0.3) / 0.7, 0, 1);
        lerpPose(FLINCH, GUARD, ease(u), this.pose);
        if (this.st >= this.dur) this.state = this.aloft() ? 'air' : 'idle';
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
      case 'frozen':
        // Held in its pose inside the ice; it still falls if frozen in the air
        if (this.st >= this.dur) {
          this.state = this.aloft() ? 'air' : 'idle'; this.st = 0; this.cool = rand(0.1, 0.3);
          spawnSparks(this.x, groundY(this.z) - this.alt - 40, ELEMENT.ice, 10);
          sfx('freeze', this.x, 0.5);
        }
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
        th.hy = th.hy0 + (th.hy1 - th.hy0) * e - Math.sin(Math.PI * u) * th.arc;
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
        // Afterimages follow the flight only: stacked on a body at rest they would undo its dimming
        if (this.trailOn && r.age > 0.2 &&
            (r.age >= 5 || Math.hypot(r.pts.hip.x - r.pts.hip.px, r.pts.hip.y - r.pts.hip.py) < 120 * RAG_H)) this.trailOn = false;
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
    const feet = groundY(this.z) - this.alt;
    this.x = clamp(this.x + this.vx * dt, 14, worldW - 14);
    this.z = clamp(this.z + this.vz * dt, 0, DEPTH);
    const base = platforms.length ? this.platformBase(feet) : 0;
    if (this.hover) {
      this.alt = clamp(this.alt + this.va * dt, 0, maxAlt(this.z));
    } else if (this.alt > base || this.va > 0) {
      this.va -= G * dt;
      this.alt += this.va * dt;
      // At the top of the screen, start falling instead of hanging there while still rising
      const top = maxAlt(this.z);
      if (this.alt > top) { this.alt = top; this.va = Math.min(this.va, 0); }
      if (this.alt <= base) { this.alt = base; this.va = 0; this.onLand(); }
    }
  }
  // The altitude of the surface under a fighter whose feet were at the screen height feet before
  // this step; one standing on a platform keeps its feet on it as its depth changes
  platformBase(feet) {
    const h = platformAlt(this.x, this.z, feet);
    if (h > 0 && this.va <= 0 && !this.hover && platformAt(this.x, feet)) {
      this.alt = h;
      if (this.va < 0) { this.va = 0; this.onLand(); }   // Came down within half a unit of the top
    }
    return h;
  }

  onLand() {
    this.dashed = false; this.dj = false;
    spawnSparks(this.x, groundY(this.z), 'rgba(200,200,200,0.6)', 5, true);
    if (this.state === 'air') { this.state = 'idle'; this.st = 0; this.trailOn = false; }
    else if (this.state === 'attack' && this.move.type === 'wallrun') this.endMove();
  }

  updIdle(dt) {
    const tp = Object.assign(TMP, GUARD);
    if (this.aloft()) { this.state = 'air'; return; }
    // Back on its feet by any path (getup, a thaw, a hold hit, a special's landing): the
    // juggle count and the air dash and double jump start over
    this.juggle = 0; this.dashed = false; this.dj = false;
    this.retarget -= dt; this.cool -= dt * musicTempo();
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
      this.nextMove = withStaff(this, this.nextMove);
      const m = this.nextMove, dx = t.x - this.x, dist = Math.abs(dx), dz = t.z - this.z;
      if (dist > 1) this.facing = sgn(dx);
      let dir;
      if (!t.hittable) dir = dist < 60 ? -1 : dist > 90 ? 1 : 0;
      else if (dist > m.range[1] - 2) dir = 1;
      else if (dist < m.range[0] + 2) dir = -1;
      else dir = Math.sin(this.time * 2.3 + this.id) * 0.35;   // Footwork shuffle
      // Replace a queued move that cannot be reached: backed against a wall there is no room
      // to back off into, and a target that keeps its distance is never caught.
      // While the target cannot be hit, footwork keeps clear of it whatever the move, so neither counts.
      const pinned = t.hittable && dir < 0 && (this.facing > 0 ? this.x <= 16 : this.x >= worldW - 16);
      this.reachT = t.hittable && (dist < m.range[0] || dist > m.range[1]) ? this.reachT + dt : 0;
      if (pinned || this.reachT > 1.5) { this.nextMove = pickMove(this, t, dist); this.reachT = 0; }
      if (this.evade <= 0 && this.dash <= 0) {
        this.vx = approach(this.vx, dir * this.facing * 110, 600 * dt);
        this.vz = approach(this.vz, clamp(dz * 4, -45, 45), 300 * dt);
        // Dash when far away
        if (dir > 0 && dist > 200 && Math.random() < dt * 0.9) {
          this.vx = this.facing * 520; this.dash = 0.22; this.trailOn = true;
        }
        seekItem(this, dt);
      }
      if (platforms.length && this.chaseSurface(t, dt)) return;
      // Jump at random; jump more often when the opponent is airborne
      if (Math.random() < dt * (t.alt - this.alt > 60 ? 1.2 : 0.22)) {
        this.va = rand(480, 640); this.alt += 1; this.vx = this.facing * rand(100, 260);
        this.state = 'air'; this.st = 0; this.cool = rand(0.1, 0.35);
        return;
      }
      const altOK = m.type && !m.sameAlt ? true : Math.abs(t.alt - this.alt) < 35;
      if (this.cool <= 0 && t.hittable && altOK && dist >= m.range[0] && dist <= m.range[1] && Math.abs(dz) < 9) {
        // Walking to an item turns the fighter away; every move starts facing the target
        if (dist > 1) this.facing = sgn(dx);
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

  // With platforms: a target standing on another surface (the floor or another platform) is
  // reached by walking off this one, or by jumping up onto the target's. Sets the walking
  // speed toward it; returns true when it starts a jump.
  chaseSurface(t, dt) {
    const feet = groundY(this.z) - this.alt;
    const mine = platformAt(this.x, feet);
    const theirs = t.alt > 0 ? platformAt(t.x, groundY(t.z) - t.alt) : null;
    if ((t.alt > 0 && !theirs) || mine === theirs) return false;
    let goal = t.x;
    if (theirs && theirs.y < feet - 1) {
      // The target is higher: get under its platform, then jump high enough to clear its top
      if (this.x > theirs.x0 - 30 && this.x < theirs.x1 + 30 && Math.random() < dt * 4) {
        this.va = Math.sqrt(2 * G * (feet - theirs.y + 30)); this.alt += 1;
        this.vx = sgn(t.x - this.x) * 120; this.state = 'air'; this.st = 0;
        return true;
      }
      goal = clamp(t.x, theirs.x0 + 10, theirs.x1 - 10);
    } else if (mine && t.x > mine.x0 - 20 && t.x < mine.x1 + 20) {
      // The target is lower, right under this platform: walk off its nearer edge
      goal = t.x - mine.x0 < mine.x1 - t.x ? mine.x0 - 25 : mine.x1 + 25;
    }
    if (Math.abs(goal - this.x) > 2) this.vx = approach(this.vx, sgn(goal - this.x) * 130, 600 * dt);
    return false;
  }
  // In the air: above the floor or, with platforms, above the top it would stand on
  aloft() {
    return platforms.length ? this.alt > this.surfaceAlt() + 0.5 : this.alt > 0;
  }
  // The altitude of the surface it stands on or would land on: the floor or a platform top
  surfaceAlt() {
    return platforms.length ? platformAlt(this.x, this.z, groundY(this.z) - this.alt) : 0;
  }

  startMove(m, surprise) {
    this.state = 'attack'; this.st = 0; this.move = m; this.nextMove = null; this.reachT = 0; this.hover = false;
    this.hitDone = false; this.prevHP = null; this.from = clonePose(this.pose);
    this.md = { ph: INIT_PHASE[m.type], next: 0.05, fired: 0 };
    stats.att[m.id] = (stats.att[m.id] || 0) + 1;
    if (m.staff && this.held) this.held.n--;
    if (!m.type && !surprise) this.warn(m.range[1] + 15, !!m.grab);
  }

  // Nearby opponents may block, back off to dodge, raise a shield (magic), vanish in smoke or
  // ready a substitution for this attacker's hit (ninjutsu). Throws cannot be blocked,
  // shielded or substituted, but smoke escapes them. An attack that comes round the guard
  // (unguardable, the shadow clones) offers no block or shield, which could not stop it.
  warn(reach, grab, unguardable) {
    for (const e of fighters) {
      if (!isEnemy(this, e) || e.state !== 'idle') continue;
      if (Math.abs(e.x - this.x) > reach || Math.abs(e.z - this.z) > 14) continue;
      if (sgn(e.x - this.x) !== this.facing) continue;
      // A projectile is thrown as it warns and needs time to fly; a block, shield, smoke
      // escape or substitution lasts that much longer, so it is still up when the shot arrives
      const fly = this.move.speed ? Math.abs(e.x - this.x) / this.move.speed : 0;
      const r = Math.random(), guard = !grab && !unguardable;
      if (guard && r < 0.25) {
        e.state = 'block'; e.st = 0; e.dur = (this.move.wind || 0.3) + (this.move.act || 0.4) + rand(0.05, 0.2) + fly;
        e.facing = sgn(this.x - e.x);
      } else if (r < 0.37) {
        e.evade = 0.3; e.vx = sgn(e.x - this.x) * rand(160, 230);
      } else if (guard && r < 0.47 && cfg.styles.magic) {
        e.facing = sgn(this.x - e.x);
        e.startMove(MOVE_BY.shield, true);
        e.md.from = this; e.md.hold = SHIELD_UP + fly;
      } else if (r >= 0.47 && r < 0.55 && cfg.styles.ninjutsu) {
        e.startMove(MOVE_BY.smoke, true);
        // A beam warns as it fires and keeps hitting along its line, so stay hidden until it stops
        e.md.from = this.x; e.md.hold = SMOKE_OUT + fly + (this.move.type === 'beam' ? BEAM_FIRE : 0);
      } else if (!grab && r >= 0.55 && r < 0.63 && cfg.styles.ninjutsu) {
        e.subFrom = this; e.subT = (this.move.wind || 0.3) + (this.move.act || 0.4) + 0.3 + fly;
      }
    }
  }

  // Advances the running cycle of a wall run; each footfall plays a step.
  runStep(dt) {
    const before = Math.floor(this.walk / Math.PI);
    this.walk += dt * 26;
    if (Math.floor(this.walk / Math.PI) !== before) sfx('step', this.x, 0.4);
  }

  endMove() {
    if (this.move && !this.move.type && !this.hitDone) { stats.whiff++; sfx('whiff', this.x); }
    this.state = this.aloft() ? 'air' : 'idle'; this.st = 0;
    this.move = null; this.md = null; this.spin = false; this.hover = false; this.ghost = false;
    this.rot = 0; this.trailOn = false; this.invis = false; this.alpha = 1; this.vz = 0;
    this.cool = rand(0.15, 0.7) * musicDelay();
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
      if (!md.chargeSfx) { md.chargeSfx = true; sfx('charge', this.x); }
      if (t && t.alive) this.facing = sgn(t.x - this.x);

      if (this.st >= 0.75) {
        md.ph = 'fire'; md.t0 = this.st; sfx('fire', this.x, 1.5); md.hit = new Set();
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
      if (ft >= BEAM_FIRE) { md.ph = 'rec'; md.t0 = this.st; md.w = 0; }
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
        const sp = this.move.speed;
        shots.push({ x: H.x, y: H.y, vx: this.facing * Math.cos(a) * sp, vy: Math.sin(a) * sp, z: this.z, owner: this, m: this.move, life: 3, col: colorOf(this) }); sfx('fire', H.x, 0.5);
        spawnSparks(H.x, H.y, '#ffffff', 3);
        // The first shot warns: a guard raised then lasts until it can arrive
        if (k === 0) this.warn(9999, false);
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
      // With its target gone there is nothing to steer at: fall like any airborne fighter
      if (!t || !t.alive) { this.endMove(); return; }
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
        shake = Math.max(shake, 13); hitStop(0.08);
        for (const e of fighters) {
          if (!isEnemy(this, e) || !e.hittable || e.alt > 40 || Math.abs(e.z - this.z) > 50) continue;
          const d = Math.abs(e.x - gx);
          if (d > 150) continue;
          // The shockwave spreads both ways: each target is hit from the impact's side, not the slammer's front
          e.takeHit({ facing: sgn(e.x - gx), owner: this }, m, 'leg', { x: e.x, y: groundY(e.z) - 10 },
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
      this.appearBehind(t);
      addFx({ type: 'ring', x: this.x, y: groundY(this.z) - this.alt - 45, r0: 2, r1: 40, dur: 0.2, w: 2 });
      this.followUp();
    }
  }
  // Moves right behind t, facing it; with its back to a wall there is no room behind, so in front
  appearBehind(t) {
    let x = t.x - t.facing * 28;
    if (x < 14 || x > worldW - 14) x = t.x + t.facing * 28;
    this.x = clamp(x, 14, worldW - 14);
    this.z = t.z; this.alt = t.alt; this.va = 0;
    this.facing = this.x !== t.x ? sgn(t.x - this.x) : -t.facing;
  }
  // Attacks right after appearing, with a move from the styles that are turned on
  followUp() {
    const ids = TELEPORT_FOLLOW.filter(id => cfg.styles[MOVE_BY[id].style]);
    this.startMove(MOVE_BY[pick(ids.length ? ids : TELEPORT_FOLLOW)], true);
  }

  // ---- Ninjutsu ----
  u_shuriken(dt) {
    const md = this.md, t = this.target;
    if (this.alt > 0) { this.hover = true; this.va = 0; }
    if (t && t.alive) this.facing = sgn(t.x - this.x);
    this.vx = approach(this.vx, 0, 700 * dt);
    if (md.ph === 'cast') {
      lerpPose(this.pose, FLING, Math.min(1, dt * 20), this.pose);
      if (this.st >= 0.16 && this.W) {
        // A fan of three stars, spread a little above and below the aim. They share one
        // fan token, so a shield takes the whole fan as one hit.
        md.ph = 'throw'; md.t0 = this.st;
        const fan = {};
        for (const off of [-0.16, 0, 0.16]) this.castShot(this.W.hF, 'star', this.move.speed, 0.02, off).fan = fan;
        sfx('toss', this.x);
        this.warn(9999, false);
      }
    } else {
      lerpPose(this.pose, MOVE_BY.jab.A, Math.min(1, dt * 25), this.pose);
      if (this.st - md.t0 > 0.3) this.endMove();
    }
  }

  u_clones(dt) {
    const md = this.md, m = this.move, t = this.target;
    // Lost the target before the strike lands: stop. Once it has landed (a knockout included),
    // the clones still vanish in their smoke.
    if ((!t || !t.alive) && !md.hit) { this.endMove(); return; }
    if (md.ph === 'split') {
      if (!md.clones) {
        // Two faded copies step out to either side
        md.clones = [{ x: this.x, off: -40, alt: 0, fac: 1, a: 0 }, { x: this.x, off: 40, alt: 0, fac: 1, a: 0 }];
        for (const c of md.clones) puff(this.x + c.off, groundY(this.z) - 40, 0.8);
        sfx('poof', this.x);
      }
      lerpPose(this.pose, SEAL, Math.min(1, dt * 20), this.pose);
      for (const c of md.clones) { c.x = this.x + c.off; c.a = Math.min(1, this.st / 0.15); }
      this.vx = approach(this.vx, 0, 700 * dt);
      if (this.st >= 0.25) {
        md.ph = 'rush'; md.t0 = this.st;
        for (const c of md.clones) c.x0 = c.x;
        this.warn(Math.abs(t.x - this.x) + 30, false, true);
      }
    } else if (md.ph === 'rush') {
      // The real fighter runs in from the front; one clone circles behind the target, one leaps over it
      this.facing = sgn(t.x - this.x) || this.facing;
      const gap = t.x - this.x - this.facing * 26;
      this.vx = clamp(gap * 12, -420, 420);
      this.runStep(dt);
      const p = Object.assign(TMP, RUN);
      p.lF += Math.sin(this.walk) * 0.7; p.lB -= Math.sin(this.walk) * 0.7;
      lerpPose(this.pose, p, Math.min(1, dt * 20), this.pose);
      const u = ease(Math.min(1, (this.st - md.t0) / 0.3));
      const goals = [[t.x + this.facing * 26, 0, -1], [t.x - this.facing * 6, 34, 1]];
      md.clones.forEach((c, i) => {
        const [gx, ga, gf] = goals[i];
        c.x = c.x0 + (clamp(gx, 14, worldW - 14) - c.x0) * u; c.alt = ga * Math.sin(Math.PI / 2 * u);
        c.fac = u > 0.5 ? gf : 1;
      });
      if (this.st - md.t0 >= 0.35) { md.ph = 'strike'; md.t0 = this.st; this.vx = 0; }
    } else if (md.ph === 'strike') {
      lerpPose(this.pose, MOVE_BY.cross.A, Math.min(1, dt * 30), this.pose);
      if (!md.hit) {
        md.hit = true;
        const near = t.hittable && Math.abs(t.x - this.x) < 60 && Math.abs(t.z - this.z) < 16 && Math.abs(t.alt - this.alt) < 45;
        if (near) {
          // Both clones land a hit, then the real fighter's launches the target. A substitution
          // readied against this fighter takes the first hit, and the rest go to the log.
          let log = false;
          for (const c of md.clones) {
            if (!t.hittable) break;
            const pt = t.bodyPoint();
            if (t.takeHit({ facing: c.fac * this.facing, owner: this }, m, 'body', pt, { dmg: m.dmg, hold: true }) === 'sub') { log = true; break; }
          }
          if (!log && t.hittable) t.takeHit(this, m, 'head', t.bodyPoint(), { dmg: m.dmg * 1.6, launch: { vx: this.facing * 520, va: 360 }, big: true });
        } else sfx('whiff', this.x);
      }
      if (this.st - md.t0 > 0.2) {
        md.ph = 'vanish'; md.t0 = this.st;
        for (const c of md.clones) puff(c.x, groundY(this.z) - c.alt - 40, 0.8);
        sfx('poof', this.x, 0.7);
      }
    } else {
      lerpPose(this.pose, GUARD, Math.min(1, dt * 10), this.pose);
      md.clones = null;
      if (this.st - md.t0 > 0.15) this.endMove();
    }
  }

  u_smoke(dt) {
    const md = this.md;
    if (md.ph === 'out') {
      if (!md.puffed) {
        md.puffed = true; this.invis = true;
        puff(this.x, groundY(this.z) - this.alt - 40, 1);
        sfx('poof', this.x);
      }
      this.vx = 0;
      if (this.st >= (md.hold || SMOKE_OUT)) {
        // Reappear a short way off, away from the attacker; at a wall, the other way
        const away = md.from === undefined ? -this.facing : sgn(this.x - md.from);
        let x = this.x + away * rand(70, 110);
        if (x < 14 || x > worldW - 14) x = this.x - away * rand(70, 110);
        this.x = clamp(x, 14, worldW - 14);
        this.invis = false;
        if (md.from !== undefined && Math.abs(md.from - this.x) > 1) this.facing = sgn(md.from - this.x);
        puff(this.x, groundY(this.z) - this.alt - 40, 0.7);
        this.endMove();
      }
    }
  }

  u_substitute(dt) {
    // Fades in behind the attacker, then strikes
    this.alpha = Math.min(1, this.st / 0.12);
    lerpPose(this.pose, GUARD, Math.min(1, dt * 20), this.pose);
    if (this.st >= 0.15) { this.alpha = 1; this.followUp(); }
  }

  // A readied substitution: a log takes the hit, and the fighter appears behind the attacker.
  substitute(att) {
    const gy = groundY(this.z);
    addFx({ type: 'log', x: this.x, y: gy, dir: -this.facing, dur: 1.2 });
    puff(this.x, gy - 40, 1);
    sfx('poof', this.x);
    this.subFrom = null; stats.subs++;
    this.clearMove();
    this.state = 'idle'; this.vx = 0; this.vz = 0;
    this.appearBehind(att);
    // The attack that follows goes for the attacker, whoever this fighter was after before
    this.target = att; this.retarget = rand(1.2, 3);
    this.W = this.joints();   // So the other stars of a fan, tested this same step, miss the log
    puff(this.x, groundY(this.z) - this.alt - 40, 0.6);
    this.startMove(MOVE_BY.substitute, true);
  }

  u_wallrun(dt) {
    const md = this.md, m = this.move, t = this.target;
    if (md.ph === 'run') {
      if (md.dir === undefined) md.dir = this.x < worldW / 2 ? -1 : 1;
      this.facing = md.dir; this.vx = md.dir * 450; this.trailOn = true;
      this.runStep(dt);
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
      this.runStep(dt);
      const p = Object.assign(TMP, RUN);
      p.lF += Math.sin(this.walk) * 0.7; p.lB -= Math.sin(this.walk) * 0.7;
      lerpPose(this.pose, p, Math.min(1, dt * 20), this.pose);
      if (Math.random() < 0.3) spawnSparks(this.x, groundY(this.z) - this.alt, 'rgba(200,200,200,0.6)', 1, false);
      if (this.st - md.t0 > md.dur || this.alt >= maxAlt(this.z)) {
        md.ph = 'leap'; this.rot = 0; this.hover = false; md.prev = null;
        this.facing = -md.dir;
        this.hover = true; md.t0 = this.st;
        this.va = 0; this.vx = this.facing * 700;
        this.pose = clonePose(FLYKICK);
      }
    } else {
      lerpPose(this.pose, FLYKICK, Math.min(1, dt * 20), this.pose);
      this.aura = 0.5;
      // With its target gone there is nothing to steer at: fall like any airborne fighter
      if (!t || !t.alive) { this.endMove(); return; }
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

  // ---- Spells ----
  // Throws a projectile of the given kind from point H, aimed at the target's body,
  // turned by offset radians plus a random spread. Returns the shot.
  castShot(H, kind, speed, spread, offset = 0) {
    const t = this.target;
    let a = 0;
    if (t && t.W) { const c = mid(t.W.sh, t.W.hip); a = Math.atan2(c.y - H.y, Math.abs(c.x - H.x) + 1); }
    a = clamp(a + offset + rand(-spread, spread), -1, 1.1);
    const s = { x: H.x, y: H.y, vx: this.facing * Math.cos(a) * speed, vy: Math.sin(a) * speed, z: this.z,
      owner: this, m: this.move, life: 3, col: ELEMENT[kind], kind, dmg: this.move.dmg };
    shots.push(s);
    return s;
  }

  u_fireball(dt) {
    const md = this.md, t = this.target;
    if (this.alt > 0) { this.hover = true; this.va = 0; }
    if (t && t.alive) this.facing = sgn(t.x - this.x);
    this.vx = approach(this.vx, 0, 700 * dt);
    if (md.ph === 'charge') {
      this.aura = 0.8;
      lerpPose(this.pose, CHARGE, Math.min(1, dt * 12), this.pose);
      if (!md.chargeSfx) { md.chargeSfx = true; sfx('charge', this.x, 0.6); }
      if (this.st >= 0.4 && this.W) {
        md.ph = 'throw'; md.t0 = this.st;
        this.castShot(mid(this.W.hF, this.W.hB), 'fire', this.move.speed, 0.05);
        sfx('fire', this.x);
        this.warn(9999, false);
      }
    } else {
      lerpPose(this.pose, FIRE, Math.min(1, dt * 20), this.pose);
      if (this.st - md.t0 > 0.35) this.endMove();
    }
  }

  u_ice(dt) {
    const md = this.md, t = this.target;
    if (this.alt > 0) { this.hover = true; this.va = 0; }
    if (t && t.alive) this.facing = sgn(t.x - this.x);
    this.vx = approach(this.vx, 0, 700 * dt);
    if (md.ph === 'cast') {
      lerpPose(this.pose, FLING, Math.min(1, dt * 18), this.pose);
      if (this.st >= 0.2 && this.W) {
        md.ph = 'throw'; md.t0 = this.st;
        this.castShot(this.W.hF, 'ice', this.move.speed, 0.04);
        sfx('freeze', this.x, 0.7);
        this.warn(9999, false);
      }
    } else {
      lerpPose(this.pose, MOVE_BY.jab.A, Math.min(1, dt * 25), this.pose);
      if (this.st - md.t0 > 0.3) this.endMove();
    }
  }

  u_lightning(dt) {
    const md = this.md, m = this.move, t = this.target;
    this.vx = approach(this.vx, 0, 700 * dt);
    if (md.ph === 'cast') {
      lerpPose(this.pose, CALL, Math.min(1, dt * 14), this.pose);
      this.aura = 0.6;
      if (this.st >= 0.15) {
        if (!t || !t.alive) { this.endMove(); return; }
        // Mark where the target stands; the bolt falls there a moment later
        md.ph = 'mark'; md.x = clamp(t.x + t.vx * 0.25, 14, worldW - 14); md.z = t.z;
        addFx({ type: 'mark', x: md.x, y: groundY(md.z), dur: 0.6, col: ELEMENT.bolt });
      }
    } else if (md.ph === 'mark') {
      lerpPose(this.pose, CALL, Math.min(1, dt * 14), this.pose);
      this.aura = 0.8;
      if (this.st >= 0.75) {
        md.ph = 'rec'; md.t0 = this.st;
        const gy = groundY(md.z), pts = [];
        for (let y = 0, x = md.x; y < gy; y += rand(18, 32)) { pts.push([x, y]); x = md.x + rand(-12, 12); }
        pts.push([md.x, gy]);
        addFx({ type: 'bolt', pts, dur: 0.25, col: ELEMENT.bolt });
        addFx({ type: 'flash', dur: 0.12 });
        crack(md.x, gy, 'ground', 40);
        spawnSparks(md.x, gy, ELEMENT.bolt, 14, true, 1.5);
        sfx('zap', md.x, 1.3);
        shake = Math.max(shake, 8);
        for (const e of fighters) {
          if (!isEnemy(this, e) || !e.hittable || !e.W || Math.abs(e.x - md.x) > 24 || Math.abs(e.z - md.z) > 20) continue;
          e.takeHit(this, m, 'head', e.bodyPoint(),
            { launch: { vx: (e.x >= md.x ? 1 : -1) * 150, va: 420 }, big: true, unblockable: true });
        }
      }
    } else {
      lerpPose(this.pose, GUARD, Math.min(1, dt * 8), this.pose);
      if (this.st - md.t0 > 0.3) this.endMove();
    }
  }

  u_shield(dt) {
    // Faces the attacker it was raised against, which need not be its own target
    const md = this.md, t = md.from && md.from.alive ? md.from : this.target;
    this.vx = approach(this.vx, 0, 700 * dt);
    if (md.ph === 'up') {
      if (t && t.alive && Math.abs(t.x - this.x) > 1) this.facing = sgn(t.x - this.x);
      lerpPose(this.pose, WARD, Math.min(1, dt * 20), this.pose);
      if (!md.upSfx) { md.upSfx = true; sfx('shield', this.x, 0.6); }
      if (this.st >= (md.hold || SHIELD_UP)) { md.ph = 'rec'; md.t0 = this.st; }
    } else {
      lerpPose(this.pose, GUARD, Math.min(1, dt * 10), this.pose);
      if (this.st - md.t0 > 0.2) this.endMove();
    }
  }
  shieldUp() { return this.state === 'attack' && this.move && this.move.type === 'shield' && this.md.ph === 'up'; }

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
    const H = m.staff ? staffTip(this.W, m.hit) : this.W[m.hit], P0 = this.prevHP || H;
    this.prevHP = { x: H.x, y: H.y };
    const r = this.sweepHit(P0, H);
    if (r) { this.hitDone = true; r[0].takeHit(this, m, r[1], H); }
  }

  applyGrab(e) {
    const m = this.move, af = this.facing;
    e.hp -= m.dmg * rand(0.9, 1.1); e.flash = 0.12; e.clearMove();
    e.va = 0; e.vx = 0;   // A victim grabbed while rising must not keep floating up once down
    stats.hits[m.id] = (stats.hits[m.id] || 0) + 1; stats.throws++;
    spawnSparks(e.W.sh.x, e.W.sh.y, '#ffe28a', 6);
    if (m.grab === 'over') {
      e.facing = -af; e.state = 'thrown'; e.st = 0; e.from = clonePose(e.pose); e.alt = 0;
      e.th = { hx0: e.W.hip.x, hy0: e.W.hip.y, hx1: clamp(this.x - af * 68, 40, worldW - 40),
        hy1: groundY(e.z) - 5, hx: e.W.hip.x, hy: e.W.hip.y, dur: 0.75 };
      // The arc over the thrower's head, lower on a short screen: the health bar can be
      // about 70 above the spinning hip, and stays on screen
      e.th.arc = clamp(Math.min(e.th.hy0, e.th.hy1) - 72, 0, 150);
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

  // att is the attacker, or a stand-in with its facing: { facing, owner } for a projectile, a clone or a shockwave.
  // Returns 'sub' when a readied substitution took the hit instead.
  takeHit(att, m, zone, H, o = {}) {
    const dir = att.facing, src = att.owner || att;
    if (this.subFrom === src && src.alive && !this.invis && SUB_STATES.has(this.state)) {
      spawnSparks(H.x, H.y, '#ffe28a', 6); sfx('hit', H.x);
      this.substitute(src);
      return 'sub';
    }
    // A star of a fan whose first star broke this shield is stopped too: the fan is one hit
    const fanBroke = o.fan && this.state === 'attack' && this.move && this.move.type === 'shield' && this.md.fan === o.fan;
    if (!o.unblockable && fanBroke && this.facing === -dir) {
      spawnSparks(H.x, H.y, colorOf(this), 6); sfx('shield', H.x, 0.4);
      return;
    }
    if (!o.unblockable && this.shieldUp() && this.facing === -dir) {
      // The shield takes the hit in full and breaks
      this.md.ph = 'rec'; this.md.t0 = this.st; this.md.fan = o.fan;
      addFx({ type: 'ring', x: H.x, y: H.y, r0: 6, r1: 40, dur: 0.25, w: 2.5, col: colorOf(this) });
      spawnSparks(H.x, H.y, colorOf(this), 12); stats.shielded++; sfx('shield', H.x);
      this.vx = dir * 60;
      return;
    }
    if (!o.unblockable && this.state === 'block' && this.facing === -dir) {
      this.hp -= (o.dmg ?? m.dmg) * 0.15;
      this.vx = dir * (o.launch ? Math.abs(o.launch.vx) * 0.5 : (m.push || 30) * 1.2 + 60);
      spawnSparks(H.x, H.y, '#9fd4ff', 8); stats.blocked++; sfx('block', H.x);
      if (this.hp <= 0) this.ko(dir * 300, -250);
      return;
    }
    const dmg = (o.dmg ?? m.dmg) * (zone === 'head' ? 1.35 : zone === 'leg' ? 0.8 : 1) * rand(0.85, 1.15) * 0.85;
    this.hp -= dmg; this.flash = 0.1;
    // Any hit shatters the ice; another ice shard does not freeze again, so nobody is frozen in a loop
    const wasFrozen = this.state === 'frozen';
    if (wasFrozen) { spawnSparks(H.x, H.y, ELEMENT.ice, 12); sfx('freeze', H.x); }
    this.clearMove();
    stats.hits[m.id] = (stats.hits[m.id] || 0) + 1;
    let Lv = o.launch;
    if (!Lv && !o.hold && (this.aloft() || Math.random() < (m.kd || 0) * 2 + (dmg >= 8 ? 0.3 : 0))) {
      Lv = { vx: dir * ((m.push || 30) * 4 + 200), va: m.down ? -400 : (m.up ? 620 : 200 + rand(0, 240)) };
    }
    const big = o.big || (Lv && Math.hypot(Lv.vx, Lv.va) > 650);
    impact(H.x, H.y, big);
    if (this.hp <= 0) {
      const v = Lv || { vx: dir * 520, va: 380 };
      hitStop(0.16); shake = Math.max(shake, 12);
      addFx({ type: 'focus', x: H.x, y: H.y, dur: 0.4 });
      this.ko(v.vx * 1.4, -v.va * 1.3 - 150);
      return;
    }
    if (o.freeze && !wasFrozen) {
      this.state = 'frozen'; this.st = 0; this.dur = o.freeze;
      this.vx = 0; this.vz = 0; this.va = Math.min(this.va, 0);
      return;
    }
    if (Lv) { this.launch(Lv.vx, Lv.va); return; }
    this.state = 'hit'; this.st = 0;
    if (o.hold) {
      this.dur = 0.22; this.vx = dir * 20;
      if (this.aloft()) this.va = Math.max(this.va, 90);
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
    const feet = groundY(this.z) - this.alt;
    this.va -= G * dt;
    this.x += this.vx * dt; this.alt += this.va * dt; this.rot += this.rotV * dt;
    this.z = clamp(this.z + this.vz * dt, 0, DEPTH);
    lerpPose(this.pose, TUMBLE, Math.min(1, dt * 8), this.pose);
    const top = maxAlt(this.z);
    if (this.x < 14 || this.x > worldW - 14) {
      const side = this.x < 14 ? -1 : 1;
      this.x = clamp(this.x, 14, worldW - 14);
      if (Math.abs(this.vx) > 380) {
        // Wall hit: the wall cracks and the fighter sticks to it briefly.
        // This step may also have crossed the floor, and the ground check below is skipped.
        this.alt = Math.max(this.alt, 0);
        const wy = groundY(this.z) - this.alt - 14;
        crack(side < 0 ? 0 : worldW, wy, 'wall', 70);
        addFx({ type: 'ring', x: side < 0 ? 0 : worldW, y: wy, r0: 4, r1: 60, dur: 0.3, w: 3 });
        shake = Math.max(shake, 10); hitStop(0.07);
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
    const base = platforms.length ? platformAlt(this.x, this.z, feet) : 0;
    if (this.alt <= base && this.va < 0) {
      this.alt = base;
      const gy = groundY(this.z) - base;
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
    this.rag = makeRag(this.W, vx, vy); stats.ko++; sfx('ko', this.x);
    lastKO = this;
  }
}

// ---------- Rounds ----------
// decided: the round before ended with a winner or a draw and its banner ran out. Any other
// new round (a time-out, a reset from the settings panel, the first) restores everyone.
function newRound(decided = false) {
  const prev = fighters;
  fighters = []; sparks.length = 0; fx.length = 0; shots.length = 0;
  clearItems();
  roundOver = false; roundTime = 0; shake = 0; freeze = 0; freezeGap = 0;
  slowmoT = -1; slowmoOn = null; lastKO = null;
  const n = clamp(Math.round(cfg.count), 2, 16);
  scoreRound(n);
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
  applyRoundRules(prev, decided);
}
function checkRound(dt) {
  roundTime += dt;
  if (roundOver) { roundTimer -= dt; if (roundTimer <= 0) newRound(true); return; }
  const alive = fighters.filter(f => f.alive);
  // Ladder: after a knockout the next waiting fighters step in before the round is judged, so
  // after a double knockout the next pair fights on. One fighter left waiting then has nobody
  // to fight, and wins nothing for it: the round is a draw.
  let noBout = false;
  if (ladderQueue.length) {
    noBout = alive.length === 1 && alive[0].state === 'wait';
    ladderStepIn();
  }
  const sides = new Set(alive.map(f => (cfg.mode === 'teams' ? f.team : f.id)));
  if (sides.size <= 1) {
    roundOver = true; roundTimer = 4.5; stats.rounds++; sfx('win', worldW / 2);
    const w = noBout ? null : alive[0];
    winnerText = !w ? 'DRAW' : cfg.mode === 'teams' ? TEAM_NAME[w.team] + ' WINS!' : labelOf(w) + ' WINS!';
    winnerColor = w ? colorOf(w) : cfg.line;
    scoreWin(w);
    // Nothing may hurt the winners now: shots still in flight, some from fighters already
    // knocked out, burst where they are
    for (const s of shots) burst(s);
    shots.length = 0;
    startSlowmo();
  } else if (roundTime > 150) {
    newRound();
  }
}

// Round rules (issue #89). Normal changes nothing. King: one fighter a round has double
// health and a crown, and everyone else targets it first. Ladder: two fighters fight at a time
// while the rest wait at the sides cheering; the winner stays and the next steps in. Survival:
// a round's winners keep their health into the next round, unless below 15%. King and Ladder
// are free-for-all rules: in teams mode they behave like Normal.
let ladderQueue = [], lastKing = -1;
function applyRoundRules(prev, decided) {
  ladderQueue = [];
  if (cfg.rules === 'survival' && decided && prev.length === fighters.length) {
    for (const o of prev) {
      const r = o.hp / o.maxHp;
      if (o.alive && r >= 0.15) fighters[o.id].hp = Math.min(1, r) * fighters[o.id].maxHp;
    }
  }
  if (cfg.mode === 'teams') return;
  if (cfg.rules === 'king') {
    // A new king each round where there is a choice
    const k = pick(fighters.filter(f => f.id !== lastKing));
    k.king = true; k.maxHp = k.hp = 200; lastKing = k.id;
  } else if (cfg.rules === 'ladder') {
    const order = fighters.slice().sort(() => Math.random() - 0.5);
    const [a, b] = order;
    a.x = worldW * 0.4; b.x = worldW * 0.6; a.facing = 1; b.facing = -1;
    // The rest wait at the sides, alternating left and right, facing the middle
    order.slice(2).forEach((f, j) => {
      const side = j % 2, k = Math.floor(j / 2);
      f.x = side ? worldW - 30 - k * 24 : 30 + k * 24;
      f.facing = side ? -1 : 1;
      f.state = 'wait';
      ladderQueue.push(f);
    });
  }
}
// Who a fighter must target under the round rules, or undefined to pick as usual
function ruleTarget(me) {
  if (cfg.mode === 'teams') return undefined;
  if (cfg.rules === 'king') {
    const k = fighters.find(f => f.king && f.alive);
    return k && k !== me ? k : undefined;
  }
  if (cfg.rules === 'ladder') return fighters.find(f => f !== me && f.alive && f.state !== 'wait') ?? null;
  return undefined;
}
// Ladder: waiting fighters cheer, and the next steps in whenever fewer than two are fighting
function roundRulesStep() {
  if (!ladderQueue.length) return;
  for (const f of ladderQueue) lerpPose(GUARD, VICTORY, 0.5 + 0.5 * Math.sin(f.time * 5 + f.id), f.pose);
  ladderStepIn();
}
function ladderStepIn() {
  let active = fighters.filter(f => f.alive && f.state !== 'wait').length;
  while (active < 2 && ladderQueue.length) {
    const f = ladderQueue.shift();
    if (!f.alive || f.state !== 'wait') continue;
    f.state = 'idle'; f.st = 0; f.cool = rand(0.3, 0.8); f.target = null; f.retarget = 0;
    active++;
    roundTime = 0;   // Each bout gets the full time before the round times out
  }
}
// Drawn at the king's alpha, so it fades with the body in a teleport or smoke escape
function drawCrown(J, alpha) {
  const x = J.head.x, y = J.head.y - L.head - 1;
  ctx.globalAlpha = alpha; ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [dx, dy] of [[-7, 0], [-7, -7], [-3.5, -3], [0, -8], [3.5, -3], [7, -7], [7, 0]]) ctx.lineTo(x + dx, y + dy);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.globalAlpha = 1;
}
Object.assign(window.__stickmanBrawl, { newRound, pickTarget });

function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    if (s.kind === 'boomerang') steerBoomerang(s, dt);
    const P0 = { x: s.x, y: s.y };   // Sweep from the last position so a fast blast can't skip a body
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    let boom = s.life <= 0 || s.x < -20 || s.x > worldW + 20 || s.y < -20;
    if (!boom && s.y >= groundY(s.z)) {
      boom = true; crack(s.x, groundY(s.z), 'ground', 25);
      if (s.kind === 'fire') addFx({ type: 'flame', x: s.x, y: groundY(s.z), dur: 0.7 });
    }
    if (s.kind === 'fire' && Math.random() < 0.6) spawnSparks(s.x, s.y, ELEMENT.fire, 1, true, 0.5);
    if (!boom) {
      for (const e of fighters) {
        if (!isEnemy(s.owner, e) || !e.hittable || Math.abs(e.z - s.z) > 16 || !e.W) continue;
        const zone = hitTest(P0, s, e.W, s.kind === 'fire' ? 7 : 4);
        if (zone) {
          const dir = sgn(s.vx), dmg = s.dmg ?? 4;
          let o;
          if (s.kind === 'fire') o = { dmg, launch: { vx: dir * 420, va: 300 }, big: true };
          else if (s.kind === 'ice') o = { dmg, freeze: 1.1 };
          else o = e.alt > 0 || Math.random() < 0.25 ? { dmg, launch: { vx: dir * 280, va: 200 } } : { dmg, hold: true };
          if (s.fan) o.fan = s.fan;
          e.takeHit({ facing: dir, owner: s.owner }, s.m, zone, { x: s.x, y: s.y }, o);
          if (s.kind === 'fire') addFx({ type: 'flame', x: s.x, y: s.y + 10, dur: 0.5 });
          boom = true;
          break;
        }
      }
    }
    if (boom) { burst(s); shots.splice(i, 1); }
  }
}
// The small ring and sparks of a shot that ends
function burst(s) {
  addFx({ type: 'ring', x: s.x, y: s.y, r0: 3, r1: 22, dur: 0.2, w: 2, col: s.col });
  spawnSparks(s.x, s.y, s.col, 6);
}

// ---------- Items ----------
// Optional pick-ups (the Items setting): every 8 to 15 s a staff, a boomerang or a heart
// drops from the top of the screen, at most two at a time. Everything is drawn with lines.
cfg.items = false;
const items = [];
let itemTimer = null;        // Seconds to the next drop; null until the setting is first on in a round
const ITEM_KINDS = ['staff', 'boomerang', 'heart'];
const ITEM_HOLD = new Set(['idle', 'air', 'attack', 'hit', 'block']);   // States an item can be picked up in
const STAFF_LEN = 26, STAFF_USES = 3, HEART_HP = 30 /* % of full health */, BOOMERANG_COL = '#d9a066';
const BOOMERANG = { id: 'boomerang', type: 'boomerang', style: 'items', range: [70, 300], dmg: 6, speed: 560 };
MOVE_BY.boomerang = BOOMERANG;
// A drop at world x and depth z, alt above the floor (from just above the top of the screen by default)
function spawnItem(kind, x, z = rand(0, DEPTH), alt = groundY(z) + 20) {
  const it = { kind, x: clamp(x, 40, worldW - 40), z, alt, va: 0, t: Math.random() * 10 };
  items.push(it);
  return it;
}
// Clears the field; with drop, fighters let go of what they hold too
function clearItems(drop) {
  items.length = 0; itemTimer = null;
  if (drop) for (const f of fighters) f.held = null;
}
// Staff strikes: the punches, reaching farther with the staff tip and hitting harder.
// A kick, knee or elbow queued while holding a staff becomes one of them.
const STAFF_STRIKES = ['jab', 'cross', 'hook', 'uppercut'];
const STAFF_MOVE = {};
const staffTip = (J, hit) => {
  const H = J[hit], E = J[hit === 'hF' ? 'eF' : 'eB'], d = Math.hypot(H.x - E.x, H.y - E.y) || 1;
  return { x: H.x + (H.x - E.x) / d * STAFF_LEN, y: H.y + (H.y - E.y) / d * STAFF_LEN };
};
for (const id of STAFF_STRIKES) {
  const b = MOVE_BY[id], s = Object.create(b);
  const ra = staffTip(fk(b.A), b.hit).x, rw = staffTip(fk(b.W), b.hit).x, go = b.lunge * 0.7;
  Object.assign(s, { staff: true, dmg: b.dmg * 1.5, push: b.push * 1.4,
    range: [Math.max(4, Math.min(ra, rw) + go - 4), Math.max(ra, rw) + go + 8] });
  STAFF_MOVE[id] = s;
}
// The staff follows the style switches: it is used, and picked up, only while a striking
// style is on, or while every style is off (when fighters use every martial-arts move)
const STRIKING = ['boxing', 'muaythai', 'taekwondo'];
function staffUsable() {
  return STRIKING.some(s => cfg.styles[s]) || !Object.values(cfg.styles).some(Boolean);
}
// The move a fighter makes of a queued one: a strike becomes a staff strike while it holds
// a staff, and a staff strike queued before the staff was used up becomes the bare move again.
// A kick, knee or elbow becomes a staff swing of its own style, so no turned-off style shows.
function withStaff(f, m) {
  const staff = f.held && f.held.kind === 'staff' && staffUsable();
  if (staff && m && !m.type && !m.grab && !m.staff) {
    return STAFF_MOVE[m.id] || Object.assign(Object.create(STAFF_MOVE[pick(STAFF_STRIKES)]), { style: m.style, bare: m });
  }
  if (!staff && m && m.staff) return m.bare || Object.getPrototypeOf(m);
  return m;
}
// With no enemy close, an idle fighter walks to the nearest item it can use
function seekItem(f, dt) {
  if (!cfg.items || !items.length || f.alt > 0) return;
  for (const e of fighters) if (e.alive && isEnemy(f, e) && Math.abs(e.x - f.x) < 130 && Math.abs(e.z - f.z) < 30) return;
  let best = null, bd = 320;
  for (const it of items) {
    if (it.kind === 'heart' ? f.hp >= f.maxHp : f.held || (it.kind === 'staff' && !staffUsable())) continue;
    const d = Math.abs(it.x - f.x) + Math.abs(it.z - f.z);
    if (d < bd) { bd = d; best = it; }
  }
  if (!best) return;
  const dx = best.x - f.x;
  if (Math.abs(dx) > 1) f.facing = sgn(dx);
  f.vx = approach(f.vx, Math.abs(dx) > 4 ? f.facing * 110 : 0, 1200 * dt);
  f.vz = approach(f.vz, clamp((best.z - f.z) * 4, -45, 45), 600 * dt);
}
Fighter.prototype.u_boomerang = function (dt) {
  const md = this.md, t = this.target;
  if (t && t.alive) this.facing = sgn(t.x - this.x);
  this.vx = approach(this.vx, 0, 700 * dt);
  if (!md.t0) {
    lerpPose(this.pose, FLING, Math.min(1, dt * 20), this.pose);
    if (this.st >= 0.16 && this.W) {
      md.t0 = this.st; this.held = null;
      const s = this.castShot(this.W.hF, 'boomerang', BOOMERANG.speed, 0.02);
      Object.assign(s, { col: BOOMERANG_COL, life: 2.6, age: 0, v0x: s.vx, v0y: s.vy });
      sfx('toss', this.x);
      this.warn(9999, false);
    }
  } else {
    lerpPose(this.pose, MOVE_BY.jab.A, Math.min(1, dt * 25), this.pose);
    if (this.st - md.t0 > 0.3) this.endMove();
  }
};
// A boomerang slows, turns at about 1 s and flies back; its thrower catches it
function steerBoomerang(s, dt) {
  s.age += dt;
  s.vx -= s.v0x * dt; s.vy -= s.v0y * dt;
  const o = s.owner;
  if (s.age > 1 && (!o.alive || !o.W || Math.hypot(o.W.hF.x - s.x, o.W.hF.y - s.y) < 24)) s.life = 0;
}
function updateItems(dt) {
  if (!cfg.items) { if (items.length || itemTimer !== null) clearItems(true); return; }
  for (const f of fighters) {
    if (!f.held) continue;
    // A knockout drops it; a staff goes once its last strike ends, or once no striking style is on
    if (!f.alive || (f.held.kind === 'staff' && (f.held.n <= 0 || !staffUsable()) && !(f.move && f.move.staff))) { f.held = null; continue; }
    // A boomerang is thrown once at a target in range on the same line
    const t = f.target;
    if (f.held.kind === 'boomerang' && f.state === 'idle' && f.alt <= 0 && f.cool <= 0 && t && t.alive && t.hittable &&
        Math.abs(t.z - f.z) < 9 && Math.abs(t.x - f.x) >= BOOMERANG.range[0] && Math.abs(t.x - f.x) <= BOOMERANG.range[1]) {
      f.facing = sgn(t.x - f.x);
      f.startMove(BOOMERANG, true);
    }
  }
  if (itemTimer === null) itemTimer = rand(8, 15);
  if (!roundOver && (itemTimer -= dt) <= 0) {
    itemTimer = rand(8, 15);
    if (items.length < 2) spawnItem(pick(ITEM_KINDS), rand(40, worldW - 40));
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t += dt;
    if (it.alt > 0) {
      it.va -= 700 * dt; it.alt += it.va * dt;
      if (it.alt <= 0) { it.alt = 0; it.va = 0; spawnSparks(it.x, groundY(it.z), 'rgba(200,200,200,0.6)', 4, true); }
    }
    const y = groundY(it.z) - it.alt - 6;
    for (const f of fighters) {
      if (!f.alive || f.invis || !f.W || !ITEM_HOLD.has(f.state) || Math.abs(f.z - it.z) > 16) continue;
      if (Math.abs(f.W.hip.x - it.x) > 16 || y < f.W.head.y - 10 || y > groundY(f.z) - f.alt + 6) continue;
      if (it.kind === 'heart') {
        if (f.hp >= f.maxHp) continue;
        f.hp = Math.min(f.maxHp, f.hp + f.maxHp * HEART_HP / 100);
        spawnSparks(it.x, y, '#ff6b8a', 10, true);
      } else {
        if (f.held || (it.kind === 'staff' && !staffUsable())) continue;
        f.held = it.kind === 'staff' ? { kind: 'staff', n: STAFF_USES } : { kind: 'boomerang' };
        spawnSparks(it.x, y, '#ffe28a', 6, true);
      }
      sfx('shield', it.x, 0.4);
      items.splice(i, 1);
      break;
    }
  }
}
// A boomerang shape: two arms meeting at an angle, centred on x, y and turned by a
function boomerangPath(x, y, a, r) {
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a - 1) * r, y + Math.sin(a - 1) * r);
  ctx.lineTo(x, y);
  ctx.lineTo(x + Math.cos(a + 1) * r, y + Math.sin(a + 1) * r);
  ctx.stroke();
}
function drawItems() {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const it of items) {
    const x = it.x, y = groundY(it.z) - it.alt - 6 - (it.alt <= 0 ? Math.abs(Math.sin(it.t * 3)) * 3 : 0);
    ctx.globalAlpha = 0.12; ctx.fillStyle = cfg.line;
    ctx.beginPath(); ctx.ellipse(x, groundY(it.z), 8, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (it.kind === 'heart') {
      ctx.fillStyle = '#ff6b8a'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.bezierCurveTo(x - 9, y - 1, x - 5, y - 8, x, y - 3);
      ctx.bezierCurveTo(x + 5, y - 8, x + 9, y - 1, x, y + 6);
      ctx.fill(); ctx.stroke();
    } else if (it.kind === 'staff') {
      ctx.strokeStyle = WOOD; ctx.lineWidth = 2.5;
      path({ x: x - 18, y: y + 3 }, { x: x + 18, y: y - 3 });
    } else {
      ctx.strokeStyle = BOOMERANG_COL; ctx.lineWidth = 3;
      boomerangPath(x, y, -Math.PI / 2, 9);
    }
  }
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}
// What a fighter holds: a staff along the forearm of the striking (or front) hand, or a boomerang
function drawHeld(f) {
  const J = f.W;
  if (!f.held || !J || !f.alive || f.invis) return;
  ctx.globalAlpha = f.alpha; ctx.lineCap = 'round';
  if (f.held.kind === 'staff') {
    const hit = f.move && f.move.staff ? f.move.hit : 'hF', H = J[hit], T = staffTip(J, hit);
    ctx.strokeStyle = WOOD; ctx.lineWidth = 2.5;
    path({ x: H.x - (T.x - H.x) * 0.35, y: H.y - (T.y - H.y) * 0.35 }, T);
  } else {
    ctx.strokeStyle = BOOMERANG_COL; ctx.lineWidth = 2.5;
    boomerangPath(J.hF.x, J.hF.y, -Math.PI / 2, 7);
  }
  ctx.globalAlpha = 1; ctx.lineCap = 'butt';
}
Object.assign(window.__stickmanBrawl, { items, spawnItem, withStaff, newRound });

function update(dt) {
  roundRulesStep();
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
  updateItems(dt);
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
// ---------- Name tags and head gear ----------
// Names come from the owner as one comma-separated text (an ASCII comma, or the full-width
// ， or 、 a Chinese keyboard types): trimmed, cut to 12 characters,
// given to fighters in order; an empty entry leaves that fighter as #n.
const parseNames = s => String(s ?? '').split(/[,，、]/).map(t => Array.from(t.trim()).slice(0, 12).join(''));
const nameOf = f => cfg.names[f.id] || '';
const labelOf = f => nameOf(f).toUpperCase() || '#' + (f.id + 1);
function drawNameTags(list) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = '700 9px sans-serif';
  for (const f of list) {
    const name = nameOf(f);
    if (!name || !f.alive || !f.W || f.invis) continue;
    const hx = f.W.head.x, hy = Math.min(f.W.head.y, f.W.hip.y - 30);
    ctx.globalAlpha = 0.85 * f.alpha; ctx.fillStyle = colorOf(f);
    // Near the top of a high jump the tag above the health bar would leave the screen:
    // there it moves beside the bar instead, its 9 px text kept below the top edge
    if (hy - 29 >= 0) ctx.fillText(name, hx, hy - 20);
    else { ctx.textAlign = 'left'; ctx.fillText(name, hx + 16, Math.max(hy - 12, 9)); ctx.textAlign = 'center'; }
  }
  ctx.globalAlpha = 1;
}
// Chosen by index, so a fighter keeps the same gear every round
const GEAR = ['headband', 'mask', 'cap', 'topknot'];
const gearOf = f => GEAR[f.id % GEAR.length];
Object.assign(window.__stickmanBrawl, { nameOf, gearOf, newRound, render });
Object.defineProperty(window.__stickmanBrawl, 'winnerText', { get: () => winnerText });
function drawHeadgear(f, J, col, alpha) {
  const h = J.head, r = L.head;
  // u points from the neck up through the head; v points the way the face looks
  const dx = h.x - J.sh.x, dy = h.y - J.sh.y, d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d, vx = -uy * f.facing, vy = ux * f.facing;
  const at = (a, b) => ({ x: h.x + (vx * a + ux * b) * r, y: h.y + (vy * a + uy * b) * r });
  const wave = Math.sin(f.time * 9) * 0.25;
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  switch (gearOf(f)) {
    case 'headband':   // a band across the forehead, two tails flying from a knot at the back
      path(at(-1, 0.4), at(1, 0.4));
      path(at(-1, 0.4), at(-1.9, 0.5 + wave), at(-2.6, 0.2 + wave));
      path(at(-1, 0.4), at(-1.8, 0 - wave), at(-2.4, -0.3 - wave));
      break;
    case 'mask':       // an eye slit over the face and a short knot at the back
      path(at(0, 0.4), at(1, 0.4)); path(at(0, -0.1), at(1, -0.1));
      path(at(-1, 0.2), at(-1.7, 0.1 + wave));
      break;
    case 'cap':        // a band with a brim to the front and a button on top
      path(at(-1, 0.3), at(1.9, 0.3)); path(at(0, 1), at(0, 1.3));
      break;
    default:           // topknot: a small bun on a short stalk at the top of the head
      path(at(-0.2, 1), at(-0.3, 1.3));
      ctx.beginPath(); const k = at(-0.35, 1.65); ctx.arc(k.x, k.y, r * 0.35, 0, Math.PI * 2); ctx.stroke();
  }
}
function path(...pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}
function drawSkeleton(J, col, alpha, width, headFill) {
  ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const glow = musicGlow(); if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 10 * glow; }
  ctx.globalAlpha = alpha * 0.55;
  path(J.sh, J.eB, J.hB); path(J.hip, J.kB, J.fB);
  ctx.globalAlpha = alpha;
  path(J.hip, J.sh, J.head);
  path(J.hip, J.kF, J.fF); path(J.sh, J.eF, J.hF);
  ctx.beginPath(); ctx.arc(J.head.x, J.head.y, L.head, 0, Math.PI * 2);
  if (headFill) { ctx.fillStyle = headCol; ctx.fill(); }
  ctx.stroke();
  if (glow) ctx.shadowBlur = 0;
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
  if (f.move && f.move.type === 'clones' && f.md && f.md.clones) {
    // Shadow clones: faded copies in the fighter's pose; fac -1 mirrors one to face the other way
    for (const c of f.md.clones) {
      const C = {};
      for (const k of JOINTS) C[k] = { x: c.x + (J[k].x - f.x) * c.fac, y: J[k].y - c.alt };
      drawSkeleton(C, col, 0.5 * c.a, 3, true);
    }
  }
  const base = (f.alive ? 1 : 0.5) * f.alpha;
  const frozen = f.state === 'frozen';
  drawSkeleton(J, f.flash > 0 ? '#ffffff' : frozen ? ELEMENT.ice : col, base, 3.2, true);
  if (cfg.headgear) drawHeadgear(f, J, col, base);
  if (f.king && f.alive) drawCrown(J, f.alpha);
  if (frozen) {
    // A block of ice around the body
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of JOINTS) { const p = J[k]; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    x0 -= 8; y0 -= L.head + 4; x1 += 8; y1 += 4;
    ctx.globalAlpha = 0.18; ctx.fillStyle = ELEMENT.ice; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalAlpha = 0.6; ctx.strokeStyle = ELEMENT.ice; ctx.lineWidth = 1.2; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    path({ x: x0 + 4, y: y0 + 10 }, { x: x0 + 12, y: y0 + 2 });
  }
  ctx.globalAlpha = 1;
  const m = f.move;
  if (m && f.md && m.type === 'fireball' && f.md.ph === 'charge') {
    // The fireball growing between the hands
    const H = mid(J.hF, J.hB), r = 3 + Math.min(1, f.st / 0.4) * 8 + Math.sin(f.time * 40);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(H.x, H.y, 0, H.x, H.y, r * 1.6);
    g.addColorStop(0, '#ffe28a'); g.addColorStop(0.5, ELEMENT.fire); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(H.x, H.y, r * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (m && f.md && m.type === 'shield' && f.md.ph === 'up') {
    // A curved barrier in front of the open palm
    const c = mid(J.sh, J.hip), fac = f.facing, flick = 0.85 + Math.sin(f.time * 30) * 0.1;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (fac > 0) ctx.arc(c.x - 6, c.y, 34, -1, 1); else ctx.arc(c.x + 6, c.y, 34, Math.PI - 1, Math.PI + 1);
    ctx.globalAlpha = 0.18 * flick; ctx.fill();
    ctx.globalAlpha = 0.8 * flick; ctx.stroke();
    ctx.restore();
  }
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
  } else if (o.type === 'puff' && layer === 1) {
    ctx.fillStyle = SMOKE;
    for (const b of o.balls) {
      ctx.globalAlpha = 1 - u;
      ctx.beginPath(); ctx.arc(o.x + b.dx * (1 + u), o.y + b.dy * (1 + u) - u * 10, b.r * (0.6 + u * 0.8), 0, Math.PI * 2); ctx.fill();
    }
  } else if (o.type === 'log' && layer === 0) {
    // The log left in the fighter's place topples over, then fades
    const fall = Math.min(1, o.t / 0.35), a = o.dir * Math.PI / 2 * ease(fall);
    const H = 46, R = 6;
    ctx.save();
    ctx.translate(o.x, o.y); ctx.rotate(a);
    ctx.globalAlpha = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
    ctx.fillStyle = WOOD; ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 1.2;
    ctx.fillRect(-R, -H, R * 2, H); ctx.strokeRect(-R, -H, R * 2, H);
    ctx.beginPath(); ctx.moveTo(-R, -H * 0.6); ctx.lineTo(0, -H * 0.55); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -H, R, 2.5, 0, 0, Math.PI * 2); ctx.fillStyle = '#c99a63'; ctx.fill(); ctx.stroke();
    ctx.restore();
  } else if (o.type === 'mark' && layer === 0) {
    // Where lightning will strike: a pulsing ring on the floor
    const p = 0.6 + Math.sin(o.t * 30) * 0.4;
    ctx.globalAlpha = 0.7 * p; ctx.strokeStyle = o.col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(o.x, o.y, 24, 5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.15 * p; ctx.fillStyle = o.col; ctx.fill();
  } else if (o.type === 'bolt' && layer === 1) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
    ctx.shadowColor = o.col; ctx.shadowBlur = 18;
    for (const [w, col, a] of [[7, o.col, 0.5], [2.5, '#ffffff', 1]]) {
      ctx.globalAlpha = a * (1 - u); ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(o.pts[0][0], o.pts[0][1]);
      for (let i = 1; i < o.pts.length; i++) ctx.lineTo(o.pts[i][0], o.pts[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  } else if (o.type === 'flame' && layer === 1) {
    // A few flickering tongues of fire that shrink away
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = o.x + (i - 2) * 5, h = (14 + rand(0, 8)) * (1 - u) * (i % 2 ? 0.7 : 1);
      ctx.globalAlpha = 0.7 * (1 - u); ctx.fillStyle = i % 2 ? '#ffe28a' : ELEMENT.fire;
      ctx.beginPath(); ctx.moveTo(x - 4, o.y); ctx.quadraticCurveTo(x + rand(-3, 3), o.y - h * 1.4, x + 4, o.y); ctx.fill();
    }
    ctx.restore();
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
// ---------- Background themes ----------
// Drawn in code with a few dark, low-contrast shapes, so the figures stay readable. A theme
// is painted once into an offscreen canvas and copied each frame; the copy is repainted only
// when the size, the theme or (for Day and night) the minute changes. Plain is the flat
// background color, as before, and makes no canvas.
const bg = {
  now: () => new Date(),   // Replaced in tests to set the clock
  builds: 0,               // Times the cache was painted, for tests
  canvas: null, key: '',
  // Sky gradient, top to bottom, for each time of day
  SKY: {
    night: ['#04060d', '#0b1020', '#121830'],
    dawn: ['#141a33', '#2a2440', '#4a3040'],
    day: ['#18283e', '#22364e', '#2e4458'],
    dusk: ['#1a1430', '#3a2034', '#4c2a26'],
  },
  skyPhase(d) {
    const h = d.getHours() + d.getMinutes() / 60;
    return h < 5 || h >= 20.5 ? 'night' : h < 7.5 ? 'dawn' : h < 18 ? 'day' : 'dusk';
  },
  // The fill inside a head: the backdrop behind the fighters' heads (the wall or the sky), so a
  // head reads as an outline over the theme rather than a dark disc
  headFill(theme, date) {
    if (theme === 'dojo') return '#1a1510';
    if (theme === 'rooftop') return bg.SKY.night[1];
    if (theme === 'comic') return '#16141d';
    if (theme === 'daynight') return bg.SKY[bg.skyPhase(date)][1];
    return cfg.bg;
  },
};
let headCol = cfg.bg;      // This frame's head fill, set by render()
// A fixed pseudo-random value in [0, 1) for an index, so the drawing never touches
// Math.random and looks the same every time it is repainted
const bgHash = i => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function bgSky(c, top, bottom, colors) {
  const g = c.createLinearGradient(0, top, 0, bottom);
  colors.forEach((col, i) => g.addColorStop(i / (colors.length - 1), col));
  c.fillStyle = g; c.fillRect(0, 0, SW, bottom);
}
function bgSkyline(c, floorY, lit) {
  for (let x = -10, i = 0; x < SW; i++) {
    const w = 40 + bgHash(i) * 90, h = floorY * (0.18 + bgHash(i + 50) * 0.32);
    c.fillStyle = '#0a0c14'; c.fillRect(x, floorY - h, w + 1, h);
    c.fillStyle = '#3a3420';
    for (let wy = floorY - h + 10; wy < floorY - 12; wy += 16)
      for (let wx = x + 7, j = 0; wx < x + w - 10; wx += 13, j++)
        if (bgHash(i * 131 + wy * 7 + j) < lit) c.fillRect(wx, wy, 5, 7);
    x += w + 4 + bgHash(i + 99) * 14;
  }
}
function bgPaint(c, theme, date) {
  const floorY = floorTop * S;
  c.fillStyle = cfg.bg; c.fillRect(0, 0, SW, SH);
  if (theme === 'dojo') {
    c.fillStyle = '#1a1510'; c.fillRect(0, 0, SW, floorY);
    const pw = Math.max(80, SW / 7), top = SH * 0.08, bottom = floorY - SH * 0.05;
    for (let x = pw * 0.2; x + pw * 0.8 < SW; x += pw) {
      c.fillStyle = '#29231a'; c.fillRect(x, top, pw * 0.8, bottom - top);
      c.fillStyle = '#1a1510';
      for (let k = 1; k < 3; k++) c.fillRect(x + pw * 0.8 * k / 3 - 1, top, 2, bottom - top);
      for (let y = top + (bottom - top) / 4; y < bottom - 4; y += (bottom - top) / 4) c.fillRect(x, y - 1, pw * 0.8, 2);
    }
    c.fillStyle = '#120e0a'; c.fillRect(0, floorY - 6, SW, 6);
    c.fillStyle = '#17120c'; c.fillRect(0, floorY, SW, SH - floorY);
    c.fillStyle = '#100c08';
    const bh = Math.max(14, (SH - floorY) / 8);
    for (let y = floorY, r = 0; y < SH; y += bh, r++) {
      c.fillRect(0, y, SW, 1.5);
      for (let x = (r % 2) * 90; x < SW; x += 180) c.fillRect(x, y, 1.5, bh);
    }
  } else if (theme === 'rooftop') {
    bgSky(c, 0, floorY, bg.SKY.night);
    c.fillStyle = '#353a4c'; c.beginPath(); c.arc(SW * 0.8, SH * 0.16, SH * 0.055, 0, Math.PI * 2); c.fill();
    bgSkyline(c, floorY, 0.22);
    c.fillStyle = '#0c0d12'; c.fillRect(0, floorY, SW, SH - floorY);
    c.fillStyle = '#16171e'; c.fillRect(0, floorY, SW, 3);
  } else if (theme === 'comic') {
    c.fillStyle = '#16141d'; c.fillRect(0, 0, SW, SH);
    const cx = SW / 2, cy = SH / 2, r = Math.hypot(SW, SH);
    c.fillStyle = '#1c1a25';
    for (let i = 0; i < 48; i += 2) {
      const a = i / 48 * Math.PI * 2, b = (i + 1) / 48 * Math.PI * 2;
      c.beginPath(); c.moveTo(cx, cy);
      c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.lineTo(cx + Math.cos(b) * r, cy + Math.sin(b) * r);
      c.fill();
    }
    c.fillStyle = '#24212f';
    for (let y = 7; y < SH; y += 14) for (let x = 7 + ((y - 7) / 14) % 2 * 7; x < SW; x += 14) {
      const d = Math.hypot(x - cx, y - cy) / (r / 2);
      if (d > 0.35) { c.beginPath(); c.arc(x, y, Math.min(4, d * 3.2), 0, Math.PI * 2); c.fill(); }
    }
  } else if (theme === 'daynight') {
    const phase = bg.skyPhase(date);
    bgSky(c, 0, floorY, bg.SKY[phase]);
    if (phase === 'night') {
      c.fillStyle = '#5a6078';
      for (let i = 0; i < 90; i++) c.fillRect(bgHash(i) * SW, bgHash(i + 300) * floorY * 0.7, 1.5, 1.5);
    }
    bgSkyline(c, floorY, phase === 'day' ? 0 : phase === 'night' ? 0.22 : 0.1);
    c.fillStyle = '#0c0d12'; c.fillRect(0, floorY, SW, SH - floorY);
  }
}
// Called from render() for any theme but Plain, after the flat fill
function drawBackground() {
  // Before the window has a real size the cache would be 0 x 0, which drawImage refuses
  if (!(SW > 0 && SH > 0)) return;
  const date = bg.now();
  const minute = cfg.bgTheme === 'daynight' ? date.getHours() * 60 + date.getMinutes() : 0;
  const key = [cfg.bgTheme, SW, SH, dpr, S, cfg.bg, minute].join();
  if (!bg.canvas && typeof document.createElement === 'function') bg.canvas = document.createElement('canvas');
  if (!bg.canvas) { bgPaint(ctx, cfg.bgTheme, date); return; }   // No offscreen canvas: paint every frame
  if (key !== bg.key) {
    bg.key = key; bg.builds++;
    bg.canvas.width = Math.round(SW * dpr); bg.canvas.height = Math.round(SH * dpr);
    const c = bg.canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    bgPaint(c, cfg.bgTheme, date);
  }
  ctx.drawImage(bg.canvas, 0, 0, SW, SH);
}
window.__stickmanBrawl.bg = bg;
function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = cfg.bg; ctx.fillRect(0, 0, SW, SH);
  if (cfg.bgTheme !== 'plain') drawBackground();
  else if (bg.canvas) {
    // Back to Plain: free the cache's pixels (about 33 MB at 4K) instead of holding them
    bg.canvas.width = bg.canvas.height = 0; bg.canvas = null; bg.key = '';
  }
  headCol = bg.headFill(cfg.bgTheme, bg.now());
  const sk = cfg.reduceMotion ? 0 : shake;
  const ox = sk ? rand(-sk, sk) : 0, oy = sk ? rand(-sk, sk) : 0;
  ctx.setTransform(dpr * S, 0, 0, dpr * S, ox * dpr, oy * dpr);
  view = { z: 1, x: ox, y: oy };
  slowmoView(ox, oy);
  ctx.fillStyle = cfg.line;
  ctx.globalAlpha = 0.035; ctx.fillRect(-20, floorTop - 6, worldW + 40, DEPTH + 12);
  ctx.globalAlpha = 0.12; ctx.fillRect(-20, floorTop + DEPTH + 6, worldW + 40, 0.7);
  ctx.globalAlpha = 1;
  drawPlatforms();
  for (const o of fx) drawFx(o, 0);
  drawItems();

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
  for (const f of list) drawHeld(f);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const s of shots) {
    ctx.shadowColor = s.col; ctx.shadowBlur = 14;
    if (s.kind === 'ice') {
      // A thin diamond pointing where it flies
      const a = Math.atan2(s.vy, s.vx), c = Math.cos(a), sn = Math.sin(a);
      const pt = (f, w) => ({ x: s.x + c * f - sn * w, y: s.y + sn * f + c * w });
      ctx.fillStyle = s.col; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (const p of [pt(9, 0), pt(-2, 3), pt(-12, 0), pt(-2, -3)]) ctx.lineTo(p.x, p.y);
      ctx.closePath(); ctx.fill();
      continue;
    }
    if (s.kind === 'boomerang') { ctx.strokeStyle = s.col; ctx.lineWidth = 3; ctx.lineCap = 'round'; boomerangPath(s.x, s.y, s.age * 20, 8); continue; }
    if (s.kind === 'star') {
      // A spinning four-pointed star
      const a0 = s.life * 25;
      ctx.fillStyle = s.col; ctx.globalAlpha = 0.95; ctx.shadowBlur = 6;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = a0 + i * Math.PI / 4, r = i % 2 ? 2 : 6.5;
        ctx.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill();
      continue;
    }
    const r = s.kind === 'fire' ? 11 + Math.sin(s.life * 40) * 1.5 : 7;
    ctx.fillStyle = s.col; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = s.kind === 'fire' ? '#ffe28a' : '#ffffff'; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, r / 2, 0, Math.PI * 2); ctx.fill();
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
      ctx.globalAlpha = 0.9; ctx.fillStyle = colorOf(f); ctx.fillRect(hx - 13, hy - 17, 26 * clamp(f.hp / f.maxHp, 0, 1), 2.5);
    }
  }
  drawNameTags(list);
  for (const o of fx) drawFx(o, 2);
  for (const o of fx) drawFx(o, 3);
  // The score and the win text stay where they are while the slow-motion finish zooms the fight
  ctx.setTransform(dpr * S, 0, 0, dpr * S, ox * dpr, oy * dpr);
  if (cfg.showScore) drawScore();
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
// real is capped at 0.2 s at most, so 300% needs at most 36 substeps
const SUBSTEP = 1 / 60, MAX_SUBSTEPS = 36;
let paused = false, last = performance.now(), next = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (paused) { last = now; next = 0; return; }
  if (cfg.fps > 0) {
    // Draw on the first refresh at or after the due time, then move the due time on by one
    // interval rather than from now, so the time a refresh lands late is not lost each frame
    // and the rate averages out at the limit. 2 ms of slack absorbs timer jitter, so a limit
    // equal to the display rate does not drop a refresh that comes slightly early.
    const interval = 1000 / cfg.fps;
    if (now < next - 2) return;
    next += interval;
    if (next < now) next = now + interval;   // Fell behind (first frame, a stall): start over
  }
  // Real time per frame follows the actual frame interval, so game time keeps up with real
  // time at any frame rate, slow machines included. Only a stall (or a page coming back from a
  // hidden tab) is capped, at 0.2 s, so it does not jump the fight ahead.
  const real = Math.min(0.2, (now - last) / 1000);
  last = now;
  shake = shake > 0.3 ? shake * Math.pow(0.0015, real) : 0;
  // Split the simulated time into equal substeps of at most about 1/60 s, so blasts,
  // strike and grab windows and ragdolls see the same step size at any speed or frame rate.
  // The 0.1 slack keeps a slightly long 60 fps frame at 100% speed in one step.
  const sim = real * cfg.speed * slowmoRate(real);
  const n = clamp(Math.ceil(sim / SUBSTEP - 0.1), 1, MAX_SUBSTEPS);
  for (let i = 0; i < n; i++) {
    // Hit stop is counted in game time, so it is shortened by Speed and a step it takes is
    // not lost: the fight pauses at the hit, then runs on within the same frame. The substep
    // a hit stop ends in simulates the rest of its time, so a hit stop lasts exactly as long
    // as asked rather than a whole number of substeps.
    let dt = sim / n;
    if (freeze > 0) {
      const f = Math.min(freeze, dt);
      freeze -= f; dt -= f;
      if (dt <= 1e-9) continue;
    }
    update(dt);
    freezeGap -= dt;
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
    if (p.roundrules) { cfg.rules = p.roundrules.value; reset = true; }
    if (p.gamespeed) cfg.speed = p.gamespeed.value / 100;
    if (p.platforms) { cfg.platforms = p.platforms.value; layoutPlatforms(); }
    if (p.figurescale) { cfg.scale = p.figurescale.value / 100; resize(); reset = true; }
    if (p.showhealth) cfg.showHP = p.showhealth.value;
    if (p.colorful) cfg.colorful = p.colorful.value;
    if (p.showscore) cfg.showScore = p.showscore.value;
    if (p.backgroundcolor) { cfg.bg = weColor(p.backgroundcolor.value); document.body.style.background = cfg.bg; }
    if (p.linecolor) cfg.line = weColor(p.linecolor.value);
    if (p.backgroundtheme) cfg.bgTheme = p.backgroundtheme.value;
    if (p.reducemotion) cfg.reduceMotion = p.reducemotion.value;
    if (p.soundeffects) { cfg.sound = p.soundeffects.value; soundSetPaused(paused); }
    if (p.fighternames) cfg.names = parseNames(p.fighternames.value);
    if (p.headgear) cfg.headgear = p.headgear.value;
    if (p.soundvolume) { cfg.volume = p.soundvolume.value / 100; soundSetVolume(); }
    if (p.slowmofinish) { cfg.slowmo = p.slowmofinish.value; if (!cfg.slowmo) slowmoT = -1; }
    if (p.audioreactive) { cfg.audio = p.audioreactive.value; musicReset(); }
    if (p.audiostrength) cfg.audioStrength = p.audiostrength.value / 100;
    if (p.clickblast) cfg.clickBlast = p.clickblast.value;
    if (p.items) { cfg.items = p.items.value; if (!cfg.items) clearItems(true); }
    let styles = false;
    for (const s of Object.keys(cfg.styles)) if (p['style' + s]) { cfg.styles[s] = p['style' + s].value; styles = true; }
    // Drop moves queued from a style just turned off, so nobody starts one; a move in progress finishes
    if (styles) for (const f of fighters) if (f.nextMove && !cfg.styles[f.nextMove.style]) f.nextMove = null;
    // A readied substitution is unseen until the hit, so it goes too
    if (styles && !cfg.styles.ninjutsu) for (const f of fighters) f.subFrom = null;
    if (reset) newRound();
  },
  applyGeneralProperties(p) { if (p.fps !== undefined) cfg.fps = p.fps; },
  setPaused(v) { paused = v; soundSetPaused(v); },
};

window.addEventListener('resize', resize);
// A plain browser keeps audio suspended until the page is clicked; Wallpaper Engine does not.
window.addEventListener('pointerdown', () => { if (!paused && cfg.sound && snd.ac && snd.ac.state === 'suspended') soundSetPaused(false); });
// Click to blast: a click makes an impact and a crack where it lands and launches the fighters
// within BLAST_R of it away from it, harder the closer they are; knocked-out bodies are pushed
// too. It deals no damage. After one, clicks are ignored for BLAST_COOL seconds, so a stream of
// clicks cannot juggle everyone forever. impact() already obeys "Reduce flashing and screen shake".
const BLAST_R = 150, BLAST_COOL = 0.5;
let blastAt = -Infinity;
function clickBlast(e) {
  if (!cfg.clickBlast || paused || e.button > 0) return;
  const now = (e.timeStamp ?? performance.now()) / 1000;
  if (now - blastAt < BLAST_COOL) return;
  blastAt = now;
  const x = (e.clientX - view.x) / (S * view.z), y = (e.clientY - view.y) / (S * view.z);   // Screen to world, as render() last drew it
  impact(x, y, true);
  const onFloor = y >= floorTop - 6 && y <= floorTop + DEPTH + 6;
  crack(x, y, onFloor ? 'ground' : 'wall', 60);
  for (const f of fighters) {
    if (f.rag) {
      for (const o of Object.values(f.rag.pts)) {
        const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy) || 1;
        if (d >= BLAST_R) continue;
        const v = 300 + 600 * (1 - d / BLAST_R);
        o.px = o.x - dx / d * v * RAG_H; o.py = o.y - (dy / d * v - 250) * RAG_H;
      }
      f.rag.age = Math.min(f.rag.age, 3.5);   // A body at rest simulates again
      continue;
    }
    if (!f.alive || f.invis || f.state === 'thrown' || f.state === 'wait') continue;
    const c = f.bodyPoint(), dx = c.x - x, dy = c.y - y, d = Math.hypot(dx, dy);
    if (d >= BLAST_R) continue;
    const k = 1 - d / BLAST_R, uy = d ? dy / d : 0;
    f.clearMove();
    f.launch(sgn(dx) * (260 + 540 * k), (220 + 480 * k) * clamp(0.5 - uy, 0.3, 1.5));
  }
}
window.addEventListener('pointerdown', clickBlast);
resize();
newRound();
requestAnimationFrame(frame);
})();
