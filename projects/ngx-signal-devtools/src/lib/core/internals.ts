import { signal, ɵSIGNAL } from '@angular/core';

/**
 * Read-only adapter over the private reactive graph exposed through the `ɵSIGNAL` symbol.
 *
 * Angular 20+ links producers and consumers through singly linked lists (`producers`/`consumers`
 * with `nextProducer`/`nextConsumer`); Angular 17-19 used arrays (`producerNode`/`consumerNode`).
 * Both shapes are handled, and every accessor is defensive: a shape change must never break the
 * host application, it only degrades the devtools to "no automatic graph".
 *
 * `npm run probe:internals` prints the shape of the installed Angular version.
 */

const MAX_LINKS = 2000;

export interface ReactiveNodeLike {
  readonly kind?: string;
  readonly version?: number;
  readonly dirty?: boolean;
  readonly debugName?: string;
  readonly consumerIsAlwaysLive?: boolean;
  readonly producers?: { nextProducer?: unknown; producer?: unknown };
  readonly consumers?: { nextConsumer?: unknown; consumer?: unknown };
  readonly producerNode?: readonly unknown[];
  readonly consumerNode?: readonly unknown[];
}

let available: boolean | null = null;

/** `true` when dependency/consumer discovery works with the installed Angular version. */
export function isInternalsAvailable(): boolean {
  if (available === null) {
    available = probe();
  }
  return available;
}

/** Resolves the reactive node behind a signal (or any `ɵSIGNAL` carrying object). */
export function getReactiveNode(ref: unknown): ReactiveNodeLike | null {
  if (ref === null || ref === undefined) {
    return null;
  }

  const type = typeof ref;
  if (type !== 'function' && type !== 'object') {
    return null;
  }

  try {
    const symbol = typeof ɵSIGNAL === 'symbol' ? ɵSIGNAL : findSignalSymbol(ref);
    if (!symbol) {
      return null;
    }
    const node = (ref as unknown as Record<symbol, unknown>)[symbol];
    return isNodeLike(node) ? node : null;
  } catch {
    return null;
  }
}

/** Copies the `ɵSIGNAL` brand onto a wrapper so Angular internals treat it as the wrapped signal. */
export function adoptSignalBrand(wrapper: object, source: object): void {
  try {
    const symbol = typeof ɵSIGNAL === 'symbol' ? ɵSIGNAL : findSignalSymbol(source);
    if (!symbol) {
      return;
    }
    const node = (source as unknown as Record<symbol, unknown>)[symbol];
    Object.defineProperty(wrapper, symbol, { value: node, configurable: true, enumerable: false });
  } catch {
    // Wrapping a signal is best effort: a plain function is still a valid signal-like getter.
  }
}

/** Nodes this node reads from (its dependencies). */
export function readProducerNodes(node: ReactiveNodeLike | null | undefined): ReactiveNodeLike[] {
  if (!node) {
    return [];
  }
  return [
    ...walkLinks(node.producers, 'nextProducer', 'producer'),
    ...legacyNodes(node.producerNode),
  ];
}

/** Nodes that read this node (its consumers). */
export function readConsumerNodes(node: ReactiveNodeLike | null | undefined): ReactiveNodeLike[] {
  if (!node) {
    return [];
  }
  return [
    ...walkLinks(node.consumers, 'nextConsumer', 'consumer'),
    ...legacyNodes(node.consumerNode),
  ];
}

function walkLinks(
  head: unknown,
  nextKey: 'nextProducer' | 'nextConsumer',
  valueKey: 'producer' | 'consumer',
): ReactiveNodeLike[] {
  const found: ReactiveNodeLike[] = [];
  let link = toRecord(head);
  let guard = 0;
  while (link !== undefined && guard++ < MAX_LINKS) {
    const value = link[valueKey];
    if (isNodeLike(value)) {
      found.push(value);
    }
    link = toRecord(link[nextKey]);
  }
  return found;
}

function legacyNodes(list: readonly unknown[] | undefined): ReactiveNodeLike[] {
  return Array.isArray(list) ? list.filter(isNodeLike) : [];
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Live consumers are effects, template bindings and resources rather than lazy computeds. */
export function isLiveConsumer(node: ReactiveNodeLike | null | undefined): boolean {
  return node?.consumerIsAlwaysLive === true;
}

function probe(): boolean {
  try {
    if (typeof ɵSIGNAL !== 'symbol') {
      return false;
    }
    const node = getReactiveNode(signal(0));
    return node !== null && readProducerNodes(node).length >= 0;
  } catch {
    return false;
  }
}

function isNodeLike(value: unknown): value is ReactiveNodeLike {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as ReactiveNodeLike;
  return (
    typeof candidate.version === 'number' ||
    typeof candidate.kind === 'string' ||
    'producers' in candidate ||
    'producerNode' in candidate ||
    'consumerNode' in candidate
  );
}

function findSignalSymbol(ref: object): symbol | undefined {
  try {
    return Object.getOwnPropertySymbols(ref).find((symbol) => symbol.description === 'SIGNAL');
  } catch {
    return undefined;
  }
}
