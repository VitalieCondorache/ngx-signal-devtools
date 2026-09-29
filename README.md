# ngx-signal-devtools — monorepo

Workspace for the **[@vitalie/ngx-signal-devtools](projects/ngx-signal-devtools)** library: a dev-only
overlay that shows the Angular signal graph, recomputation counters and leaked signals, with zero
production cost.

| Path                           | What it is                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `projects/ngx-signal-devtools` | The published library (`ng-packagr`, single entry point + lazy UI chunk).                               |
| `apps/demo`                    | Showcase app used as documentation and manual test bench (instrumented store, leak demo, no-op writes). |
| `tools/probe-internals.mjs`    | Canary that prints the private reactive node shape of the installed Angular version.                    |

## Getting started

```bash
npm install
npm run build:lib      # the demo imports the library from dist/, so build it first
npm run start          # http://localhost:4200 — press Ctrl+Shift+S for the overlay
```

While working on the library, run a second terminal with `npm run watch:lib` and the demo reloads with
your changes.

## Scripts

| Script                    | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `npm run build:lib`       | Production build of the library into `dist/vitalie/ngx-signal-devtools`. |
| `npm run watch:lib`       | Development build in watch mode.                                         |
| `npm run test:lib`        | Vitest + coverage for the library.                                       |
| `npm run test:demo`       | Smoke tests for the showcase app.                                        |
| `npm run test:all`        | Both suites (what CI runs).                                              |
| `npm start`               | Serve the demo app.                                                      |
| `npm run build:demo`      | Production build of the demo (shows the lazy overlay chunk).             |
| `npm run lint`            | ESLint (angular-eslint).                                                 |
| `npm run format`          | Prettier over the workspace.                                             |
| `npm run probe:internals` | Verify the private `ɵSIGNAL` contract for the installed Angular version. |
| `npm run pack:lib`        | Build + `npm pack` the library, then print the tarball contents.         |
| `npm run release`         | Build, bump, changelog, tag and publish via release-it.                  |

## Quality gates

- ESLint (angular-eslint, typescript-eslint) + Prettier.
- Conventional Commits enforced by commitlint on `commit-msg`.
- Vitest with coverage thresholds for the library.
- CI: lint → library tests with coverage → library build → demo build, on every push and PR.
- Release: `release-it` + GitHub Actions with npm provenance (no long-lived publish token).

## Before publishing (checklist)

1. **npm scope** — the library is published as `@vitalie/ngx-signal-devtools`. If your npm user/org is
   not `vitalie`, rename it everywhere:
   `grep -rl "@vitalie/ngx-signal-devtools" --exclude-dir=node_modules .` (files: `angular.json`,
   `tsconfig.json`, `projects/ngx-signal-devtools/package.json`, `apps/demo/src/app/**`, specs).
2. **npm login** — the local `~/.npmrc` token currently returns `401 Unauthorized`. Run `npm login`
   and make sure the scope exists on npm (`npm whoami` must answer).
3. **Trusted publishing** — configure npm Trusted Publishing for this repository (Settings → Actions →
   Read and write permissions is only needed for the release commit/tag), or add `NPM_TOKEN` as a
   repository secret.
4. **GitHub Pages** — enable _Settings → Pages → Source: GitHub Actions_, then run the
   `Demo (GitHub Pages)` workflow to publish `https://vitaliecondorache.github.io/ngx-signal-devtools/`
   and add that URL to the repository's _About → Website_.
5. **Visuals** — add a screenshot/GIF of the overlay to `projects/ngx-signal-devtools/README.md` (the
   npm page benefits the most from it) and set the repo social preview (1280×640).
6. **Optional** — re-add a `funding` field in `projects/ngx-signal-devtools/package.json` once GitHub
   Sponsors is enabled.

## License

MIT — see [LICENSE](./LICENSE).
