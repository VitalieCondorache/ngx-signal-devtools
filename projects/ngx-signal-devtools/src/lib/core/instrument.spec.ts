import { EnvironmentInjector, createEnvironmentInjector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { devComputed, devEffect, devSignal, trackSignal } from './instrument';
import type { SignalDevtoolsRegistry } from './registry';
import { uninstallRegistry } from './slot';
import { provideSignalDevtools } from '../provide-signal-devtools';
import { SIGNAL_DEVTOOLS_REGISTRY } from '../tokens';
import type { SignalRecord } from './types';

function record(name: string): SignalRecord {
  const found = registry.listRecords().find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`No record named ${name}`);
  }
  return found;
}

let registry: SignalDevtoolsRegistry;

describe('instrumented signals', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideSignalDevtools({
          enabled: true,
          captureReads: true,
          hotkey: false,
          globalKey: false,
          refreshIntervalMs: 0,
        }),
      ],
    });
    registry = TestBed.inject(SIGNAL_DEVTOOLS_REGISTRY)!;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  afterAll(() => {
    uninstallRegistry(registry);
  });

  it('tracks reads, writes and no-op writes of devSignal', () => {
    const counter = TestBed.runInInjectionContext(() => devSignal(0, { name: 'counter' }));

    expect(counter()).toBe(0);
    counter.set(1);
    counter.update((value) => value + 1);
    counter.set(2);

    expect(record('counter')).toMatchObject({
      kind: 'signal',
      reads: 1,
      writes: 3,
      writesWithoutChange: 1,
      valuePreview: '2',
    });
    expect(registry.listWarnings().map((warning) => warning.code)).toContain('noop-write');
  });

  it('keeps Angular interop: computed reads the wrapper and reacts to writes', () => {
    const counter = TestBed.runInInjectionContext(() => devSignal(1, { name: 'counter' }));
    const doubled = TestBed.runInInjectionContext(() =>
      devComputed(() => counter() * 2, { name: 'doubled' }),
    );

    expect(doubled()).toBe(2);
    expect(doubled()).toBe(2);
    expect(record('doubled').recomputations).toBe(1);

    counter.set(5);
    expect(doubled()).toBe(10);
    expect(record('doubled').recomputations).toBe(2);
  });

  it('discovers the dependency edges through the private graph', () => {
    const counter = TestBed.runInInjectionContext(() => devSignal(1, { name: 'counter' }));
    const doubled = TestBed.runInInjectionContext(() =>
      devComputed(() => counter() * 2, { name: 'doubled' }),
    );
    doubled();

    registry.syncFromInternals();
    expect(record('doubled').dependencies).toEqual([record('counter').id]);
    expect(record('doubled').dependenciesSource).toBe('discovered');

    const graph = registry.graph();
    expect(graph.edges).toEqual([
      { from: record('counter').id, to: record('doubled').id, path: expect.any(String) },
    ]);
    expect(graph.nodes).toHaveLength(2);
  });

  it('counts effect runs and flags effects that read nothing', () => {
    TestBed.runInInjectionContext(() => devEffect(() => undefined, { name: 'lonely' }));
    TestBed.tick();

    expect(record('lonely').effectRuns).toBeGreaterThan(0);
    expect(registry.listWarnings().map((warning) => warning.code)).toContain(
      'effect-without-dependencies',
    );
  });

  it('runs effects again when a tracked signal changes', () => {
    const counter = TestBed.runInInjectionContext(() => devSignal(0, { name: 'counter' }));
    TestBed.runInInjectionContext(() => devEffect(() => counter(), { name: 'watcher' }));
    TestBed.tick();
    const runsAfterFirst = record('watcher').effectRuns;

    counter.set(1);
    TestBed.tick();

    expect(record('watcher').effectRuns).toBeGreaterThan(runsAfterFirst);
    expect(registry.listWarnings().map((warning) => warning.code)).not.toContain(
      'effect-without-dependencies',
    );
  });

  it('observes existing signals with trackSignal and samples their writes', () => {
    const external = signal(0, { debugName: 'external' });
    const tracked = TestBed.runInInjectionContext(() =>
      trackSignal(external, { name: 'external' }),
    );

    expect(tracked).toBe(external);
    expect(record('external').kind).toBe('tracked');

    external.set(1);
    registry.syncFromInternals();
    expect(record('external').writes).toBe(1);
    expect(registry.listEvents()[0]?.message).toContain('sampled write');
  });

  it('detects usage after the owning injector was destroyed', () => {
    const scoped = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    const scopedSignal = scoped.runInContext(() => devSignal(0, { name: 'scoped' }));

    expect(record('scoped').destroyed).toBe(false);
    scoped.destroy();
    expect(record('scoped').destroyed).toBe(true);

    scopedSignal.set(1);
    scopedSignal();

    expect(record('scoped')).toMatchObject({ writeAfterDestroy: 1, readAfterDestroy: 1 });
    expect(registry.listWarnings().map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['write-after-destroy', 'read-after-destroy']),
    );
  });
});
