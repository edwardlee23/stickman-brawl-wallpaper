# Livelier Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the stick fighters move with snap and follow-through: a drawn spring offset, a full walk cycle, a third keyframe per strike, and lagging head and hands.

**Architecture:** `this.pose` and `f.W` stay the game's truth (hits, grabs, items). Layers 1 and 4 add a drawing-only pose offset and joint lag, giving `f.V`, which every body drawing reads as `f.V || f.W`. Layers 2 and 3 change `this.pose` itself in `updIdle` and `updAttack`.

**Tech Stack:** Plain browser JavaScript in `wallpaper/main.js`, `node:test` tests loaded through `tests/load-main.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-27-livelier-motion-design.md`

## Global Constraints

- No runtime dependency, no build step, nothing new in `wallpaper/`.
- Layers 1 and 4 call no `Math.random` and never write `this.pose`, `f.W` or any game state.
- Move timing (`wind`, `act`, `rec`), damage, reach, `range` and AI choices unchanged.
- `fighter.pose` holds exactly `KEYS` (`tests/pose-keys.test.mjs`).
- Comments and commit messages in English; Conventional Commits; each ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm run check` passes after every task.

## Review Focus

1. Large or uneven steps (Wallpaper Engine at 10-30 fps, dt up to 0.1): the spring and lag must not blow up. Test in Task 1 and Task 4.
2. Hit stop and pause: no `update()` runs, so the drawn body holds still. Covered by placing the spring step inside the global `update`; test in Task 1.
3. Afterimage trail and shadow clones drawn from the lively body, not the stiff one: trail snapshots (`main.js:2776`) read `f.V || f.W`. Test in Task 1.
4. Frozen fighter: offset and lag are 0 the whole freeze. Test in Task 1 (offset) and Task 4 (lag).
5. Spinning moves (`spin`, which flips `drawFacing`) and the thrown/launched states that re-anchor joints (`joints()` `px`/`py`): the display joints must go through the same anchoring. Pinned by Task 1's "V equals W at rest in every state" test.

---

### Task 1: Drawing-only spring offset

**Files:**
- Modify: `wallpaper/main.js` - `Fighter` constructor (~920), `joints()` (934), global `update` joint refresh (~2768) and trail snapshot (~2776), resize refresh (379), freeze (~2177), `drawHeld` (2721), `drawAura` (2897), `drawFighter` (2912), debug hook (2736)
- Test: `tests/motion-spring.test.mjs`

**Interfaces:**
- Produces:
  - `Fighter#look`: `{d, v, p0, v0}` - per-key offset, its velocity, last pose, last pose velocity (objects over `KEYS`).
  - `Fighter#resetLook()`: zeroes `d` and `v`, sets `p0` to the current pose and `v0` to 0.
  - `Fighter#stepLook(dt)`: advances the offset.
  - `Fighter#joints(pose = this.pose)`: unchanged output for the default; only the default call sets `this.hipH`.
  - `Fighter#viewJoints()`: world joints from `pose + look.d`, same anchoring as `joints()`. Task 4 adds lag here.
  - `f.V`: set next to every `f.W = ...` refresh (rag: `f.V = f.rag.pts`).
  - `LOOK = { w: 40, z: 0.5, g: 0.35 }` constants, exposed on `window.__stickmanBrawl`.

- [ ] **Step 1: Write the failing tests** in `tests/motion-spring.test.mjs` (load with `loadMain({ expose: ... })` as other tests do, hold fighters as `tests/fighter-moves.test.mjs` `hold()` does):
  - `a step change in pose overshoots, then settles`: set `f.pose.aF += 1` once after resetLook, step `stepLook(1/60)` for 0.5 s; assert the drawn `aF` (`pose.aF + look.d.aF`) exceeded the new value at some step, and `Math.abs(look.d.aF) < 0.02` from 0.25 s after the pose stopped.
  - `the offset stays bounded at dt = 0.1`: same kick, steps of 0.1 for 3 s; every `|d|` < 1 and final < 0.02.
  - `hits read the game pose`: run a seeded 10 s fight with `update(1/60)`; for every fighter each step, `f.W` deep-equals `f.joints()`.
  - `a strike's impact is drawn within 4 px`: start each `MOVES` id on a held fighter, step to `wind + act * 0.5`, assert `Math.hypot` of `f.V[m.hit] - f.W[m.hit]` <= 4.
  - `at rest the drawn body is the game body`: for states idle, hit, frozen, thrown, launched with pose held still 1 s, `f.V` equals `f.W` to 1e-6.
  - `frozen fighters keep a zero offset`: kick the pose, freeze the fighter (via the freeze path at ~2177), assert `look.d` all 0 each step of the freeze.
  - `hit stop freezes the drawn body`: during a hit stop, `f.V` unchanged across frames.
  - `the afterimage trail is drawn from V`: with `trailOn`, the snapshot equals `f.V` at that step.

