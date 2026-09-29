import {
  getReactiveNode,
  isInternalsAvailable,
  isLiveConsumer,
  readConsumerNodes,
  readProducerNodes,
  type ReactiveNodeLike,
} from './internals';
import { layoutSignalGraph } from './graph-layout';
import { previewValue } from './origin';
import type {
  SignalDevtoolsStats,
  SignalEvent,
  SignalEventType,
  SignalGraph,
  SignalGraphInputEdge,
  SignalKind,
  SignalOrigin,
  SignalRecord,
  SignalWarning,
  WarningCode,
  WarningSeverity,
} from './types';

export interface NormalizedConfig {
  readonly enabled: boolean;
  readonly captureReads: boolean;
  readonly captureValues: boolean;
  readonly maxSignals: number;
  readonly maxEvents: number;
  readonly maxWarnings: number;
  readonly warnOnNoopWrite: boolean;
  readonly warnOnNoDependencies: boolean;
  readonly hotSignalThreshold: number;
}

export interface CreateRecordInit {
  readonly kind: SignalKind;
  readonly name?: string | null;
  readonly origin?: SignalOrigin | null;
  readonly owner?: string | null;
  readonly declaredDependencies?: readonly number[] | null;
  readonly value?: unknown;
}

/** Mutable bookkeeping for one tracked signal. Never exposed directly to consumers. */
export interface TrackedSignal {
  id: number;
  kind: SignalKind;
  name: string;
  createdAt: number;
  origin: SignalOrigin | null;
  owner: string | null;
  reads: number;
  writes: number;
  writesWithoutChange: number;
  recomputations: number;
  effectRuns: number;
  lastDurationMs: number | null;
  destroyed: boolean;
  destroyedAt: number | null;
  lastActivityAt: number;
  readAfterDestroy: number;
  writeAfterDestroy: number;
  dependencies: number[];
  consumers: number[];
  declaredDependencies: readonly number[] | null;
  frameworkConsumers: number | null;
  dependenciesSource: 'declared' | 'discovered' | 'none';
  version: number | null;
  dirty: boolean | null;
  valuePreview: string | null;
  node: ReactiveNodeLike | null;
  /** Last version observed by sampling (observe-only signals). */
  sampledVersion: number | null;
}

/** Internally the diagnostics are mutable: repeats increment `count` instead of adding a row. */
interface MutableWarning {
  id: number;
  timestamp: number;
  severity: WarningSeverity;
  code: WarningCode;
  signalId: number | null;
  name: string | null;
  message: string;
  hint: string | null;
  count: number;
}

let nextRecordId = 1;

/**
 * Framework-agnostic store of everything the devtools knows. Keeping it free of Angular APIs makes
 * it trivially testable (and reusable by custom UIs or reporters).
 */
export class SignalDevtoolsRegistry {
  private readonly recordsStore = new Map<number, TrackedSignal>();
  private readonly nodeIndex = new WeakMap<object, TrackedSignal>();
  private readonly eventsStore: SignalEvent[] = [];
  private readonly warningsStore: MutableWarning[] = [];
  private readonly warningIndex = new Map<string, MutableWarning>();
  private readonly listeners = new Set<() => void>();
  private readonly startedAt = Date.now();
  private eventsTotal = 0;
  private droppedEvents = 0;
  private warningsTotal = 0;
  private pausedState = false;
  private readsDuringEffectRun = 0;
  private notifyScheduled = false;

  constructor(readonly config: NormalizedConfig) {}

  // ---------------------------------------------------------------- creation

  create(init: CreateRecordInit): TrackedSignal {
    const now = Date.now();
    const id = nextRecordId++;
    const record: TrackedSignal = {
      id,
      kind: init.kind,
      name: init.name?.trim() || `${init.kind}#${id}`,
      createdAt: now,
      origin: init.origin ?? null,
      owner: init.owner ?? null,
      reads: 0,
      writes: 0,
      writesWithoutChange: 0,
      recomputations: 0,
      effectRuns: 0,
      lastDurationMs: null,
      destroyed: false,
      destroyedAt: null,
      lastActivityAt: now,
      readAfterDestroy: 0,
      writeAfterDestroy: 0,
      dependencies: init.declaredDependencies ? [...init.declaredDependencies] : [],
      consumers: [],
      declaredDependencies: init.declaredDependencies ?? null,
      frameworkConsumers: null,
      dependenciesSource: init.declaredDependencies?.length ? 'declared' : 'none',
      version: null,
      dirty: null,
      valuePreview: this.config.captureValues ? previewValue(init.value) : null,
      node: null,
      sampledVersion: null,
    };

    this.recordsStore.set(record.id, record);
    this.pushEvent('created', record);
    this.evictIfNeeded();
    this.notify();
    return record;
  }

