import {
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  type EffectRef,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import { adoptSignalBrand, getReactiveNode } from './internals';
import { captureSignalOrigin, ownerFromOrigin } from './origin';
import type { SignalDevtoolsRegistry, TrackedSignal } from './registry';
import { getActiveRegistry } from './slot';

/** Options shared by the instrumented factories. */
export interface DevSignalOptions<T = unknown> {
  /** Name shown in the overlay. Defaults to the reactive node `debugName` or `signal#id`. */
  readonly name?: string;
  /** Custom equality, forwarded to the underlying signal. */
  readonly equal?: (a: T, b: T) => boolean;
  /** Explicit dependencies, used when the private graph cannot be read. */
  readonly dependencies?: readonly unknown[];
  /** Skips the (cheap) stack capture when the origin is not interesting. Defaults to `false`. */
  readonly skipOrigin?: boolean;
}

export type DevComputedOptions<T = unknown> = DevSignalOptions<T>;

export interface DevEffectOptions {
  readonly name?: string;
  /** Keeps the effect alive after its injection context is destroyed (rarely useful). */
  readonly manualCleanup?: boolean;
  readonly skipOrigin?: boolean;
}

export interface TrackSignalOptions {
  readonly name?: string;
  readonly dependencies?: readonly unknown[];
  readonly skipOrigin?: boolean;
}

/**
 * Creates a writable signal tracked by the devtools — a drop-in replacement for `signal()`.
 *
 * When the devtools are disabled (production builds, SSR) this delegates to `signal()` directly, so
 * the only overhead is a single reference check.
 */
export function devSignal<T>(initial: T, options: DevSignalOptions<T> = {}): WritableSignal<T> {
  const registry = getActiveRegistry();
  const baseOptions = options.equal ? { equal: options.equal } : {};

  if (!registry) {
    return signal(initial, baseOptions);
  }

  const base = signal(initial, { ...baseOptions, debugName: options.name });
  const record = registry.create({
    kind: 'signal',
    name: options.name,
    origin: options.skipOrigin ? null : captureSignalOrigin(),
    declaredDependencies: resolveDependencyIds(registry, options.dependencies),
    value: initial,
  });
  attachContext(registry, record);
  registry.linkNode(record, base);

  const wrapper = (() => {
    const value = base();
    registry.noteRead(record);
    return value;
  }) as WritableSignal<T>;

  wrapper.set = (value: T): void => {
    const changed = !sameValue(base(), value, options.equal);
    base.set(value);
    registry.noteWrite(record, changed, value);
  };

  wrapper.update = (update: (value: T) => T): void => {
    base.update((current) => {
      const next = update(current);
      registry.noteWrite(record, !sameValue(current, next, options.equal), next);
      return next;
    });
  };

  wrapper.asReadonly = () => wrapper;

  adoptSignalBrand(wrapper, base);
  return wrapper;
}

/**
 * Creates a computed signal tracked by the devtools: recomputation count, duration, and — when the
 * private graph is readable — the dependency edges.
 */
export function devComputed<T>(fn: () => T, options: DevComputedOptions<T> = {}): Signal<T> {
  const registry = getActiveRegistry();
  if (!registry) {
    return computed(fn);
  }

  const record = registry.create({
    kind: 'computed',
    name: options.name,
    origin: options.skipOrigin ? null : captureSignalOrigin(),
    declaredDependencies: resolveDependencyIds(registry, options.dependencies),
  });
  attachContext(registry, record);

  const base = computed<T>(
    () => {
      const started = now();
      const value = fn();
      registry.noteRecompute(record, now() - started, value);
      return value;
    },
    options.equal ? { equal: options.equal, debugName: options.name } : { debugName: options.name },
  );
  registry.linkNode(record, base);

  const wrapper = (() => {
    const value = base();
    registry.noteRead(record);
    return value;
  }) as Signal<T>;

  adoptSignalBrand(wrapper, base);
  return wrapper;
}

/**
 * Creates a tracked effect. Reports how often it ran, how long it took and whether it read any
 * instrumented signal — an effect that tracks nothing runs exactly once and is usually a bug.
 */
export function devEffect(fn: () => void, options: DevEffectOptions = {}): EffectRef {
  const registry = getActiveRegistry();
  if (!registry) {
    return effect(fn, options.manualCleanup ? { manualCleanup: true } : {});
  }

  const record = registry.create({
    kind: 'effect',
    name: options.name,
    origin: options.skipOrigin ? null : captureSignalOrigin(),
  });
  attachContext(registry, record);

  return effect(
    () => {
      registry.startEffectRunCapture();
      const started = now();
      try {
        fn();
      } finally {
        registry.noteEffectRun(record, now() - started, registry.effectRunReads);
      }
    },
    options.manualCleanup ? { manualCleanup: true } : {},
  );
}

/**
 * Registers an existing signal. The signal keeps its identity, so reads cannot be intercepted:
 * writes are detected by sampling the reactive node version. Use `devSignal` when exact numbers
 * matter.
 */
export function trackSignal<S extends Signal<unknown>>(
  ref: S,
  options: TrackSignalOptions = {},
): S {
  const registry = getActiveRegistry();
  if (!registry) {
    return ref;
  }

  const node = getReactiveNode(ref);
  const record = registry.create({
    kind: 'tracked',
    name: options.name ?? node?.debugName,
    origin: options.skipOrigin ? null : captureSignalOrigin(),
    declaredDependencies: resolveDependencyIds(registry, options.dependencies),
  });
  attachContext(registry, record);
  registry.linkNode(record, ref);
  registry.syncFromInternals();
  return ref;
}

// --------------------------------------------------------------------------- helpers

function attachContext(registry: SignalDevtoolsRegistry, record: TrackedSignal): void {
  const detected = ownerFromOrigin(record.origin);
  if (detected) {
    record.owner = detected;
  }

  // Inside an injection context we can follow the owner lifecycle, which powers leak detection.
  try {
    inject(DestroyRef).onDestroy(() => registry.destroy(record));
  } catch {
    registry.warn('unowned-signal', {
      severity: 'info',
      record,
      message: `"${record.name}" was created outside an injection context, so its lifetime is unknown.`,
      hint: 'Create it inside an injectable, component or directive to get automatic leak detection.',
    });
  }
}

function resolveDependencyIds(
  registry: SignalDevtoolsRegistry,
  dependencies: readonly unknown[] | undefined,
): readonly number[] | null {
  if (!dependencies?.length) {
    return null;
  }
  const ids = dependencies
    .map((dependency) => registry.resolveRecordId(dependency))
    .filter((id): id is number => id !== null);
  return ids.length ? ids : null;
}

function sameValue<T>(a: T, b: T, equal?: (a: T, b: T) => boolean): boolean {
  return equal ? equal(a, b) : Object.is(a, b);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
