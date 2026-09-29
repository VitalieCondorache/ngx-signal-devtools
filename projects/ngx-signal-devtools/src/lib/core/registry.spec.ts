import { SignalDevtoolsRegistry, type NormalizedConfig, type TrackedSignal } from './registry';

function createRegistry(overrides: Partial<NormalizedConfig> = {}): SignalDevtoolsRegistry {
  return new SignalDevtoolsRegistry({
    enabled: true,
    captureReads: false,
    captureValues: true,
    maxSignals: 50,
    maxEvents: 5,
    maxWarnings: 3,
    warnOnNoopWrite: true,
    warnOnNoDependencies: true,
    hotSignalThreshold: 2,
    notifyThrottleMs: 0,
    ...overrides,
  });
}

function createSignalRecord(registry: SignalDevtoolsRegistry, name = 'counter'): TrackedSignal {
  return registry.create({ kind: 'signal', name, value: 0 });
}

describe('SignalDevtoolsRegistry', () => {
  it('creates named records and counts reads, writes and no-op writes', () => {
    const registry = createRegistry();
    const record = createSignalRecord(registry);

    registry.noteRead(record);
    registry.noteWrite(record, true, 1);
    registry.noteWrite(record, false, 1);

    const [snapshot] = registry.listRecords();
    expect(snapshot).toMatchObject({
      id: record.id,
      name: 'counter',
      kind: 'signal',
      reads: 1,
      writes: 2,
      writesWithoutChange: 1,
      destroyed: false,
    });
    expect(snapshot!.valuePreview).toBe('1');
    expect(registry.listWarnings().map((warning) => warning.code)).toEqual(['noop-write']);
  });

  it('falls back to a generated name and hides raw reads by default', () => {
    const registry = createRegistry();
    const record = registry.create({ kind: 'computed' });
    registry.noteRead(record);

    expect(record.name).toBe(`computed#${record.id}`);
    expect(registry.listEvents().some((event) => event.type === 'read')).toBe(false);
  });

  it('records reads when captureReads is enabled', () => {
    const registry = createRegistry({ captureReads: true });
    const record = createSignalRecord(registry);
    registry.noteRead(record);

    expect(registry.listEvents()[0]?.type).toBe('read');
  });

  it('reports suspicious lifetime usage after destroy', () => {
    const registry = createRegistry();
    const record = createSignalRecord(registry, 'leaky');
    registry.destroy(record);
    registry.noteWrite(record, true, 2);
    registry.noteRead(record);
    registry.noteWrite(record, true, 3);

    expect(registry.listRecords()[0]).toMatchObject({
      destroyed: true,
      writeAfterDestroy: 2,
      readAfterDestroy: 1,
    });
    expect(registry.listWarnings().map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['write-after-destroy', 'read-after-destroy']),
    );
  });

  it('deduplicates diagnostics and keeps the occurrence count', () => {
    const registry = createRegistry();
    const record = createSignalRecord(registry);
    for (let index = 0; index < 4; index++) {
      registry.noteWrite(record, false, 0);
    }

    const warnings = registry.listWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'noop-write', count: 4, signalId: record.id });
  });

  it('drops the oldest warnings when maxWarnings is exceeded', () => {
    const registry = createRegistry({ maxWarnings: 1 });
    const first = createSignalRecord(registry, 'first');
    const second = createSignalRecord(registry, 'second');
    registry.noteWrite(first, false, 0);
    registry.noteWrite(second, false, 0);

    const warnings = registry.listWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.name).toBe('second');
  });

  it('caps the activity buffer and counts dropped events', () => {
    const registry = createRegistry({ maxEvents: 3 });
    const record = createSignalRecord(registry);
    for (let index = 0; index < 5; index++) {
      registry.noteWrite(record, true, index);
    }

    expect(registry.listEvents()).toHaveLength(3);
    expect(registry.stats().droppedEvents).toBeGreaterThan(0);
  });

  it('evicts destroyed records first when maxSignals is exceeded', () => {
    const registry = createRegistry({ maxSignals: 2 });
    const first = createSignalRecord(registry, 'first');
    createSignalRecord(registry, 'second');
    registry.destroy(first);
    createSignalRecord(registry, 'third');

    expect(registry.listRecords().map((record) => record.name)).toEqual(['second', 'third']);
  });
});