  /** Associates the reactive node so dependencies, consumers and writes can be discovered. */
  linkNode(record: TrackedSignal, source: unknown): void {
    const node = getReactiveNode(source);
    if (!node) {
      return;
    }
    record.node = node;
    record.version = typeof node.version === 'number' ? node.version : null;
    record.dirty = typeof node.dirty === 'boolean' ? node.dirty : null;
    record.sampledVersion = record.kind === 'tracked' ? record.version : null;
    try {
      this.nodeIndex.set(node as object, record);
    } catch {
      // WeakMap keys must be objects; ignore exotic values.
    }
  }

  // ---------------------------------------------------------------- recording

  noteRead(record: TrackedSignal): void {
    record.reads++;
    record.lastActivityAt = Date.now();
    this.readsDuringEffectRun++;

    if (record.destroyed) {
      record.readAfterDestroy++;
      this.warn('read-after-destroy', {
        severity: 'error',
        record,
        message: `"${record.name}" is still read after its owner was destroyed.`,
        hint: 'Move it into the component/store that owns the lifecycle, or stop the timer reading it.',
      });
      return;
    }

    if (this.config.captureReads) {
      this.pushEvent('read', record);
    }
    this.notify();
  }

  noteWrite(record: TrackedSignal, changed: boolean, value?: unknown): void {
    record.lastActivityAt = Date.now();
    record.writes++;
    if (this.config.captureValues) {
      record.valuePreview = previewValue(value);
    }

    if (!changed) {
      record.writesWithoutChange++;
      if (this.config.warnOnNoopWrite) {
        this.warn('noop-write', {
          severity: 'info',
          record,
          message: `"${record.name}" was written with an equal value, so consumers are not notified.`,
          hint: 'Write a new object/array instance (or a custom `equal` function) when the change must be visible.',
        });
      }
      this.pushEvent('noop-write', record, { valuePreview: record.valuePreview });
      this.notify();
      return;
    }

    if (record.destroyed) {
      record.writeAfterDestroy++;
      this.warn('write-after-destroy', {
        severity: 'error',
        record,
        message: `"${record.name}" was written after its owner was destroyed.`,
        hint: 'Classic leaked interval/subscription signature: clean it up in onCleanup() or DestroyRef.onDestroy().',
      });
    }

    this.pushEvent('write', record, { valuePreview: record.valuePreview });
    this.notify();
  }

  noteRecompute(record: TrackedSignal, durationMs: number, value?: unknown): void {
    record.recomputations++;
    record.lastDurationMs = durationMs;
    record.lastActivityAt = Date.now();
    if (this.config.captureValues) {
      record.valuePreview = previewValue(value);
    }

    if (record.recomputations === this.config.hotSignalThreshold) {
      this.warn('hot-signal', {
        severity: 'info',
        record,
        message: `"${record.name}" recomputed ${this.config.hotSignalThreshold} times.`,
        hint: 'Check whether a cheap computed is being recomputed for every keystroke or animation frame.',
      });
    }

    this.pushEvent('recompute', record, { durationMs, valuePreview: record.valuePreview });
    this.notify();
  }

  noteEffectRun(record: TrackedSignal, durationMs: number, dependencyCount: number | null): void {
    record.effectRuns++;
    record.lastDurationMs = durationMs;
    record.lastActivityAt = Date.now();

    if (this.config.warnOnNoDependencies && dependencyCount === 0) {
      this.warn('effect-without-dependencies', {
        severity: 'warning',
        record,
        message: `"${record.name}" tracked no instrumented signal, so it will never re-run.`,
        hint: 'Read a devSignal/devComputed/trackSignal inside the effect, or drop the effect entirely.',
      });
    }

    this.pushEvent('effect-run', record, { durationMs });
    this.notify();
  }

  /** Instrumented signal reads since `startEffectRunCapture()`; used for effect diagnostics. */
  get effectRunReads(): number {
    return this.readsDuringEffectRun;
  }

  startEffectRunCapture(): void {
    this.readsDuringEffectRun = 0;
  }

  // ---------------------------------------------------------------- lifecycle

  destroy(record: TrackedSignal): void {
    if (record.destroyed) {
      return;
    }
    record.destroyed = true;
    record.destroyedAt = Date.now();
    this.pushEvent('destroyed', record);
    this.notify();
  }

