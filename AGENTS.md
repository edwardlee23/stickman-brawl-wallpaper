# AGENTS.md

## What this is

Stickman Brawl is a web wallpaper for Wallpaper Engine. A single canvas shows
comic-style stick figures fighting: keyframed poses for martial-arts moves that chain into combos,
comic specials (energy blasts, wall running, wall slams), elemental
magic (fireballs, lightning, ice, shields), ninjutsu (shuriken, shadow clones,
smoke escapes, substitution), and a verlet ragdoll
on knockout. It is plain browser JavaScript with no dependencies and no build
step; Wallpaper Engine loads `wallpaper/index.html`, which loads
`wallpaper/main.js`.

## Commands

```bash
npm ci            # installs nothing today, but keeps CI and local runs alike
npm run check     # syntax check of wallpaper/main.js, then the tests in tests/
```

To see the wallpaper, open `wallpaper/index.html` in a browser
(`?count=8&mode=teams` works there), or load `wallpaper/project.json` in
Wallpaper Engine for the settings panel.

Re-record `demo.gif` after a change people can see in the fight, such as a
new move style. Playwright is a tool for this one script, not a dependency,
so it is installed without saving it; the script also needs Google Chrome
(or `CHROME=<path to a Chromium>`) and ffmpeg:

```bash
npm install --no-save playwright-core
node scripts/record-demo.mjs --scan 1-40   # move styles each seed shows
node scripts/record-demo.mjs --seed <n>    # record that seed to demo.gif
```

Scan first, every time: a change to `main.js` can shift the random sequence,
so a seed that showed every style before may miss some now. Pick a seed whose
scan shows all eight styles, and name it in the commit message. The recorder
draws the canvas in software, so with the same Chrome and ffmpeg a seed gives
the same GIF byte for byte.

The pictures of the settings in the READMEs (`docs/images/`) are listed in
`scripts/settings-shots.mjs` and recorded the same way. Record them again
after a change people can see in a setting, or a change to `main.js` that can
shift the random sequence, and look at each one: a picture whose knockout,
item drop or move no longer shows needs another seed or start in the list.
Then run the check: it replays each GIF in the browser, as the recorder does,
and fails when an event its `shows` field names (the caption's moves, a
flash, the item that drops, a fighter launched by the click) does not happen
in the clip. The check covers only the GIFs: nothing checks a still PNG, so
look at each one against its caption yourself (the score in Show score, the
crown in King).

```bash
node scripts/record-settings.mjs                  # every picture
node scripts/record-settings.mjs items platforms  # only these
node scripts/record-settings.mjs --check          # each GIF shows its caption
```

A new setting people can see gets a picture: an entry in the list (a GIF for
motion, a still PNG otherwise), and the image in all three READMEs, in the
same order. The tests check that the list, `docs/images/` and the READMEs agree.

## Never

- Never add a runtime dependency or a build step: Wallpaper Engine must be
  able to load the files as they are in the repository.
- Never load anything from the network at runtime. Wallpapers run offline.
- Never use a name, character or art from an existing game. The English
  title was changed from "Stick Fight" for that reason.
- Never put a file in `wallpaper/` that the wallpaper does not load at
  runtime. A Workshop upload takes the whole folder; the tests list what may
  be there.
- Never commit secrets, `.env` or `.dev.vars`.

## Rules

- Docs, comments and commit messages are in English. The settings panel keeps
  its Traditional and Simplified Chinese translations, and `README.zh-TW.md` and
  `README.zh-CN.md` are the README in Traditional and Simplified Chinese: a
  change to `README.md` is made to all three, using the panel's `zh-cht` and
  `zh-chs` labels for the settings.
- Every settings label in `project.json` is a `ui_` token with a translation in
  every language under `general.localization` (`en-us`, `zh-cht`, `zh-chs`).
  The tests fail otherwise.
- Every setting in `project.json` must be read in
  `wallpaperPropertyListener.applyUserProperties` in `main.js`.
- Text drawn on the canvas stays language-neutral (`RED WINS!`, `#3 WINS!`),
  so the wallpaper itself needs no translation.
- Commits follow Conventional Commits.

## Merging, releases and dependency updates

- `main` is protected and needs the `check` job of `.github/workflows/ci.yml`.
  Merge by squash only.
- Dependabot checks GitHub Actions (and npm, once a dependency exists) weekly,
  after a 7-day cooldown. Minor and patch updates merge themselves once
  `check` passes; majors wait for a person.
- There is no release process yet. Workshop uploads are done by hand from
  Wallpaper Engine's editor. The Workshop item is
  https://steamcommunity.com/sharedfiles/filedetails/?id=3845187060, and
  `workshopid` in `project.json` points the editor at it, so an upload
  updates that item instead of making a new one. The editor uploads from its
  own copy under `wallpaper_engine\projects\myprojects\`, not from the
  repository, and rewrites that copy's `project.json` in its own key order.
  To publish an update:
  1. Copy the changed files from `wallpaper/` into that copy, keeping the
     copy's `workshopid`.
  2. Upload from the editor.
  3. Copy any field the editor set (tags, rating) back into
     `wallpaper/project.json` by hand, keeping this file's layout.

## Repository layout

| Path | Content |
|---|---|
| `wallpaper/` | Everything Wallpaper Engine loads, and nothing else. |
| `wallpaper/index.html` | Page that holds the canvas and loads `main.js`. |
| `wallpaper/main.js` | The whole wallpaper: settings, skeleton, moves, fighters, rounds, rendering. |
| `wallpaper/project.json` | Wallpaper Engine manifest: title, settings panel, translations. |
| `wallpaper/preview.jpg` | Workshop preview image. Keep it square: the editor crops it to a square on upload. |
| `README.md`, `README.zh-TW.md`, `README.zh-CN.md` | The README in English, Traditional Chinese and Simplified Chinese, kept in step. |
| `demo.gif` | Animated demo shown in the README; not used by Wallpaper Engine. |
| `docs/images/` | Pictures of the settings shown in the READMEs; not used by Wallpaper Engine. |
| `scripts/record-demo.mjs` | Records `demo.gif` (seeded, fixed time step); needs Playwright and ffmpeg. |
| `scripts/record-settings.mjs`, `scripts/settings-shots.mjs` | Record `docs/images/` from the list of pictures, the same way. |
| `tests/` | `node:test` tests: behavior simulations of fights, frames and sound, plus checks that the files agree with each other. |

## Phase status

Playable and feature-complete for a first Workshop release. No open phases.
