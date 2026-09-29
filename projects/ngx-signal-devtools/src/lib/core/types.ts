/*
 * Public type surface of ngx-signal-devtools.
 *
 * Everything a consumer can observe is declared here; the runtime objects are plain data so that
 * snapshots can be serialized (JSON export) without touching Angular internals.
 */

import type { Signal } from '@angular/core';

/** The kind of reactive node a record describes. */
export type SignalKind = 'signal' | 'computed' | 'effect' | 'tracked';

/** Severity of a diagnostic reported by the devtools. */
export type WarningSeverity = 'info' | 'warning' | 'error';

/** Stable identifier of a diagnostic, useful in tests and CI assertions. */
export type WarningCode =
  | 'noop-write'
  | 'read-after-destroy'
  | 'write-after-destroy'
  | 'unowned-signal'
  | 'effect-without-dependencies'
  | 'hot-signal'
  | 'leaked-consumers'
  | 'duplicate-provider'
  | 'event-buffer-overflow';

/** Where a signal was created, derived from the creation stack trace. */
export interface SignalOrigin {
  /** Full path (or URL) of the file that created the signal. */
  readonly file: string;
  /** Compact label such as `todo.store.ts:42`. */
  readonly label: string;
  readonly line: number;
  readonly column: number;
  /** Enclosing function/constructor name when the engine reports it (`new TodosStore`). */
  readonly functionName: string | null;
}

/** Immutable snapshot of a tracked signal. */
export interface SignalRecord {
  readonly id: number;
  readonly kind: SignalKind;
  readonly name: string;
  readonly createdAt: number;
  readonly origin: SignalOrigin | null;
  /** Owning injector scope, when the signal was created inside an injection context. */
  readonly owner: string | null;
  readonly reads: number;
  readonly writes: number;
  /** Writes that were skipped because the equal value was written again. */
  readonly writesWithoutChange: number;
  readonly recomputations: number;
  readonly effectRuns: number;
  readonly lastDurationMs: number | null;
  readonly destroyed: boolean;
  readonly destroyedAt: number | null;
  readonly lastActivityAt: number;
  readonly readAfterDestroy: number;
  readonly writeAfterDestroy: number;
  readonly dependencies: readonly number[];
  readonly consumers: readonly number[];
  /** Live consumers that are not tracked signals (templates, effects, resources). */
  readonly frameworkConsumers: number | null;
  /** How `dependencies` was computed. */
  readonly dependenciesSource: 'declared' | 'discovered' | 'none';
  /** Sampled reactive node version, used to spot writes on tracked (non-instrumented) signals. */
  readonly version: number | null;
  /** Whether the reactive node is currently marked dirty. */
  readonly dirty: boolean | null;
  /** Short, truncated preview of the current value (only when `captureValues` is enabled). */
  readonly valuePreview: string | null;
}

export type SignalEventType =
  | 'created'
  | 'read'
  | 'write'
  | 'noop-write'
  | 'recompute'
  | 'effect-run'
  | 'destroyed'
  | 'warning';

/** A single entry of the activity timeline. */
export interface SignalEvent {
  readonly id: number;
  readonly timestamp: number;
  readonly type: SignalEventType;
  readonly signalId: number;
  readonly name: string;
  readonly message: string | null;
  readonly durationMs: number | null;
  readonly valuePreview: string | null;
}

/** A deduplicated diagnostic. */
export interface SignalWarning {
  readonly id: number;
  readonly timestamp: number;
  readonly severity: WarningSeverity;
  readonly code: WarningCode;
  readonly signalId: number | null;
  readonly name: string | null;
  readonly message: string;
  readonly hint: string | null;
  /** How many times the same diagnostic was produced. */
  readonly count: number;
}

/** Aggregate counters of the devtools session. */
export interface SignalDevtoolsStats {
  readonly startedAt: number;
  readonly tracked: number;
  readonly live: number;
  readonly destroyed: number;
  readonly reads: number;
  readonly writes: number;
  readonly recomputations: number;
  readonly effectRuns: number;
  readonly warnings: number;
  /** Events dropped because the ring buffer was full. */
  readonly droppedEvents: number;
  readonly paused: boolean;
  /** Whether dependency/consumer discovery (private graph) is available. */
  readonly internalsAvailable: boolean;
}

export interface SignalGraphInputNode {
  readonly id: number;
  readonly name: string;
  readonly kind: SignalKind;
  readonly destroyed?: boolean;
}