  pause(): void {
    this.pausedState = true;
    this.notify();
  }

  resume(): void {
    this.pausedState = false;
    this.notify();
  }

  get paused(): boolean {
    return this.pausedState;
  }

  // ---------------------------------------------------------------- diagnostics

  warn(
    code: WarningCode,
    init: {
      severity?: WarningSeverity;
      record?: TrackedSignal | null;
      message: string;
      hint?: string | null;
    },
  ): void {
    const signalId = init.record?.id ?? null;
    const key = `${code}|${signalId ?? 'global'}`;
    const existing = this.warningIndex.get(key);
    const timestamp = Date.now();

    if (existing) {
      existing.count++;
      existing.timestamp = timestamp;
      this.warningsTotal++;
      this.pushEvent('warning', init.record ?? null, { message: init.message });
      this.notify();
      return;
    }

    const warning: MutableWarning = {
      id: this.warningsTotal + 1,
      timestamp,
      severity: init.severity ?? 'warning',
      code,
      signalId,
      name: init.record?.name ?? null,
      message: init.message,
      hint: init.hint ?? null,
      count: 1,
    };
    this.warningsTotal++;
    this.warningIndex.set(key, warning);
    this.warningsStore.unshift(warning);

    if (this.warningsStore.length > this.config.maxWarnings) {
      const removed = this.warningsStore.pop();
      if (removed) {
        this.warningIndex.delete(`${removed.code}|${removed.signalId ?? 'global'}`);
      }
    }

    this.pushEvent('warning', init.record ?? null, { message: init.message });
    this.notify();
  }

  // ---------------------------------------------------------------- graph

  /**
   * Re-reads the private reactive graph and refreshes dependencies, consumers and sampled writes.
   * Deliberately silent unless `notify` is requested, so it can be called from inside a `computed`.
   */
  syncFromInternals(options: { readonly notify?: boolean } = {}): void {
    if (!isInternalsAvailable()) {
      return;
    }

    for (const record of this.recordsStore.values()) {
      const node = record.node;
      if (!node) {
        continue;
      }

      const discovered = uniqueIds(
        readProducerNodes(node)
          .map((producer) => this.recordForNode(producer))
          .filter(isRecord)
          .map((producer) => producer.id),
      );

      if (discovered.length > 0) {
        record.dependencies = discovered;
        record.dependenciesSource = 'discovered';
      } else if (record.declaredDependencies?.length) {
        record.dependencies = [...record.declaredDependencies];
        record.dependenciesSource = 'declared';
      } else if (record.dependencies.length > 0) {
        record.dependencies = [];
        record.dependenciesSource = 'none';
      }

      const consumers = readConsumerNodes(node);
      record.consumers = uniqueIds(
        consumers
          .map((consumer) => this.recordForNode(consumer))
          .filter(isRecord)
          .map((consumer) => consumer.id),
      );

      const untrackedLiveConsumers = consumers.filter(
        (consumer) => isLiveConsumer(consumer) && !this.recordForNode(consumer),
      ).length;
      record.frameworkConsumers = untrackedLiveConsumers;

      const version = typeof node.version === 'number' ? node.version : null;
      record.dirty = typeof node.dirty === 'boolean' ? node.dirty : null;
      record.version = version;

      if (
        record.kind === 'tracked' &&
        version !== null &&
        record.sampledVersion !== null &&
        version !== record.sampledVersion
      ) {
        const delta = version - record.sampledVersion;
        record.writes += delta > 0 ? delta : 1;
        record.lastActivityAt = Date.now();
        this.pushEvent('write', record, {
          message: `sampled write (v${record.sampledVersion} → v${version})`,
        });
      }
      if (record.kind === 'tracked') {
        record.sampledVersion = version;
      }

      if (record.destroyed && untrackedLiveConsumers > 0) {
        this.warn('leaked-consumers', {
          severity: 'error',
          record,
          message: `"${record.name}" is destroyed but still has ${untrackedLiveConsumers} live consumer(s).`,
          hint: 'A template, effect or resource keeps reading it after the owner was destroyed.',
        });
      }
    }

    if (options.notify) {
      this.notify();
    }
  }

  /** Builds the laid-out dependency graph of every tracked signal. */
  graph(): SignalGraph {
    this.syncFromInternals();

    const edges: SignalGraphInputEdge[] = [];
    for (const record of this.recordsStore.values()) {
      for (const dependency of record.dependencies) {
        if (this.recordsStore.has(dependency)) {
          edges.push({ from: dependency, to: record.id });
        }
      }
    }

    return layoutSignalGraph({
      nodes: [...this.recordsStore.values()].map((record) => ({
        id: record.id,
        name: record.name,
        kind: record.kind,
        destroyed: record.destroyed,
      })),
      edges,
    });
  }

