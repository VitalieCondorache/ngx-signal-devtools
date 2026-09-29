/*
 * Public API Surface of @vitalie/ngx-signal-devtools
 */

export { provideSignalDevtools, injectSignalDevtools } from './lib/provide-signal-devtools';
export { devComputed, devEffect, devSignal, trackSignal } from './lib/core/instrument';
export { layoutSignalGraph } from './lib/core/graph-layout';
export { ownerFromOrigin, parseSignalOrigin, previewValue } from './lib/core/origin';
export { isInternalsAvailable } from './lib/core/internals';

export type {
  DevComputedOptions,
  DevEffectOptions,
  DevSignalOptions,
  TrackSignalOptions,
} from './lib/core/instrument';
export type {
  SignalDevtoolsConfig,
  SignalDevtoolsHandle,
  SignalDevtoolsSnapshot,
  SignalDevtoolsStats,
  SignalEvent,
  SignalEventType,
  SignalGraph,
  SignalGraphEdge,
  SignalGraphInput,
  SignalGraphInputEdge,
  SignalGraphInputNode,
  SignalGraphLayoutOptions,
  SignalGraphNode,
  SignalKind,
  SignalOrigin,
  SignalRecord,
  SignalWarning,
  WarningCode,
  WarningSeverity,
} from './lib/core/types';