describe('SignalDevtoolsRegistry diagnostics', () => {
  it('warns when computeds look hot, only once', () => {
    const registry = createRegistry({ hotSignalThreshold: 2 });
    const record = registry.create({ kind: 'computed', name: 'expensive' });
    registry.noteRecompute(record, 1, 1);
    registry.noteRecompute(record, 2, 2);
    registry.noteRecompute(record, 3, 3);

    const warnings = registry.listWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: 'hot-signal', name: 'expensive', count: 1 });
  });

  it('warns when an effect reads nothing instrumented', () => {
    const registry = createRegistry();
    const record = registry.create({ kind: 'effect', name: 'lonely' });
    registry.startEffectRunCapture();
    registry.noteEffectRun(record, 0.5, registry.effectRunReads);

    expect(registry.listWarnings()[0]).toMatchObject({ code: 'effect-without-dependencies' });
  });

  it('tracks effect dependencies through the read counter', () => {
    const registry = createRegistry();
    const record = registry.create({ kind: 'effect', name: 'wired' });
    const source = createSignalRecord(registry, 'source');

    registry.startEffectRunCapture();
    registry.noteRead(source);
    registry.noteEffectRun(record, 0.5, registry.effectRunReads);

    expect(registry.effectRunReads).toBe(1);
    expect(registry.listWarnings()).toHaveLength(0);
  });

  it('reports global diagnostics without a signal', () => {
    const registry = createRegistry();
    registry.warn('duplicate-provider', { message: 'called twice' });

    expect(registry.listWarnings()[0]).toMatchObject({
      code: 'duplicate-provider',
      signalId: null,
    });
  });
});

describe('SignalDevtoolsRegistry state', () => {
  it('aggregates statistics and resets them on clear', () => {
    const registry = createRegistry();
    const record = createSignalRecord(registry);
    registry.noteRead(record);
    registry.noteWrite(record, true, 1);

    expect(registry.stats()).toMatchObject({
      tracked: 1,
      live: 1,
      destroyed: 0,
      reads: 1,
      writes: 1,
    });

    registry.clear();
    expect(registry.stats()).toMatchObject({ tracked: 0, reads: 0, writes: 0 });
    expect(registry.listEvents()).toHaveLength(0);
  });

  it('freezes and resumes the panel', () => {
    const registry = createRegistry();
    expect(registry.paused).toBe(false);
    registry.pause();
    expect(registry.paused).toBe(true);
    expect(registry.stats().paused).toBe(true);
    registry.resume();
    expect(registry.paused).toBe(false);
  });

  it('notifies subscribers once per task', async () => {
    const registry = createRegistry();
    let calls = 0;
    const unsubscribe = registry.subscribe(() => calls++);

    const record = createSignalRecord(registry);
    registry.noteWrite(record, true, 1);
    registry.noteWrite(record, true, 2);
    await Promise.resolve();

    expect(calls).toBe(1);
    unsubscribe();
    registry.noteWrite(record, true, 3);
    await Promise.resolve();
    expect(calls).toBe(1);
  });

  it('resolves records from record objects and unknown values', () => {
    const registry = createRegistry();
    const record = createSignalRecord(registry);
    expect(registry.resolveRecordId(record)).toBe(record.id);
    expect(registry.resolveRecordId({})).toBeNull();
    expect(registry.resolveRecordId(null)).toBeNull();
  });

  it('returns copies of warnings so consumers cannot mutate the store', () => {
    const registry = createRegistry();
    const record = createSignalRecord(registry);
    registry.noteWrite(record, false, 0);

    const [warning] = registry.listWarnings();
    (warning as { message: string }).message = 'mutated';
    expect(registry.listWarnings()[0]?.message).not.toBe('mutated');
  });

  it('exposes public records without internal fields', () => {
    const registry = createRegistry();
    const record = createSignalRecord(registry);
    registry.linkNode(record, () => 0);

    const [snapshot] = registry.listRecords();
    expect(snapshot).not.toHaveProperty('node');
    expect(snapshot).not.toHaveProperty('sampledVersion');
    expect(snapshot).toHaveProperty('dependenciesSource');
    expect(registry.findRecord(record.id)).toBe(record);
    expect(registry.getRecords()).toHaveLength(1);
  });
});

describe('SignalDevtoolsRegistry notifications', () => {
  it('never notifies for reads, so a template cannot keep change detection alive', async () => {
    const registry = createRegistry({ captureReads: true });
    const record = createSignalRecord(registry);
    let calls = 0;
    registry.subscribe(() => calls++);

    registry.noteRead(record);
    registry.noteRead(record);
    await Promise.resolve();

    expect(calls).toBe(0);
    expect(record.reads).toBe(2);
    expect(registry.effectRunReads).toBe(2);
  });

  it('throttles notifications when a delay is configured', async () => {
    const registry = createRegistry({ notifyThrottleMs: 20 });
    const record = createSignalRecord(registry);
    let calls = 0;
    registry.subscribe(() => calls++);

    registry.noteWrite(record, true, 1);
    registry.noteWrite(record, true, 2);
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(calls).toBe(1);
  });
});