  // ---------------------------------------------------------------- readers

  listRecords(): SignalRecord[] {
    return [...this.recordsStore.values()].map((record) => toPublicRecord(record));
  }

  getRecords(): readonly TrackedSignal[] {
    return [...this.recordsStore.values()];
  }

  findRecord(id: number): TrackedSignal | null {
    return this.recordsStore.get(id) ?? null;
  }

  /** Resolves a tracked record from an instrumented signal, a reactive node or a record object. */
  resolveRecordId(target: unknown): number | null {
    if (target === null || target === undefined) {
      return null;
    }
    if (typeof target === 'object' && typeof (target as { id?: unknown }).id === 'number') {
      return (target as { id: number }).id;
    }
    const node = getReactiveNode(target);
    if (!node) {
      return null;
    }
    return this.recordForNode(node)?.id ?? null;
  }

  listEvents(): SignalEvent[] {
    return [...this.eventsStore];
  }

  listWarnings(): SignalWarning[] {
    return this.warningsStore.map((warning) => ({ ...warning }));
  }

  stats(): SignalDevtoolsStats {
    let live = 0;
    let destroyed = 0;
    let reads = 0;
    let writes = 0;
    let recomputations = 0;
    let effectRuns = 0;

    for (const record of this.recordsStore.values()) {
      if (record.destroyed) {
        destroyed++;
      } else {
        live++;
      }
      reads += record.reads;
      writes += record.writes;
      recomputations += record.recomputations;
      effectRuns += record.effectRuns;
    }

    return {
      startedAt: this.startedAt,
      tracked: this.recordsStore.size,
      live,
      destroyed,
      reads,
      writes,
      recomputations,
      effectRuns,
      warnings: this.warningsStore.length,
      droppedEvents: this.droppedEvents,
      paused: this.pausedState,
      internalsAvailable: isInternalsAvailable(),
    };
  }

  clear(): void {
    this.recordsStore.clear();
    this.eventsStore.length = 0;
    this.warningsStore.length = 0;
    this.warningIndex.clear();
    this.droppedEvents = 0;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ---------------------------------------------------------------- private

  private recordForNode(node: ReactiveNodeLike): TrackedSignal | undefined {
    try {
      return this.nodeIndex.get(node as object);
    } catch {
      return undefined;
    }
  }

  private pushEvent(
    type: SignalEventType,
    record: TrackedSignal | null,
    extra: {
      message?: string | null;
      durationMs?: number | null;
      valuePreview?: string | null;
    } = {},
  ): void {
    this.eventsTotal++;
    this.eventsStore.unshift({
      id: this.eventsTotal,
      timestamp: Date.now(),
      type,
      signalId: record?.id ?? -1,
      name: record?.name ?? 'devtools',
      message: extra.message ?? null,
      durationMs: extra.durationMs ?? null,
      valuePreview: extra.valuePreview ?? null,
    });

    if (this.eventsStore.length > this.config.maxEvents) {
      this.eventsStore.pop();
      this.droppedEvents++;
    }
  }

  private evictIfNeeded(): void {
    if (this.recordsStore.size <= this.config.maxSignals) {
      return;
    }
    const candidates = [...this.recordsStore.values()];
    const victim = candidates.find((record) => record.destroyed) ?? candidates[0];
    this.recordsStore.delete(victim.id);
    this.pushEvent('warning', null, {
      message: `Record #${victim.id} (${victim.name}) evicted: maxSignals=${this.config.maxSignals}.`,
    });
  }

  /** Coalesces notifications within the current task so hot loops cannot thrash the UI. */
  private notify(): void {
    if (this.notifyScheduled || this.listeners.size === 0) {
      return;
    }
    this.notifyScheduled = true;
    const run = () => {
      this.notifyScheduled = false;
      for (const listener of [...this.listeners]) {
        try {
          listener();
        } catch {
          // A broken listener must never break the tracked application.
        }
      }
    };
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      run();
    }
  }
}

function isRecord(value: TrackedSignal | undefined): value is TrackedSignal {
  return value !== undefined;
}

function uniqueIds(ids: readonly number[]): number[] {
  return [...new Set(ids)];
}

function toPublicRecord(record: TrackedSignal): SignalRecord {
  const { node, sampledVersion, declaredDependencies, ...rest } = record;
  void node;
  void sampledVersion;
  void declaredDependencies;
  return rest;
}
