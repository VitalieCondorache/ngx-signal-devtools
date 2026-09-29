# @vitalie27dev/ngx-signal-devtools

> Dev-only overlay for Angular signals: **dependency graph**, **recomputation counters** and
> **leak detection** — with zero production cost.

[![npm version](https://img.shields.io/npm/v/@vitalie27dev/ngx-signal-devtools.svg?color=CB3837)](https://www.npmjs.com/package/@vitalie27dev/ngx-signal-devtools)
[![npm downloads](https://img.shields.io/npm/dm/@vitalie27dev/ngx-signal-devtools.svg)](https://www.npmjs.com/package/@vitalie27dev/ngx-signal-devtools)
[![CI](https://github.com/VitalieCondorache/ngx-signal-devtools/actions/workflows/ci.yml/badge.svg)](https://github.com/VitalieCondorache/ngx-signal-devtools/actions/workflows/ci.yml)
[![demo](https://img.shields.io/badge/demo-live-3fb950.svg)](https://vitaliecondorache.github.io/ngx-signal-devtools/)
[![license](https://img.shields.io/npm/l/@vitalie27dev/ngx-signal-devtools.svg)](./LICENSE)

[**live demo**](https://vitaliecondorache.github.io/ngx-signal-devtools/) &nbsp;·&nbsp;
[**GitHub repository**](https://github.com/VitalieCondorache/ngx-signal-devtools) &nbsp;·&nbsp;
[**showcase app**](https://github.com/VitalieCondorache/ngx-signal-devtools/tree/main/apps/demo)
&nbsp;·&nbsp; [**CHANGELOG**](./CHANGELOG.md) &nbsp;·&nbsp;
[**issues**](https://github.com/VitalieCondorache/ngx-signal-devtools/issues)

Angular's signal graph is invisible while you develop: you cannot see which computed recomputes 400
times per second, which effect tracks nothing, or which component keeps writing a signal after it has
been destroyed. This library makes that graph **visible inside the running application** and tells you
when something looks like a bug.

![The overlay](https://raw.githubusercontent.com/VitalieCondorache/ngx-signal-devtools/main/docs/images/overlay-preview.png)

```
+-- ngx-signal-devtools ------------- 14 tracked  12 live  1238 computed  9410 reads  3 warnings --+
| Signals  Events  Warnings  Graph                                                               |
| name            kind      where                reads  writes  recomp.  deps  consumers          |
| todos           signal    todos.store.ts:31      412      37         0     0      1 +2           |
| visibleTodos    computed  todos.store.ts:41       96       0       118     2        1           |
| expensiveScore  computed  todos.store.ts:78        4       0         4     1        0           |
| widgetTicks     signal    leaky-widget.ts:48      61      61         0     0        1           |
+-----------------------------------------------------------------------------------------------+
```

## Features

- **Dependency graph** — real producer/consumer edges read from the private reactive graph through
  `ɵSIGNAL`, laid out as SVG without a charting dependency.
- **Recomputation counters** — how often each `computed` ran and how long it took.
- **Leak detection** — signals are tied to the `DestroyRef` that owns them; reads and writes after
  destruction are reported (`read-after-destroy`, `write-after-destroy`, `leaked-consumers`).
- **Diagnostics with hints** — no-op writes, effects that track nothing, hot computeds, signals
  without an owner, deduplicated with counters instead of a log flood.
- **Zero production cost** — `provideSignalDevtools()` defaults to `isDevMode()`; when disabled the
  instrumented helpers delegate to `signal()`/`computed()`/`effect()` and the overlay is a lazy chunk
  that is never requested.
- **JSON export** — `snapshot()` returns a serializable dump (signals, warnings, events, graph) for
  bug reports or CI artifacts.
- **Zoneless and standalone first** — no NgModules, no `zone.js`, no runtime dependency other than
  `tslib`.

## Installation

```bash
npm install --save-dev @vitalie27dev/ngx-signal-devtools
```

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideSignalDevtools } from '@vitalie27dev/ngx-signal-devtools';

export const appConfig: ApplicationConfig = {
  providers: [
    provideSignalDevtools(), // enabled automatically in development builds
  ],
};
```

Open the overlay with `Ctrl + Shift + S`, from the console (`ngSignalDevtools.toggle()`), or from your
own button:

```ts
@Component({
  template: `<button type="button" (click)="devtools.toggle()">Open signal devtools</button>`,
})
export class DebugBar {
  protected readonly devtools = injectSignalDevtools();
}
```

## Quick start

```ts
import { Component } from '@angular/core';
import { devComputed, devEffect, devSignal } from '@vitalie27dev/ngx-signal-devtools';

@Component({
  selector: 'app-cart',
  template: `
    <p>{{ summary() }}</p>
    <button type="button" (click)="add()">Add item</button>
  `,
})
export class CartComponent {
  private readonly items = devSignal<string[]>([], { name: 'items' });

  protected readonly summary = devComputed(() => `${this.items().length} items`, {
    name: 'summary',
  });

  constructor() {
    devEffect(() => console.debug('cart changed', this.items()), { name: 'logCart' });
  }

  protected add(): void {
    this.items.update((items) => [...items, `item-${items.length + 1}`]);
  }
}
```

They are drop-in replacements for `signal()`, `computed()` and `effect()`: same return types, same
reactive behaviour. When the devtools are disabled they call the Angular primitives directly.

## API

| Export                                                                       | Purpose                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provideSignalDevtools(config?)`                                             | Installs the registry and the overlay. Call once, at bootstrap.                                                                                                                                                                                                  |
| `injectSignalDevtools()`                                                     | Handle with reactive counters and commands: `toggle()`, `show()`, `hide()`, `paused`, `records`, `stats`, `warnings`, `events`, `graph()`, `snapshot()`, `download()`, `pause()`, `resume()`, `clear()`. Always injectable, even when the devtools are disabled. |
| `devSignal(initial, options?)`                                               | `signal()` with instrumentation: reads, writes, no-op writes, value preview.                                                                                                                                                                                     |
| `devComputed(fn, options?)`                                                  | `computed()` with instrumentation: recomputation count, duration, dependency discovery.                                                                                                                                                                          |
| `devEffect(fn, options?)`                                                    | `effect()` with instrumentation: run count, duration, “tracks nothing” detection.                                                                                                                                                                                |
| `trackSignal(signal, options?)`                                              | Observes a signal you already have. Identity is preserved; writes are detected by sampling the reactive node version.                                                                                                                                            |
| `layoutSignalGraph(input, options?)`                                         | Pure layered layout (`depth`, `x`, `y`, SVG path per edge) — reuse it in your own UI.                                                                                                                                                                            |
| `parseSignalOrigin(stack)`, `ownerFromOrigin(origin)`, `previewValue(value)` | Helpers used for origin detection and value previews; exported because they are handy on their own.                                                                                                                                                              |
| `isInternalsAvailable()`                                                     | `true` when the private reactive graph can be read for this Angular version.                                                                                                                                                                                     |

### Configuration

```ts
provideSignalDevtools({
  enabled: !environment.production, // default: isDevMode() on the browser
  hotkey: 'ctrl+shift+s', // default; `false` disables the shortcut
  position: 'bottom-right', // bottom-left | top-right | top-left
  captureReads: false, // record an event per read (noisy)
  captureValues: true, // truncated value previews
  maxSignals: 500, // oldest destroyed records are evicted first
  maxEvents: 200, // activity ring buffer
  maxWarnings: 100,
  warnOnNoopWrite: true,
  warnOnNoDependencies: true,
  hotSignalThreshold: 120, // recomputations before a computed is flagged
  refreshIntervalMs: 500, // resampling while the overlay is open
  notifyThrottleMs: 16, // minimum delay between two UI refreshes (0 notifies per microtask)
  globalKey: 'ngSignalDevtools', // console handle; `false` to disable
});
```

```ts
// app.config.server.ts — keep SSR inert
providers: [provideSignalDevtools({ enabled: false })];
```

### Diagnostics

| Code                          | Severity | What it means                                                                    |
| ----------------------------- | -------- | -------------------------------------------------------------------------------- |
| `noop-write`                  | info     | A signal was written with an equal value; consumers were not notified.           |
| `write-after-destroy`         | error    | A destroyed signal keeps being written — usually a leaked interval/subscription. |
| `read-after-destroy`          | error    | Something still reads a destroyed signal.                                        |
| `leaked-consumers`            | error    | A destroyed signal still has live consumers (template, effect, resource).        |
| `effect-without-dependencies` | warning  | The effect read no instrumented signal, so it will never run again.              |
| `hot-signal`                  | info     | A computed exceeded `hotSignalThreshold` recomputations.                         |
| `unowned-signal`              | info     | The signal was created outside an injection context, so its lifetime is unknown. |
| `duplicate-provider`          | warning  | `provideSignalDevtools()` was called more than once.                             |
| `event-buffer-overflow`       | info     | The activity buffer dropped events (raise `maxEvents`).                          |

## The overlay

| Tab          | Content                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Signals**  | Every tracked signal: kind, creation site, reads, writes (incl. no-op), recomputations, dependency and consumer counts. Click a row for the detail footer (owner, file, dependencies, consumers, timings, post-destroy usage). |
| **Events**   | Ring buffer of activity with relative timestamps and durations; writes detected by sampling are labelled.                                                                                                                      |
| **Warnings** | Deduplicated diagnostics with severity, occurrence count, message and a hint about the likely fix.                                                                                                                             |
| **Graph**    | Layered SVG: producers left, consumers right, destroyed nodes dimmed, click to cross-select with the table.                                                                                                                    |

Header actions: freeze/resume the panel, collapse, clear, export JSON, close. The panel is draggable by
its header, closes with `Esc`, and never participates in your application's change detection — it
refreshes itself.

## Zero production cost

Measured on the showcase app in `apps/demo` (`ng build demo`, Angular 22.2, production):

```
Initial chunk files | Names                        |  Raw size | Estimated transfer size
chunk-ENKM75QW.js   | -                            | 145.90 kB |  43.63 kB
main-KFJ3X235.js    | main                         | 104.78 kB |  27.50 kB
                    | Initial total                | 250.68 kB |  71.13 kB

Lazy chunk files    | Names                                                    | Raw size
chunk-CA5URME4.js   | vitalie-ngx-signal-devtools-overlay-component            |  18.13 kB
```

The overlay (component, template, styles, graph renderer) is a separate chunk that is only downloaded
the first time the devtools are opened. Registry and instrumentation are dev-only: in a production
build `provideSignalDevtools()` installs nothing, and every `devSignal()`/`devComputed()` falls back to
the plain Angular primitive after a single `null` check.

## How it works

1. `provideSignalDevtools()` creates a registry (plain TypeScript, no Angular dependency) and installs
   it in a module-level slot, so the instrumented helpers can find it from constructors and field
   initializers without DI.
2. `devSignal`/`devComputed`/`devEffect` wrap the Angular primitives, keep the original return type,
   count activity and re-brand the wrapper with `ɵSIGNAL` so Angular internals keep working.
3. Dependency edges come from the private reactive graph (`producers`/`consumers` linked lists in
   Angular 20+, `producerNode`/`consumerNode` arrays in 17-19), read defensively through `ɵSIGNAL`.
   When the shape is unknown, the devtools degrade to declared/manual dependencies instead of failing.
4. Lifetime comes from `DestroyRef`: a signal created in an injection context is marked destroyed with
   its owner, and later reads/writes are reported.
5. Notifications are coalesced per microtask, so a hot loop cannot thrash the overlay.

`npm run probe:internals` prints the reactive node shape of the installed Angular version — run it
after upgrading Angular to see whether the adapter still has what it needs.

## Compatibility

| Angular        | Status                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| 22.x           | Supported and tested (`peerDependencies: ^22.0.0`)                                                       |
| 21.x           | Expected to work (no 22-only API is used), not covered by CI yet — widen the peer range after validating |
| 20.x and older | Not supported: `devSignal`/`devComputed` rely on 20+ signal internals for graph discovery                |

Works with zoneless and zone-based change detection, standalone components and `OnPush`. Signal
primitives the library does not instrument (`input()`, `model()`, `resource()`, `linkedSignal()`) are
visible through `trackSignal()`.

## Limitations

- The dependency graph depends on a **private** API. It is feature-detected, never required for the
  tool to work, and covered by tests that pin the shape.
- `trackSignal()` cannot intercept reads and samples writes from the node version: treat its write
  counts as approximate and use `devSignal()` when exact numbers matter.
- Effect dependencies are reported as “tracks something / tracks nothing”, because the effect node is
  not reachable through a public handle.
- Module-level registry slot: for SSR, keep `enabled: false` on the server (the default) so nothing is
  shared between requests.
- The overlay is a debug tool: it renders outside your application's view tree, uses
  `ViewEncapsulation.None` with `.sdt-`-prefixed rules and `z-index: 2147483000`.

## Roadmap

- [ ] Secondary entry point `@vitalie27dev/ngx-signal-devtools/testing` with `expectNoSignalLeaks()`.
- [ ] Custom reporters (`console`, `benchmark`, CI artifacts).
- [ ] CI matrix that validates and widens the Angular peer range (21.x).
- [ ] Record/replay of signal activity to diff two interactions.
- [ ] Timing waterfall per recomputation.

## Development

```bash
npm run build:lib      # build the library (ng-packagr)
npm run watch:lib      # rebuild on change, for the demo app
npm run test:lib       # vitest + coverage
npm run start          # demo/showcase app on http://localhost:4200
npm run lint
npm run probe:internals
```

## License

MIT — see [LICENSE](./LICENSE).
