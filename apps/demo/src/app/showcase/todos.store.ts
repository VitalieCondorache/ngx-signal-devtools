import { Injectable, computed, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { devComputed, devEffect, devSignal, trackSignal } from '@vitalie/ngx-signal-devtools';

export interface Todo {
  readonly id: number;
  readonly title: string;
  readonly done: boolean;
}

export type TodoFilter = 'all' | 'open' | 'done';

/**
 * A small signal based store. Everything interesting for the devtools is here: an instrumented
 * collection, derived computeds and an effect that persists state.
 */
@Injectable({ providedIn: 'root' })
export class TodosStore {
  private readonly document = inject(DOCUMENT);
  private nextId = 3;

  /** Instrumented writable signal: reads, writes and no-op writes are counted. */
  readonly todos = devSignal<Todo[]>(
    [
      { id: 1, title: 'Install @vitalie/ngx-signal-devtools', done: true },
      { id: 2, title: 'Open the overlay with Ctrl + Shift + S', done: false },
    ],
    { name: 'todos' },
  );

  readonly filter = devSignal<TodoFilter>('all', { name: 'filter' });

  readonly visible = devComputed(
    () =>
      this.todos().filter((todo) =>
        this.filter() === 'all' ? true : this.filter() === 'done' ? todo.done : !todo.done,
      ),
    { name: 'visibleTodos' },
  );

  readonly remaining = devComputed(() => this.todos().filter((todo) => !todo.done).length, {
    name: 'remaining',
  });

  /** `trackSignal` observes a plain Angular signal without changing its identity. */
  readonly search = trackSignal(devSignal('', { name: 'search', skipOrigin: true }), {
    name: 'search',
  });

  private readonly persisted = devEffect(
    () => {
      const snapshot = this.todos();
      try {
        this.document.defaultView?.localStorage.setItem(
          'devtools-demo-todos',
          JSON.stringify(snapshot),
        );
      } catch {
        // Storage can be unavailable (private mode, SSR); the demo must not care.
      }
    },
    { name: 'persistTodos' },
  );

  /** A deliberately expensive computed, to make the "hot signal" diagnostic visible. */
  readonly expensive = devComputed(
    () => {
      let total = 0;
      const multiplier = Number(this.search() || 1);
      for (let index = 0; index < 20_000; index++) {
        total += Math.sqrt(index * multiplier);
      }
      return Math.round(total);
    },
    { name: 'expensiveScore' },
  );

  readonly stats = computed(() => {
    const all = this.todos();
    return {
      total: all.length,
      done: all.filter((todo) => todo.done).length,
      open: all.filter((todo) => !todo.done).length,
    };
  });

  add(title: string): void {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    this.todos.update((todos) => [...todos, { id: this.nextId++, title: trimmed, done: false }]);
  }

  toggle(id: number): void {
    this.todos.update((todos) =>
      todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)),
    );
  }

  remove(id: number): void {
    this.todos.update((todos) => todos.filter((todo) => todo.id !== id));
  }

  /** Writes an equal array instance: the devtools reports it as a no-op write. */
  writeSameValue(): void {
    this.todos.set([...this.todos()]);
  }

  stopPersisting(): void {
    this.persisted.destroy();
  }

  setFilter(filter: TodoFilter): void {
    this.filter.set(filter);
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  private readonly mirror = effect(() => {
    // Keeps the demo honest: the store also uses a plain Angular effect on purpose.
    void this.remaining();
  });
}
