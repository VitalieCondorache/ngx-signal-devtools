# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1](https://github.com/VitalieCondorache/ngx-signal-devtools/compare/v0.1.0...v0.1.1) (2026-09-29)

### Bug fixes

- **demo:** keep the devtools enabled in the deployed showcase build ([68450fe](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/68450fe63c9700e45071aabd54eaa1a1c5280e3c))
- **demo:** write the same array instance to actually demo a no-op write ([913ba5f](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/913ba5fca995b1712d6d02e1c46c572dd328c14f))
- **lib:** stop notifying on reads so change detection can never spin ([403e686](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/403e686d3ec86d2f0f1f45218eeca5bec478c513))

### Documentation

- **workspace:** add png artwork for npm and the social preview ([30d600c](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/30d600cbfaa3fe4372ec301feac27b65559796b9))
- **workspace:** add readme artwork, npm links and issue links ([980bbe3](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/980bbe301b931f471761b494c443b4eb4fe14197))
- **workspace:** document the automatic pages deployment ([23c08fb](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/23c08fb96ed28ce7d2f20cc7db7cddfcb7b6d808))
- **workspace:** link the live demo from both readmes ([3d149f8](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/3d149f82a1ac86afacc6bef51507fb8052c2da7f))
- **workspace:** polish readme artwork spacing and overlay header ([cf8bad1](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/cf8bad1ae7f2ba775f2ed9b9c850e5f2db250f83))

### Tests

- **workspace:** boot the built demo in headless chromium ([7336d60](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/7336d6079a3c38533b0991c638e13d958beda248))

### CI

- **workspace:** deploy the demo on every push to main ([4f891fa](https://github.com/VitalieCondorache/ngx-signal-devtools/commit/4f891fad6804f7d4a3c78be81e26c9585ae5e8cc))

# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-29

### Added

- `provideSignalDevtools(config)` / `injectSignalDevtools()` with a dev-only registry, console handle
  and configurable hotkey (`ctrl+shift+s` by default).
- Instrumented primitives: `devSignal`, `devComputed`, `devEffect` and `trackSignal`.
- Read/write/no-op-write counters, recomputation counts and durations, truncated value previews.
- Dependency and live-consumer discovery through the private reactive graph (`ɵSIGNAL`), with a
  graceful fallback when the shape is unavailable.
- Diagnostics: `noop-write`, `write-after-destroy`, `read-after-destroy`, `leaked-consumers`,
  `effect-without-dependencies`, `hot-signal`, `unowned-signal`, `duplicate-provider`,
  `event-buffer-overflow`.
- Draggable overlay with Signals / Events / Warnings / Graph tabs, loaded as a lazy chunk.
- `layoutSignalGraph()` layered SVG layout for custom UIs, plus `snapshot()`/`download()` JSON export.
- Showcase app with an instrumented store, leak demo and no-op write demo.

[0.1.0]: https://github.com/VitalieCondorache/ngx-signal-devtools/releases/tag/v0.1.0
