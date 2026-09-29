import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  signal,
} from '@angular/core';
import { layoutSignalGraph } from '../core/graph-layout';
import type { SignalEvent, SignalGraphInput, SignalRecord, SignalWarning } from '../core/types';
import { injectSignalDevtools } from '../provide-signal-devtools';
import { SdtGraphViewComponent } from './graph-view.component';

type Panel = 'signals' | 'events' | 'warnings' | 'graph';

interface TabDefinition {
  readonly id: Panel;
  readonly label: string;
  readonly icon: string;
}

/**
 * The overlay itself. It is only downloaded when the devtools are opened, so it never contributes
 * to the initial bundle of an application.
 *
 * Encapsulation is disabled on purpose: a single stylesheet then styles both the overlay and the
 * graph view, while every rule stays namespaced under `.sdt-`.
 */
@Component({
  selector: 'sdt-overlay',
  imports: [SdtGraphViewComponent],
  templateUrl: './overlay.component.html',
  styleUrl: './overlay.component.css',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sdt-root',
    '(document:keydown.escape)': 'close()',
  },
})
export class SdtOverlayComponent {
  protected readonly devtools = injectSignalDevtools();

  protected readonly tabs: readonly TabDefinition[] = [
    { id: 'signals', label: 'Signals', icon: '◈' },
    { id: 'events', label: 'Events', icon: '⚡' },
    { id: 'warnings', label: 'Warnings', icon: '⚠' },
    { id: 'graph', label: 'Graph', icon: '⤳' },
  ];

  protected readonly panel = signal<Panel>('signals');
  protected readonly selectedId = signal<number | null>(null);
  protected readonly collapsed = signal(false);
  protected readonly dragOffset = signal<{ x: number; y: number } | null>(null);

  protected readonly records = this.devtools.records;
  protected readonly events = this.devtools.events;
  protected readonly warnings = this.devtools.warnings;
  protected readonly stats = this.devtools.stats;
  protected readonly paused = this.devtools.paused;

  protected readonly totalWarnings = computed(() =>
    this.warnings().reduce((total, warning) => total + warning.count, 0),
  );

  protected readonly selected = computed<SignalRecord | null>(() => {
    const id = this.selectedId();
    if (id === null) {
      return null;
    }
    return this.records().find((record) => record.id === id) ?? null;
  });

  protected readonly selectedDependencies = computed(() =>
    this.resolveNames(this.selected()?.dependencies),
  );

  protected readonly selectedConsumers = computed(() =>
    this.resolveNames(this.selected()?.consumers),
  );

  protected readonly graph = computed(() => layoutSignalGraph(this.graphInput()));

  protected readonly graphInput = computed<SignalGraphInput>(() => {
    const records = this.records();
    const edges = records.flatMap((record) =>
      record.dependencies.map((dependency) => ({ from: dependency, to: record.id })),
    );
    return {
      nodes: records.map((record) => ({
        id: record.id,
        name: record.name,
        kind: record.kind,
        destroyed: record.destroyed,
      })),
      edges,
    };
  });

  protected readonly dragTransform = computed(() => {
    const offset = this.dragOffset();
    return offset ? `translate(${offset.x}px, ${offset.y}px)` : 'translate(0, 0)';
  });

  private dragStart: { x: number; y: number; originX: number; originY: number } | null = null;

  // ------------------------------------------------------------- interactions

  protected startDrag(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }
    const current = this.dragOffset() ?? { x: 0, y: 0 };
    this.dragStart = { x: event.clientX, y: event.clientY, originX: current.x, originY: current.y };
    document.addEventListener('mousemove', this.onDragMove);
    document.addEventListener('mouseup', this.stopDrag);
  }

  protected toggleCollapsed(): void {
    this.collapsed.update((value) => !value);
  }

  protected togglePause(): void {
    if (this.paused()) {
      this.devtools.resume();
    } else {
      this.devtools.pause();
    }
  }

  protected close(): void {
    this.devtools.hide();
  }

  protected select(record: SignalRecord): void {
    this.selectedId.update((current) => (current === record.id ? null : record.id));
  }

  protected relativeTime(timestamp: number): string {
    const elapsed = (timestamp - this.stats().startedAt) / 1000;
    return `${elapsed >= 0 ? '+' : ''}${elapsed.toFixed(2)}s`;
  }

  protected duration(value: number | null): string {
    return value === null ? '' : `${value.toFixed(2)}ms`;
  }

  protected eventTone(event: SignalEvent): string {
    return `sdt-ev-${event.type}`;
  }

  protected warningTone(warning: SignalWarning): string {
    return `sdt-sev-${warning.severity}`;
  }

  protected effectiveDependencies(record: SignalRecord): string {
    return record.dependenciesSource === 'discovered' || record.dependenciesSource === 'declared'
      ? String(record.dependencies.length)
      : '—';
  }

  protected consumersLabel(record: SignalRecord): string {
    const framework = record.frameworkConsumers ?? 0;
    const tracked = record.consumers.length;
    if (tracked === 0 && framework === 0) {
      return '0';
    }
    return `${tracked}${framework > 0 ? ` +${framework} view` : ''}`;
  }

  private readonly onDragMove = (event: MouseEvent): void => {
    if (!this.dragStart) {
      return;
    }
    const { x, y, originX, originY } = this.dragStart;
    this.dragOffset.set({ x: originX + (event.clientX - x), y: originY + (event.clientY - y) });
  };

  private readonly stopDrag = (): void => {
    this.dragStart = null;
    document.removeEventListener('mousemove', this.onDragMove);
    document.removeEventListener('mouseup', this.stopDrag);
  };

  private resolveNames(ids: readonly number[] | undefined): readonly string[] {
    if (!ids?.length) {
      return [];
    }
    const byId = new Map(this.records().map((record) => [record.id, record.name]));
    return ids.map((id) => byId.get(id) ?? `#${id}`);
  }
}
