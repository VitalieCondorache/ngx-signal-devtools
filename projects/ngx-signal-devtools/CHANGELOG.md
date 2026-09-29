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
