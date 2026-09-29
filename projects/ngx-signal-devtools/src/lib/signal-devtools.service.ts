import {
  DOCUMENT,
  EnvironmentInjector,
  Injectable,
  VERSION,
  computed,
  createComponent,
  effect,
  inject,
  signal,
  type ComponentRef,
  type Signal,
} from '@angular/core';
import type { SignalDevtoolsRegistry } from './core/registry';
import type {
  SignalDevtoolsHandle,
  SignalDevtoolsSnapshot,
  SignalDevtoolsStats,
  SignalEvent,
  SignalGraph,
  SignalRecord,
  SignalWarning,
} from './core/types';
import { SIGNAL_DEVTOOLS_CONFIG, SIGNAL_DEVTOOLS_REGISTRY, matchesHotkey } from './tokens';

const EMPTY_STATS: SignalDevtoolsStats = {
  startedAt: Date.now(),
  tracked: 0,
  live: 0,
  destroyed: 0,
  reads: 0,
  writes: 0,
  recomputations: 0,
  effectRuns: 0,
  warnings: 0,
  droppedEvents: 0,
  paused: false,
  internalsAvailable: false,
};

const EMPTY_GRAPH: SignalGraph = { nodes: [], edges: [], width: 0, height: 0, maxDepth: 0 };

/**
 * Runtime handle of the devtools. It owns the reactive surface consumed by the overlay and the
 * logic that mounts the lazily loaded UI chunk.
 */
@Injectable()
export class SignalDevtoolsService implements SignalDevtoolsHandle {
  private readonly injector = inject(EnvironmentInjector);
  private readonly document = inject(DOCUMENT);
  private readonly config = inject(SIGNAL_DEVTOOLS_CONFIG);
  private readonly registry = inject<SignalDevtoolsRegistry | null>(SIGNAL_DEVTOOLS_REGISTRY, {
    optional: true,
  });

  /** Bumped whenever the registry reports a change; drives every derived signal below. */
  private readonly revision = signal(0);
  private readonly openState = signal(false);
  private readonly pausedState = signal(false);

  private componentRef: ComponentRef<unknown> | null = null;
  private hostElement: HTMLElement | null = null;
  private mounting: Promise<void> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private installed = false;

  readonly open: Signal<boolean> = this.openState.asReadonly();
  readonly paused: Signal<boolean> = this.pausedState.asReadonly();

  readonly records: Signal<readonly SignalRecord[]> = computed(() => {
    this.revision();
    return this.registry?.listRecords() ?? [];
  });

  readonly events: Signal<readonly SignalEvent[]> = computed(() => {
    this.revision();
    return this.registry?.listEvents() ?? [];
  });

  readonly warnings: Signal<readonly SignalWarning[]> = computed(() => {
    this.revision();
    return this.registry?.listWarnings() ?? [];
  });

  readonly stats: Signal<SignalDevtoolsStats> = computed(() => {
    this.revision();
    return this.registry?.stats() ?? EMPTY_STATS;
  });

  constructor() {
    // The overlay is rendered outside the application's view tree, so change detection is driven
    // explicitly: whenever the registry reports a change, refresh the mounted overlay only.
    effect(() => {
      this.revision();
      if (this.componentRef && this.openState()) {
        try {
          this.componentRef.changeDetectorRef.detectChanges();
        } catch {
          // A failing refresh must never break the host application.
        }
      }
    });
  }

  /** Wires the service to the global scope and the hotkey. Called by the provider. */
  install(): void {
    if (this.installed || !this.registry) {
      return;
    }
    this.installed = true;
    this.unsubscribe = this.registry.subscribe(() => this.revision.update((value) => value + 1));

    if (this.config.globalKey) {
      (globalThis as unknown as Record<string, unknown>)[this.config.globalKey] = this;
    }
    if (this.config.hotkey) {
      this.document.addEventListener('keydown', this.onKeydown);
    }
  }

  /** Removes every global side effect (used when the environment injector is destroyed). */
  uninstall(): void {
    if (!this.installed) {
      return;
    }
    this.installed = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.config.hotkey) {
      this.document.removeEventListener('keydown', this.onKeydown);
    }
    if (this.config.globalKey) {
      const scope = globalThis as unknown as Record<string, unknown>;
      if (scope[this.config.globalKey] === this) {
        delete scope[this.config.globalKey];
      }
    }
    this.hide();
  }

  graph(): SignalGraph {
    return this.registry?.graph() ?? EMPTY_GRAPH;
  }

  async show(): Promise<void> {
    if (!this.registry) {
      return;
    }
    this.openState.set(true);
    if (this.componentRef) {
      return;
    }
    this.mounting ??= this.mountOverlay().finally(() => {
      this.mounting = null;
    });
    return this.mounting;
  }

  hide(): void {
    this.openState.set(false);
    this.stopRefresh();
    this.componentRef?.destroy();
    this.componentRef = null;
    this.hostElement?.remove();
    this.hostElement = null;
  }

  async toggle(): Promise<void> {
    if (this.openState()) {
      this.hide();
      return;
    }
    await this.show();
  }

  clear(): void {
    this.registry?.clear();
    this.revision.update((value) => value + 1);
  }

  pause(): void {
    this.registry?.pause();
    this.pausedState.set(this.registry?.paused ?? false);
  }

  resume(): void {
    this.registry?.resume();
    this.pausedState.set(this.registry?.paused ?? false);
  }

  snapshot(): SignalDevtoolsSnapshot {
    const registry = this.registry;
    return {
      generatedAt: new Date().toISOString(),
      schemaVersion: 1,
      angularVersion: VERSION?.full ?? null,
      stats: registry?.stats() ?? EMPTY_STATS,
      signals: registry?.listRecords() ?? [],
      warnings: registry?.listWarnings() ?? [],
      events: registry?.listEvents() ?? [],
      graph: registry?.graph() ?? EMPTY_GRAPH,
    };
  }

  download(): void {
    try {
      const blob = new Blob([JSON.stringify(this.snapshot(), null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = this.document.createElement('a');
      anchor.href = url;
      anchor.download = `signal-devtools-${Date.now()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      // Downloading is a convenience; environments without URL/Blob simply skip it.
    }
  }

  /** Rebuilds sampled graph data; used by the refresh loop while the overlay is open. */
  refresh(): void {
    this.registry?.syncFromInternals({ notify: true });
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (this.config.hotkey && matchesHotkey(event, this.config.hotkey)) {
      event.preventDefault();
      void this.toggle();
    }
  };

  private async mountOverlay(): Promise<void> {
    // The UI lives in its own chunk: production builds never download it.
    const { SdtOverlayComponent } = await import('./ui/overlay.component');
    if (!this.openState() || this.componentRef) {
      return;
    }

    const host = this.document.createElement('sdt-overlay-host');
    this.document.body.appendChild(host);
    this.hostElement = host;

    this.componentRef = createComponent(SdtOverlayComponent, {
      environmentInjector: this.injector,
      hostElement: host,
    });
    this.componentRef.changeDetectorRef.detectChanges();
    this.startRefresh();
  }

  private startRefresh(): void {
    if (this.refreshTimer !== null || this.config.refreshIntervalMs <= 0) {
      return;
    }
    this.refreshTimer = setInterval(() => this.refresh(), this.config.refreshIntervalMs);
  }

  private stopRefresh(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}
