# Sound effects design

Issue: #22. Size: a small change.

## Intent

The wallpaper is silent. Short, comic-style sound effects timed to what
happens on screen make hits read better, for people who turn them on. A
wallpaper plays all day, so the sounds must stay short and not tiring, and
must be off unless chosen.

## Goals, non-goals, anti-goals

- Goals: sounds for hits (light and heavy), blocks, whiffs, ground impacts,
  wall slams, knockouts, energy-blast charge and release, wall-run steps and
  the round-end banner; an on/off setting and a volume setting.
- Non-goals: music, voices, audio files.
- Anti-goals: a desktop that turns noisy after an update (so the default is
  off); a wall of noise when many fighters hit at once.

## Constraints

- No runtime dependency, no build step, no network load (AGENTS.md).
- `wallpaper/` keeps its current file list; nothing is added there.
- Every new setting has `ui_` labels in `en-us`, `zh-cht` and `zh-chs`, and
  is read in `wallpaperPropertyListener.applyUserProperties`.

## Approaches

1. **Synthesize with the Web Audio API** (chosen). Noise bursts and
   oscillators make the snap, thud, swoosh and boom. No asset files, the
   folder list is unchanged, and strength can shape each sound so repeats
   vary. Trade-off: the sounds are electronic and cartoonish rather than
   realistic.
2. **Ship small CC0 `.ogg` files.** More realistic, but needs cleanly
   licensed assets, adds binaries to the repo, changes the tested file list,
   and fixed samples get repetitive.

The owner picked approach 1.

## Design

- A `// ---------- Sound ----------` section in `main.js` with
  `sfx(kind, x, strength)`. The `AudioContext` is created lazily, on the
  first sound while sound is on. All sounds go through one master gain set
  from the volume setting.
- Hooks: `impact` (hit, light or heavy by `big`), block, whiff, `quake`
  (ground boom), wall `crack` (crash), `makeRag` (knockout thud), blast
  charge and release, wall-run steps, and the round-end sting (three short
  notes) where `winnerText` is set.
- Hooks added with the magic and ninjutsu styles and the items, after this
  spec was first written, so every kind in `SFX` in `main.js` is listed:
  - `charge` and `fire` also play for a fireball's wind-up and throw, and
    `fire` for each shot of an energy-blast volley.
  - `zap`: a lightning bolt striking the ground.
  - `freeze`: an ice shard thrown, a frozen fighter breaking free, and the
    ice shattering when a frozen fighter is hit.
  - `toss`: a shuriken fan and a boomerang thrown.
  - `poof`: the smoke of shadow clones appearing and vanishing, a smoke
    escape, and a substitution.
  - `shield`: a magic shield going up, a shield stopping a hit or the rest
    of a shuriken fan, and an item picked up.
- At most 6 sounds play at once; the same kind plays at most once per 40 ms.
- Settings: `soundeffects` (bool, default off; "Sound effects" / 音效 /
  音效) and `soundvolume` (slider 0–100, default 50; "Volume (%)" / 音效音量 (%)
  / 音效音量 (%), with "(%)" like the panel's other sliders, shown only while
  sound is on). For a plain browser, `?sound=1&volume=50`, clamped like the
  other query values.
- A limiter (`DynamicsCompressorNode`) sits between the master gain and the
  speakers, so several loud sounds at once do not clip.

### Calls made by Claude

- Stereo pan follows the fighter's x position on screen.
- The audio context is suspended while the wallpaper is paused or sound is
  off, so it does not process silence for hours, and resumed otherwise.
- In a plain browser, the first click resumes the context, since browsers
  block audio until a user gesture. Wallpaper Engine does not need it.

## Left to the builder

- The exact parameters of each sound (frequencies, lengths), tuned by ear.
- How the tests stub `AudioContext` in node.
