import { TestBed } from '@angular/core/testing';
import { computed, effect, signal } from '@angular/core';
import {
  getReactiveNode,
  isInternalsAvailable,
  readConsumerNodes,
  readProducerNodes,
} from './internals';

/**
 * These tests pin the private contract the adapter relies on. If a future Angular version changes
 * the shape of the reactive nodes, these are the tests that explain what broke.
 */
describe('reactive graph internals', () => {
  it('reports availability and resolves nodes of signals and computeds', () => {
    expect(isInternalsAvailable()).toBe(true);

    const source = signal(1, { debugName: 'source' });
    const derived = computed(() => source() * 2, { debugName: 'derived' });

    expect(getReactiveNode(source)?.kind).toBe('signal');
    expect(getReactiveNode(source)?.debugName).toBe('source');
    expect(getReactiveNode(derived)?.kind).toBe('computed');
    expect(getReactiveNode(() => 0)).toBeNull();
    expect(getReactiveNode(undefined)).toBeNull();
    expect(getReactiveNode(42)).toBeNull();
  });

  it('walks the producers of a computed', () => {
    const source = signal(1);
    const other = signal(2);
    const derived = computed(() => source() + other());

    derived();

    const producers = readProducerNodes(getReactiveNode(derived));
    expect(producers).toContain(getReactiveNode(source));
    expect(producers).toContain(getReactiveNode(other));
    expect(readProducerNodes(null)).toEqual([]);
  });

  it('does not list lazy computeds as live consumers of a signal', () => {
    const source = signal(1);
    const derived = computed(() => source() * 2);
    derived();

    expect(readConsumerNodes(getReactiveNode(source))).toHaveLength(0);
  });

  it('exposes live consumers such as effects', () => {
    TestBed.configureTestingModule({});
    const source = signal(0);

    TestBed.runInInjectionContext(() => effect(() => void source()));
    TestBed.tick();

    const consumers = readConsumerNodes(getReactiveNode(source));
    expect(consumers.length).toBeGreaterThan(0);
    expect(consumers.some((consumer) => consumer.consumerIsAlwaysLive === true)).toBe(true);
  });

  it('stops walking legacy array shapes gracefully', () => {
    const legacy = { producerNode: [{ version: 0 }, undefined, 5], consumerNode: [{ version: 1 }] };
    expect(readProducerNodes(legacy)).toHaveLength(1);
    expect(readConsumerNodes(legacy)).toHaveLength(1);
  });
});
