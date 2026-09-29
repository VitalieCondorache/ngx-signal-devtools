/**
 * Probe the private reactive graph contract (ɵSIGNAL) of the installed @angular/core.
 *
 * The devtools adapter in `projects/ngx-signal-devtools/src/lib/core/internals.ts` relies on this
 * contract, so this script acts as a canary: run it (npm run probe:internals) after upgrading
 * Angular to detect a shape change before shipping.
 *
 * Usage: node tools/probe-internals.mjs
 */
import {
  Injector,
  VERSION,
  computed,
  effect,
  runInInjectionContext,
  signal,
  ɵSIGNAL,
} from '@angular/core';

const node = (ref) => ref[ɵSIGNAL];
const label = (n) => `${n?.kind ?? '?'}#${n?.debugName ?? '?'}`;

const counter = signal(1, { debugName: 'counter' });
const doubled = computed(() => counter() * 2, { debugName: 'doubled' });
const counterNode = node(counter);
const doubledNode = node(doubled);

console.log('Angular:', VERSION.full);
console.log('ɵSIGNAL:', typeof ɵSIGNAL, '| description:', ɵSIGNAL?.description);

doubled(); // one computation is enough to link producers

console.log('\nsignal node ->', {
  kind: counterNode?.kind,
  version: counterNode?.version,
  ownKeys: Object.getOwnPropertyNames(counterNode),
});

console.log('computed node ->', {
  kind: doubledNode?.kind,
  version: doubledNode?.version,
  dirty: doubledNode?.dirty,
  producers: doubledNode?.producers !== undefined,
  consumers: doubledNode?.consumers !== undefined,
});

const walkProducers = (n) => {
  const out = [];
  for (let link = n?.producers; link !== undefined; link = link.nextProducer) {
    out.push(label(link.producer));
  }
  return out;
};
const walkConsumers = (n) => {
  const out = [];
  for (let link = n?.consumers; link !== undefined; link = link.nextConsumer) {
    out.push(label(link.consumer));
  }
  return out;
};

console.log('\ncomputed.producers ->', walkProducers(doubledNode));
console.log('signal.consumers ->', walkConsumers(counterNode));

console.log(
  '\nnode identity: producer link === ɵSIGNAL node?',
  doubledNode.producers.producer === counterNode,
);
console.log(
  'second read reuses the same link?',
  (doubled(), doubledNode.producers.nextProducer === undefined),
);

// A live consumer (effect) requires a real environment, so it is covered by the unit tests in
// projects/ngx-signal-devtools/src/lib/core/internals.spec.ts. Here we only check the write path.
counter.set(5);
console.log(
  '\nafter write -> signal.version:',
  counterNode?.version,
  '| computed dirty:',
  doubledNode?.dirty,
);

console.log('\nlegacy array shape (Angular 17-19)?', Array.isArray(counterNode?.producerNode));
