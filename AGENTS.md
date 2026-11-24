# AGENTS.md

## What this is

Stickman Brawl is a web wallpaper for Wallpaper Engine. A single canvas shows
comic-style stick figures fighting: keyframed poses for martial-arts moves,
comic specials (energy blasts, wall running, wall slams), and a verlet ragdoll
on knockout. It is plain browser JavaScript with no dependencies and no build
step; Wallpaper Engine loads `index.html`, which loads `main.js`.

## Commands

```bash
npm ci            # installs nothing today, but keeps CI and local runs alike
npm run check     # syntax check of main.js, then the tests in tests/
```

To see the wallpaper, open `index.html` in a browser (`?count=8&mode=teams`
works there), or load `project.json` in Wallpaper Engine for the settings panel.

## Never

- Never add a runtime dependency or a build step: Wallpaper Engine must be
  able to load the files as they are in the repository.
- Never load anything from the network at runtime. Wallpapers run offline.
- Never use a name, character or art from an existing game. The English
  title was changed from "Stick Fight" for that reason.
- Never commit secrets, `.env` or `.dev.vars`.

## Rules

- Docs, comments and commit messages are in English. The settings panel keeps
  its Traditional and Simplified Chinese translations.
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
  Wallpaper Engine's editor.

## Repository layout

| Path | Content |
|---|---|
| `index.html` | Page that holds the canvas and loads `main.js`. |
| `main.js` | The whole wallpaper: settings, skeleton, moves, fighters, rounds, rendering. |
| `project.json` | Wallpaper Engine manifest: title, settings panel, translations. |
| `preview.jpg` | Workshop preview image. |
| `demo.gif` | Animated demo shown in the README; not used by Wallpaper Engine. |
| `tests/` | `node:test` checks that the files agree with each other. |

## Phase status

Playable and feature-complete for a first Workshop release. No open phases.