- [ ] **Step 2: Run** `node --test tests/motion-spring.test.mjs`. Expected: FAIL (`stepLook` / `f.V` undefined).

- [ ] **Step 3: Implement.** `stepLook(dt)`: sub-step at most 1/240 s; per key estimate `a = (vel - v0) / h` from `vel = (pose - p0) / dt` once per call, then semi-implicit Euler `v += (-w*w*d - 2*z*w*v - g*a) * h; d += v * h`. Call it for every fighter in the global `update` just before `f.W` is refreshed (~2768), so hit stop and pause skip it. Call `resetLook()` in the constructor, on entering `frozen` and every step while frozen, and on ragdoll start. Every drawing listed under Files reads `f.V || f.W`.

- [ ] **Step 4: Run** `npm run check`. Expected: all pass. Tune `LOOK` by opening `wallpaper/index.html?count=4` if the snap reads as wobble.

- [ ] **Step 5: Commit** `feat: draw poses through a spring offset so moves snap and settle`.

### Task 2: Walk cycle

**Files:**
- Modify: `wallpaper/main.js` `updIdle` walk block (~1149-1156)
- Test: `tests/motion-walk.test.mjs`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `WALK = { thigh: 0.32, knee: 0.55, arm: 0.22 }` amplitudes (starting values), exposed on the debug hook.

