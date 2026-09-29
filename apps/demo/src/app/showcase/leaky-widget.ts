import { ChangeDetectionStrategy, Component, OnDestroy, inject, input } from '@angular/core';
import { devSignal } from '@vitalie/ngx-signal-devtools';
import { LeakPool } from './leak-pool';

/**
 * Demonstrates the failure mode the devtools is best at catching.
 *
 * In "leaky" mode the interval is never cancelled and keeps writing a signal owned by this
 * component, so once the widget is destroyed the overlay reports `write-after-destroy`. In "clean"
 * mode the interval is cancelled and nothing is reported.
 */
@Component({
  selector: 'app-leaky-widget',
  template: `
    <p>
      <strong>{{ label() }}</strong>
      — ticks: <code>{{ ticks() }}</code>
      @if (leaky()) {
        <span class="badge badge-warn">leaky</span>
      }
    </p>
    <p class="hint">
      @if (leaky()) {
        Interval is never cancelled. Destroy the widget and watch this signal keep ticking: the
        devtools reports “written after its owner was destroyed”.
      } @else {
        Interval is cancelled on destroy, so no diagnostic is raised.
      }
    </p>
  `,
  styles: `
    p {
      margin: 0 0 4px;
    }

    .hint {
      color: #6b7280;
      font-size: 0.8rem;
    }

    .badge {
      margin-left: 6px;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 0.7rem;
      background: #fee2e2;
      color: #991b1b;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeakyWidget implements OnDestroy {
  private readonly pool = inject(LeakPool);

  readonly label = input('widget');
  readonly leaky = input(true);

  readonly ticks = devSignal(0, { name: 'widgetTicks' });

  private readonly timer: ReturnType<typeof setInterval> = setInterval(
    () => this.ticks.update((value) => value + 1),
    1000,
  );

  ngOnDestroy(): void {
    if (this.leaky()) {
      this.pool.register(this.timer);
      return;
    }
    clearInterval(this.timer);
  }
}
