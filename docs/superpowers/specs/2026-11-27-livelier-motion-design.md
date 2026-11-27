# Livelier motion: design

Date: 2026-11-27

## Intent

The fighters move stiffly. Every strike is two keyframes (wind-up `W`, impact `A`)
joined by straight angle interpolation and returned to `GUARD`; the walk swings
only the thighs; every other state eases toward its pose exponentially and stops
dead. The owner wants the motion to read as agile and alive, and chose the full
treatment: all four layers below, each landed as its own commit so each can be
judged, and reverted, alone.

## Goals

1. **Spring pose tracking** - what is drawn follows the game's pose through a
   damped spring, so every change of pose overshoots slightly and settles.
2. **Walk cycle** - walking bends the knees through the stride, swings the arms
   opposite the legs, and leans the torso with speed.
3. **Follow-through keyframe** - every martial-arts move gets a third pose `F`,
   carried past the impact before the return to guard.
4. **Secondary motion** - the head and hands lag behind the body's movement and
   catch up, on top of the spring.

## Non-goals

- No new moves, no change to damage, reach, range, timing (`wind`, `act`, `rec`)
  or AI choices.
- No change to the ragdoll, which is already physical.
- The comic specials, magic and ninjutsu keep their own pose code; they gain
  liveliness only through layers 1 and 4, which sit under every state.

## Anti-goals

- **Fight balance shifting.** Overshoot that makes a fist reach further would
  change which hits land. Layers 1 and 4 are drawing only.
- **Rubber bodies.** Overshoot must read as snap, not wobble: a pose settles in
  well under a strike's recovery, and limbs never visibly stretch (angles only,
  so segment lengths stay fixed).
- **Breaking the house rules**: no dependency, no build step, nothing new in
  `wallpaper/`.

## Constraints

- `f.W` (from `joints()`, built by `fk(this.pose)`) is what the game reads for
  hits, grabs, held items and positions; it stays exactly as today for layers 1
  and 4. The drawn body comes from a second set of joints.
- Layers 1 and 4 call no `Math.random`, so they cannot shift the random sequence.
  Layers 2 and 3 change `this.pose`, so they may shift fights slightly: `demo.gif`
  and `docs/images/` are re-recorded at the end, after a fresh seed scan.
- `tests/pose-keys.test.mjs` requires a fighter's `pose` to hold exactly `KEYS`;
  the display pose is a separate object.
- Frame rate varies under Wallpaper Engine; the spring must stay stable for any
  step the game takes (sub-step or use an exact/semi-implicit integration).

## Approaches considered

- **A. Everything in the game pose.** Spring and lag applied to `this.pose`.
  Simplest, but overshoot changes reach and hit timing: rejected (anti-goal).
- **B. Display layer for spring and lag, game pose for walk and `F`** (chosen).
  Walk and follow-through are pose content that the game can own like any other
  pose; spring and lag are presentation, so they live only in what is drawn.
- **C. Everything in the display layer.** Keeps the fight byte-identical, but a
  follow-through drawn and not simulated would disagree with the recovery that
  hits and blocks see. Rejected.

## The design

### 1. Spring (display layer)

- The drawn pose is the game pose plus a spring offset, never a lagged chase
  of it: `look = pose + d` per key, where `d` (with velocity `dV`) is a damped
  spring at rest at 0 and kicked by the game pose's acceleration,
  `d'' = -w^2 d - 2 z w d' - g * pose''`, with `pose''` taken from the last
  steps of `this.pose`. `g` below 1 (start near 0.35) keeps the lag small
  while a stop still overshoots; `w` around 40 rad/s and `z` around 0.5 as a
  start. (Builder check: a plain chase spring would draw a jab, at 0.05 s to
  impact, and the barrage, at 0.045 s a pose, visibly short.) My call.
- Bound, tested: at a strike's impact the drawn hit joint is within 4 px of
  the game one, and `d` is under 0.02 rad within 0.25 s of the pose holding still.
- A display `joints()` variant (`drawJoints()` or similar) builds world joints
  from `look` the same way `joints()` does from `pose`, stored as `f.V`
  next to `f.W` wherever `f.W` is refreshed (including the resize path).
- Everything that draws a fighter's body reads `f.V`: the skeleton, trail,
  clones, headgear, crown, frozen block, held item. Ragdoll fighters draw
  `f.rag.pts` as today.
- The offset resets (`d = dV = 0`) when a fighter spawns, a round starts, it
  leaves the ragdoll, or it is frozen (and stays 0 while frozen, so nothing
  wobbles inside the ice). My call.
- The knockout builds the ragdoll from `f.W` as today; the drawn body may jump
  by the offset (a few degrees) on that frame, which the impact hides. Starting
  it from `f.V` would let drawing feed game state. My call.
- Drawing reads `f.V || f.W`: many tests set `f.W` by hand and never build `f.V`.
- Hit stop skips `update()`, so the offset freezes with the fight.
- Not tied to `reduceMotion`: that setting is labeled "Reduce flashing and
  screen shake" and is on by default; body motion is neither, and gating it
  would hide layers 1 and 4 from most viewers. My call.

### 2. Walk cycle (game pose, `updIdle`)

- Thighs keep their swing; knees bend most as each leg passes under the body;
  arms swing opposite their legs at a smaller amplitude; torso lean grows
  smoothly with speed instead of the single step at 300 px/s.
- Amplitudes scale with speed as today, so standing still is the guard plus the
  idle bob.

### 3. Follow-through (game pose, `updAttack`)

- Every entry in `MOVES` gets a hand-authored `F`: the impact carried on
  (fist past the target line, kicking leg on round, torso still turning, throws
  finishing their rotation). Staff strikes inherit `F` through `Object.create`.
- Timing is unchanged: the recovery `rec` is split, about the first third
  `A -> F` (ease-out), the rest `F -> GUARD` (ease in-out). The `A` phase and
  the hit window are untouched.
- `range` computations that read `fk(m.A)`/`fk(m.W)` stay as they are.

### 4. Secondary motion (display layer)

- In the display joints only: the head offsets opposite the shoulder's
  acceleration and springs back; the hands do the same against the elbows'.
  Measured in the fighter's own frame (local joints before facing and
  position), so teleports, substitutions and smoke reappearing cause no jerk.
  Done as small positional lags clamped to a few pixels, and the forearm and
  neck then drawn to the lagged points without changing their drawn length
  noticeably (clamp keeps the stretch under ~10%), or as an extra angle lag on
  the neck and elbows - builder's choice, whichever looks better.

### Tests

- The display pose overshoots a step change in `pose` and settles within a
  bound; it is stable at large steps (e.g. dt = 0.1).
- `f.W` is unaffected by the display layer (hits read the game pose).
- Every `MOVES` entry has an `F` holding only `KEYS`; the pose passes through
  `F` during recovery and the move still ends on time.
- Walking moves the knees and arms in step with the thighs.
- Existing tests stay green; pins that move because of layers 2-3 are updated
  with the reason.

### Rollout

One commit per layer (1, 2, 3, 4), then re-scan seeds and re-record
`demo.gif` and `docs/images/` in a final commit naming the seed. One pull request.

## Left to the builder

Spring constants, walk amplitudes, every `F` pose, the split of `rec`, the
lag method and clamps in layer 4, and the name of the display joints - all
judged by recording and looking.
