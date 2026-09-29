# Releasing

Maintainer documentation for publishing `@vitalie/ngx-signal-devtools`. Nothing here is required to
**use** the library — see the [library README](../projects/ngx-signal-devtools/README.md) for that.

## What gets published

Only `dist/vitalie/ngx-signal-devtools` is published. `ng-packagr` produces the Angular Package
Format output and copies `README.md`, `LICENSE` and the `assets` listed in `ng-package.json`
(`CHANGELOG.md`) into it, merged with the metadata of
`projects/ngx-signal-devtools/package.json`.

```bash
npm run pack:lib   # build + npm pack --dry-run, prints the tarball contents
```

Expected contents: `fesm2022/*.mjs` (main entry + lazily loaded overlay chunk), `types/*.d.ts`,
`README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`.

## Published name and scope

The package name is `@vitalie/ngx-signal-devtools`; the npm account publishing it must own that scope
(an npm user or an organisation named `vitalie`).

If the scope ever has to change, rename it consistently and rebuild:

```bash
grep -rl "@vitalie/ngx-signal-devtools" --exclude-dir=node_modules .
# angular.json (project name), tsconfig.json (paths), projects/ngx-signal-devtools/package.json,
# apps/demo/src/app/**, spec files
npm run test:all && npm run build:lib && npm run build:demo
```

## Authentication

Local publishing:

```bash
npm login
npm whoami              # must print the npm account that owns the scope
npm run build:lib
cd dist/vitalie/ngx-signal-devtools && npm publish --access public --provenance
```

`--access public` is required for scoped packages, and `--provenance` attaches a signed
attestation that links the tarball to this repository and workflow (both are also set through
`publishConfig` in `projects/ngx-signal-devtools/package.json`).

CI publishing (preferred) uses **npm Trusted Publishing** with GitHub Actions OIDC:

1. npmjs.com → the package → _Settings_ → _Trusted Publishing_ → add a GitHub Actions publisher for
   the repository `VitalieCondorache/ngx-signal-devtools` and the workflow `release.yml`.
2. That is all: no long-lived token is stored, and provenance is emitted automatically.

If Trusted Publishing is not an option, create a granular _automation_ token with publish rights and
store it as the `NPM_TOKEN` repository secret (`.github/workflows/release.yml` reads it). Never commit
a token, and revoke it when it is no longer needed.

The `Release` workflow needs `Settings → Actions → General → Workflow permissions: Read and write` in
order to push the release commit/tag and create the GitHub Release.

## Cutting a release

```bash
npm run release        # release-it
```

The `.release-it.json` pipeline runs `npm run lint` and `npm run test:all`, bumps the version, updates
`projects/ngx-signal-devtools/CHANGELOG.md` from conventional commits, commits and tags `vX.Y.Z`,
creates the GitHub Release and publishes from `dist/…`.

To rehearse without publishing: Actions → `Release` → _Run workflow_ with `dry-run: true`, or
`npm run build:lib && npx release-it --dry-run`.

## After the release

- Confirm on npmjs.com that the version, README and provenance badge look right.
- `npm view @vitalie/ngx-signal-devtools` — check `dist.tarball`, `peerDependencies` and `keywords`.
- Install the freshly published version in a scratch app (`npm i @vitalie/ngx-signal-devtools@latest`)
  and open the overlay once.
- Keep the repository _About_ description, topics and the demo URL (GitHub Pages) up to date.

## Versioning policy

[Semantic Versioning](https://semver.org/). While the library is `0.x`, a minor release may contain
breaking changes; they are called out in the changelog and in the release notes. Anything that changes
`src/public-api.ts` must be documented in the library README and the changelog, with a migration note
when the change is breaking.

## Demo deployment

The `Demo (GitHub Pages)` workflow builds `apps/demo` with the correct `--base-href` and deploys
`dist/demo/browser`. It is triggered manually until GitHub Pages is enabled
(_Settings → Pages → Source: GitHub Actions_); after the first successful deployment uncomment the
`push` trigger in `.github/workflows/pages.yml` to deploy on every push to `main`.