- [ ] **Step 1: Write the failing tests:**
  - `walking bends each knee most as its leg passes under the body`: drive a fighter at 120 px/s for one stride; at the step where `lF` is closest to GUARD.lF, `kF` is at least `WALK.knee * 0.6` more bent (more negative) than GUARD.kF.
  - `arms swing opposite their legs`: correlation of `(aF - GUARD.aF)` with `(lF - GUARD.lF)` over a stride is below -0.8.
  - `lean grows smoothly with speed`: target `t` at 200, 250, 300, 350, 400 px/s is strictly increasing, with no jump over 0.15 between neighbours, and at 450 px/s it is GUARD.t + 0.4 (today's fast lean).
  - `standing still is guard plus the idle bob`: at speed 0, `aF`, `aB`, `lF`, `lB` equal GUARD's.

- [ ] **Step 2: Run** `node --test tests/motion-walk.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement** in the walk block, all scaled by `Math.min(1, |sp| / 60)`: thighs `± sin(walk) * WALK.thigh`; knees `-= WALK.knee * max(0, cos(walk))` front and `max(0, -cos(walk))` back; arms `aF -= sin(walk) * WALK.arm`, `aB += ...`; replace the `> 300` step with `t += 0.4 * smoothstep(clamp((|sp| - 150) / 300, 0, 1))` (`u * u * (3 - 2 * u)`), so the lean starts at 150 px/s and reaches today's 0.4 at 450 px/s. Drop `WALK.lean`. No `Math.random`.

- [ ] **Step 4: Run** `npm run check`. Expected: pass; update any pin that moved, saying why in the test.

- [ ] **Step 5: Commit** `feat: walk with bending knees, swinging arms and a lean that grows with speed`.

### Task 3: Follow-through keyframe

**Files:**
- Modify: `wallpaper/main.js` `MOVES` (122-148), pose expansion (194), `updAttack` (1331-1333)
- Test: `tests/motion-follow.test.mjs`

**Interfaces:**
- Produces: `m.F` on every `MOVES` entry (expanded with `P` like `W`, `A`); staff strikes inherit via `Object.create`. `FOLLOW = 1 / 3`, the share of `rec` spent `A -> F`.

- [ ] **Step 1: Write the failing tests:**
  - `every move has a follow-through pose`: each `MOVES` entry and each `STAFF_MOVE` has `F` whose keys are exactly `KEYS`, and `F` differs from `A` by more than 0.15 rad in at least one key.
  - `the recovery passes through F`: at `st = wind + act + rec * FOLLOW` the pose equals `F` to 1e-6.
  - `the move still ends on time`: state leaves `attack` at the first step after `wind + act + rec`, as before.
  - `the strike window is unchanged`: poses from 0 to `wind + act` equal the old `from->W->A` curve (compute from `W`, `A` with `ease`/`easeOut` in the test).

- [ ] **Step 2: Run** `node --test tests/motion-follow.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement.** Hand-author `F` for all 16 moves: carry the impact on (jab/cross arm past full reach and torso further round; hook arm across; uppercut rising onto toes; kicks with the leg continuing round and torso counter-leaning; knee driving up; throws finishing their rotation). Recovery: `st < T2 + rec * FOLLOW`: `lerpPose(m.A, m.F, easeOut(u))`, else `lerpPose(m.F, GUARD, ease(u))`. Leave `range` (from `fk(m.A)`, `fk(m.W)`) alone.

- [ ] **Step 4: Run** `npm run check`. Expected: pass; update pins that moved with the reason.

- [ ] **Step 5: Commit** `feat: carry every strike through a follow-through pose before guard`.

### Task 4: Lagging head and hands

**Files:**
- Modify: `wallpaper/main.js` `viewJoints()`, `resetLook()`, `stepLook()` from Task 1
- Test: `tests/motion-lag.test.mjs`

**Interfaces:**
- Consumes: `viewJoints`, `resetLook`, `stepLook`, `look` (Task 1).
- Produces: `look.lag = { head, hF, hB }`, each `{x, y, vx, vy}` in local (pre-facing, pre-position) pixels; `LAG = { w: 22, z: 0.45, max: { head: 3, hand: 5 } }`.

- [ ] **Step 1: Write the failing tests:**
  - `a sudden lunge makes the head trail and return`: set `vx` from 0 to 300 on a held fighter; the head's drawn local x lags (opposite to facing) by > 0.5 px within 0.1 s and is back within 0.1 px by 0.6 s.
  - `lag never stretches a limb`: over a 10 s seeded fight, every drawn forearm and neck length in `f.V` equals its `L` length to 1e-6.
  - `lag is clamped`: every `|lag|` <= its `LAG.max`.
  - `a teleport causes no lag`: change `x` by 400 in one step; lag stays 0.
  - `frozen means no lag`, and `bounded at dt = 0.1`, as in Task 1.

- [ ] **Step 2: Run** `node --test tests/motion-lag.test.mjs`. Expected: FAIL.

- [ ] **Step 3: Implement.** Drive each lag spring by minus the acceleration of its parent joint (shoulder for head, elbow for hand) in local pose space plus the body's own velocity change from `vx` and `va` (not position, so teleports are ignored); clamp; in `viewJoints` add the lag to the point, then project it back onto the circle of its segment length round the parent so no limb stretches. `resetLook` zeroes it.

- [ ] **Step 4: Run** `npm run check`. Expected: pass.

- [ ] **Step 5: Commit** `feat: let the head and hands trail the body's movement`.

### Task 5: Re-record the demo and the settings pictures

**Files:**
- Modify: `demo.gif`, `docs/images/*`, `scripts/settings-shots.mjs` (only if a picture needs another seed or start)

- [ ] **Step 1:** `npm install --no-save playwright-core`; confirm Chrome and ffmpeg (install with winget if missing).
- [ ] **Step 2:** `node scripts/record-demo.mjs --scan 1-40`; pick a seed showing all eight styles.
- [ ] **Step 3:** `node scripts/record-demo.mjs --seed <n>`; look at `demo.gif`.
- [ ] **Step 4:** `node scripts/record-settings.mjs`; look at every picture; fix any whose knockout, item drop or move is gone by changing its entry in `scripts/settings-shots.mjs` and re-recording it.
- [ ] **Step 5:** `npm run check`. Expected: pass.
- [ ] **Step 6: Commit** `docs: re-record demo.gif at seed <n> and the settings pictures after the motion changes`.
