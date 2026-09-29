import {
  DestroyRef,
  ENVIRONMENT_INITIALIZER,
  inject,
  makeEnvironmentProviders,
  type EnvironmentProviders,
} from '@angular/core';
import { SignalDevtoolsRegistry } from './core/registry';
import { installRegistry, uninstallRegistry } from './core/slot';
import type { SignalDevtoolsConfig, SignalDevtoolsHandle } from './core/types';
import { SignalDevtoolsService } from './signal-devtools.service';
import { SIGNAL_DEVTOOLS_CONFIG, SIGNAL_DEVTOOLS_REGISTRY, resolveConfig } from './tokens';

/**
 * Enables the signal devtools for the application.
 *
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [provideSignalDevtools()],
 * };
 * ```
 *
 * Without arguments the devtools are enabled only in development builds on the browser, so
 * production bundles keep the registry out entirely and never request the overlay chunk.
 */
export function provideSignalDevtools(config: SignalDevtoolsConfig = {}): EnvironmentProviders {
  const resolved = resolveConfig(config);
  const registry = resolved.enabled ? new SignalDevtoolsRegistry(resolved) : null;

  if (registry) {
    installRegistry(registry);
  }

  return makeEnvironmentProviders([
    { provide: SIGNAL_DEVTOOLS_CONFIG, useValue: resolved },
    { provide: SIGNAL_DEVTOOLS_REGISTRY, useValue: registry },
    SignalDevtoolsService,
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        const service = inject(SignalDevtoolsService);
        service.install();

        if (registry) {
          inject(DestroyRef).onDestroy(() => {
            service.uninstall();
            uninstallRegistry(registry);
          });
        }
      },
    },
  ]);
}

/**
 * Imperative handle of the devtools (`show()`, `toggle()`, `snapshot()`, reactive counters…).
 *
 * When `provideSignalDevtools()` is disabled or missing in production, the returned handle reports
 * empty state and every command is a no-op, so calling it from application code is always safe.
 */
export function injectSignalDevtools(): SignalDevtoolsHandle {
  return inject(SignalDevtoolsService);
}
