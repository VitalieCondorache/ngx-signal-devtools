import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  devEffect,
  devSignal,
  injectSignalDevtools,
  isInternalsAvailable,
} from '@vitalie27dev/ngx-signal-devtools';
import { LeakyWidget } from './showcase/leaky-widget';
import { LeakPool } from './showcase/leak-pool';
import { TodosStore, type TodoFilter } from './showcase/todos.store';

@Component({
  selector: 'app-root',
  imports: [LeakyWidget],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly devtools = injectSignalDevtools();
  protected readonly store = inject(TodosStore);
  private readonly leakPool = inject(LeakPool);

  protected readonly internalsAvailable = isInternalsAvailable();
  protected readonly filters: readonly TodoFilter[] = ['all', 'open', 'done'];

  /** Instrumented UI state: the overlay shows exactly what these buttons do. */
  protected readonly draft = devSignal('', { name: 'draft' });
  protected readonly showWidget = devSignal(true, { name: 'showWidget' });
  protected readonly leakyWidget = devSignal(true, { name: 'leakyWidget' });
  protected readonly clicks = devSignal(0, { name: 'clicks' });

  /** Kept in a plain signal on purpose, to contrast with the instrumented ones. */
  protected readonly plainSignal = signal(0);

  protected readonly leakedTimers = signal(0);

  protected readonly expensiveLabel = computed(() => `expensiveScore = ${this.store.expensive()}`);

  protected readonly summary = computed(() => {
    const stats = this.store.stats();
    return `${stats.open} open · ${stats.done} done · ${stats.total} total`;
  });

  /** An effect that reads nothing on purpose, so the overlay reports it. */
  private readonly pointless = devEffect(() => undefined, { name: 'pointlessEffect' });

  protected addTodo(): void {
    this.store.add(this.draft());
    this.draft.set('');
  }

  protected bumpClicks(): void {
    this.clicks.update((value) => value + 1);
  }

  protected toggleWidget(): void {
    this.showWidget.update((value) => !value);
  }

  protected clearLeakedTimers(): void {
    this.leakedTimers.set(this.leakPool.clearAll());
  }

  protected bumpPlainSignal(): void {
    this.plainSignal.update((value) => value + 1);
  }

  protected destroyPointlessEffect(): void {
    this.pointless.destroy();
  }
}
