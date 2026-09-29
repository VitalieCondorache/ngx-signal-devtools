import { InjectionToken, isDevMode } from '@angular/core';
import type { NormalizedConfig, SignalDevtoolsRegistry } from './core/registry';
import type { SignalDevtoolsConfig } from './core/types';

/** Configuration resolved from user input plus environment defaults. */
export interface ResolvedConfig extends NormalizedConfig {
  readonly hotkey: string | false;
  readonly position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  readonly refreshIntervalMs: number;
  readonly globalKey: string | false;
}

export const SIGNAL_DEVTOOLS_CONFIG = new InjectionToken<ResolvedConfig>(
  'ngx-signal-devtools.config',
);

export const SIGNAL_DEVTOOLS_REGISTRY = new InjectionToken<SignalDevtoolsRegistry | null>(
  'ngx-signal-devtools.registry',
);

/**
 * Defaults are chosen so that the library is inert in production and on the server, and useful
 * without any configuration in development.
 */
export function resolveConfig(config: SignalDevtoolsConfig = {}): ResolvedConfig {
  const browser = typeof document !== 'undefined' && typeof window !== 'undefined';

  return {
    enabled: config.enabled ?? (browser && isDevMode()),
    captureReads: config.captureReads ?? false,
    captureValues: config.captureValues ?? true,
    maxSignals: config.maxSignals ?? 500,
    maxEvents: config.maxEvents ?? 200,
    maxWarnings: config.maxWarnings ?? 100,
    warnOnNoopWrite: config.warnOnNoopWrite ?? true,
    warnOnNoDependencies: config.warnOnNoDependencies ?? true,
    hotSignalThreshold: config.hotSignalThreshold ?? 120,
    notifyThrottleMs: config.notifyThrottleMs ?? 16,
    hotkey: config.hotkey === undefined ? 'ctrl+shift+s' : config.hotkey,
    position: config.position ?? 'bottom-right',
    refreshIntervalMs: config.refreshIntervalMs ?? 500,
    globalKey: config.globalKey === undefined ? 'ngSignalDevtools' : config.globalKey,
  };
}

/** Parses `ctrl+shift+s` style shortcuts into a matcher. Exported for tests. */
export function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  const key = parts.at(-1);
  if (!key) {
    return false;
  }

  const expectsCtrl = parts.includes('ctrl') || parts.includes('control');
  const expectsMeta = parts.includes('meta') || parts.includes('cmd');
  const expectsShift = parts.includes('shift');
  const expectsAlt = parts.includes('alt');

  const keyMatches = event.key.toLowerCase() === key || event.code.toLowerCase() === `key${key}`;

  return (
    keyMatches &&
    event.ctrlKey === expectsCtrl &&
    event.metaKey === expectsMeta &&
    event.shiftKey === expectsShift &&
    event.altKey === expectsAlt
  );
}
