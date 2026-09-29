import { Injectable } from '@angular/core';

/**
 * Demo helper: keeps the ids of the timers the "leaky" widget deliberately forgets, so the demo can
 * clean them up on demand instead of forcing a page reload.
 */
@Injectable({ providedIn: 'root' })
export class LeakPool {
  private readonly timers = new Set<ReturnType<typeof setInterval>>();

  register(timer: ReturnType<typeof setInterval>): void {
    this.timers.add(timer);
  }

  unregister(timer: ReturnType<typeof setInterval>): void {
    this.timers.delete(timer);
  }

  get size(): number {
    return this.timers.size;
  }

  clearAll(): number {
    const cleared = this.timers.size;
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers.clear();
    return cleared;
  }
}
