# Contributing

Bug reports and small pull requests are welcome. For a new feature, open an
issue first so we can agree on it before you write code.

## Build and test

There is no build. With Node.js 24 or later:

```bash
npm ci
npm run check
```

Open `wallpaper/index.html` in a browser to see your change, or load
`wallpaper/project.json` in Wallpaper Engine to try the settings panel. Keep
anything the wallpaper does not load at runtime out of `wallpaper/`: the
Workshop upload takes the whole folder.

## Pull requests

- Follow the rules in [AGENTS.md](AGENTS.md): no dependencies, no network
  access, and every new setting translated in every language.
- Write commit messages in English, following
  [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat: add a sumo style`, `fix: stop fighters sticking to the ceiling`).
- Say in the pull request how you tested it.
