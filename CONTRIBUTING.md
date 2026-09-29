# Contributing

Thanks for taking the time to look at this project. Everything here is deliberately small: one
library (`projects/ngx-signal-devtools`), one showcase app (`apps/demo`) and a probe script.

## Setup

```bash
npm install
npm run build:lib   # the demo consumes the library from dist/
npm start           # http://localhost:4200, Ctrl+Shift+S opens the overlay
npm run watch:lib   # in a second terminal while working on the library
```

## Before opening a pull request

```bash
npm run lint
npm run format:check
npm run test:all
npm run build:lib
npm run probe:internals   # after an Angular upgrade
```

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org/); commitlint runs on
  `commit-msg`. Allowed scopes: `lib`, `demo`, `core`, `ui`, `docs`, `ci`, `deps`, `release`,
  `workspace`.
- **Public API** lives in `projects/ngx-signal-devtools/src/public-api.ts`. Anything added there needs
  a test, documentation in the library README and a changelog entry.
- **Private API access** (the `ɵSIGNAL` reactive graph) must stay behind
  `core/internals.ts`, be feature-detected, and never throw when the shape changes. Add a case to
  `internals.spec.ts` when touching it.
- **Tests** accompany behaviour changes; the registry and the layout algorithm must stay at high
  coverage because they carry the logic.
- **Zero production cost** is a feature: never import the UI chunk statically and never allocate when
  the devtools are disabled.
- Prettier formats everything (`printWidth: 100`, single quotes).

## Reporting a bug

Use the bug report template and attach `ngSignalDevtools.snapshot()` — it contains the tracked
signals, diagnostics, events and the graph, without your application source.