export interface SignalGraphInputEdge {
  readonly from: number;
  readonly to: number;
}

export interface SignalGraphInput {
  readonly nodes: readonly SignalGraphInputNode[];
  readonly edges: readonly SignalGraphInputEdge[];
}

export interface SignalGraphNode extends SignalGraphInputNode {
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SignalGraphEdge extends SignalGraphInputEdge {
  /** SVG path (`d` attribute) ready to be rendered. */
  readonly path: string;
}

export interface SignalGraph {
  readonly nodes: readonly SignalGraphNode[];
  readonly edges: readonly SignalGraphEdge[];
  readonly width: number;
  readonly height: number;
  readonly maxDepth: number;
}

export interface SignalGraphLayoutOptions {
  readonly columnWidth?: number;
  readonly rowHeight?: number;
  readonly nodeWidth?: number;
  readonly nodeHeight?: number;
  readonly padding?: number;
}

/** Serializable state of the devtools session — handy for bug reports and CI artifacts. */
export interface SignalDevtoolsSnapshot {
  readonly generatedAt: string;
  readonly schemaVersion: 1;
  readonly angularVersion: string | null;
  readonly stats: SignalDevtoolsStats;
  readonly signals: readonly SignalRecord[];
  readonly warnings: readonly SignalWarning[];
  readonly events: readonly SignalEvent[];
  readonly graph: SignalGraph;
}

export interface SignalDevtoolsConfig {
  /**
   * Enables tracking. Defaults to `isDevMode()` on the browser — production builds and SSR keep
   * the library inert (no registry, no bookkeeping, no overlay chunk).
   */
  readonly enabled?: boolean;
  /** Keyboard shortcut that toggles the overlay, or `false` to disable it. Defaults to `ctrl+shift+s`. */
  readonly hotkey?: string | false;
  /** Records an event for every signal read (noisy). Defaults to `false`. */
  readonly captureReads?: boolean;
  /** Captures a truncated preview of the current value. Defaults to `true`. */
  readonly captureValues?: boolean;
  /** Maximum number of tracked signals kept in memory. Defaults to `500`. */
  readonly maxSignals?: number;
  /** Size of the activity ring buffer. Defaults to `200`. */
  readonly maxEvents?: number;
  /** Maximum number of deduplicated diagnostics. Defaults to `100`. */
  readonly maxWarnings?: number;
  /**
   * Minimum delay (ms) between two UI refreshes. Defaults to `16`, which keeps the overlay
   * responsive while making it impossible for notifications to keep change detection alive.
   */
  readonly notifyThrottleMs?: number;
  /** Corner used when the overlay is first opened. Defaults to `bottom-right`. */
  readonly position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Reports writes that do not change the value. Defaults to `true`. */
  readonly warnOnNoopWrite?: boolean;
  /** Reports computeds and effects that track nothing. Defaults to `true`. */
  readonly warnOnNoDependencies?: boolean;
  /** Recomputation count above which a signal is flagged as hot. Defaults to `120`. */
  readonly hotSignalThreshold?: number;
  /** Refreshes sampled graph data while the overlay is open. Defaults to `500` ms. */
  readonly refreshIntervalMs?: number;
  /**
   * Name of the global handle exposed on `window` for console access, or `false` to disable it.
   * Defaults to `ngSignalDevtools`.
   */
  readonly globalKey?: string | false;
}

/** Imperative API returned by `injectSignalDevtools()`. */
export interface SignalDevtoolsHandle {
  readonly open: Signal<boolean>;
  readonly paused: Signal<boolean>;
  readonly records: Signal<readonly SignalRecord[]>;
  readonly events: Signal<readonly SignalEvent[]>;
  readonly warnings: Signal<readonly SignalWarning[]>;
  readonly stats: Signal<SignalDevtoolsStats>;
  /** Rebuilds and returns the signal dependency graph. */
  graph(): SignalGraph;
  show(): Promise<void>;
  hide(): void;
  toggle(): Promise<void>;
  clear(): void;
  pause(): void;
  resume(): void;
  snapshot(): SignalDevtoolsSnapshot;
  /** Triggers a JSON download of `snapshot()` (no-op when `document` is unavailable). */
  download(): void;
}

declare global {
  interface Window {
    /** Populated when `provideSignalDevtools()` is enabled and `globalKey` is not `false`. */
    ngSignalDevtools?: SignalDevtoolsHandle;
  }
}
