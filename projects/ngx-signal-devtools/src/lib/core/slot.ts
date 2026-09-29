import type { SignalDevtoolsRegistry } from './registry';

/**
 * Module level slot holding the registry installed by `provideSignalDevtools()`.
 *
 * The instrumented signals (`devSignal`, `devComputed`, …) are plain functions that may run before
 * any injector exists — for example in a class field initializer — so they cannot depend on DI to
 * find the registry. A single slot keeps the check free (one reference comparison) and makes the
 * library a no-op whenever the devtools are disabled.
 */

let active: SignalDevtoolsRegistry | null = null;

/** Registry of the current session, or `null` when the devtools are disabled (production). */
export function getActiveRegistry(): SignalDevtoolsRegistry | null {
  return active;
}

export function installRegistry(registry: SignalDevtoolsRegistry): void {
  if (active !== null && active !== registry) {
    registry.warn('duplicate-provider', {
      severity: 'warning',
      message: 'provideSignalDevtools() was called more than once; the newest registry wins.',
      hint: 'Call it once, at bootstrap (app.config.ts or a root route provider).',
    });
  }
  active = registry;
}

export function uninstallRegistry(registry: SignalDevtoolsRegistry): void {
  if (active === registry) {
    active = null;
  }
}
