import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { devSignal } from './core/instrument';
import { provideSignalDevtools, injectSignalDevtools } from './provide-signal-devtools';
import { matchesHotkey } from './tokens';

function configure(config: Parameters<typeof provideSignalDevtools>[0]): void {
  TestBed.configureTestingModule({ providers: [provideSignalDevtools(config)] });
}

function handle() {
  return TestBed.runInInjectionContext(() => injectSignalDevtools());
}

describe('provideSignalDevtools', () => {
  afterEach(() => {
    document.querySelector('sdt-overlay-host')?.remove();
    TestBed.resetTestingModule();
  });

  it('mirrors registry state into signals', async () => {
    configure({ enabled: true, hotkey: false, globalKey: false, refreshIntervalMs: 0 });
    const devtools = handle();
    const counter = TestBed.runInInjectionContext(() => devSignal(1, { name: 'counter' }));

    expect(devtools.open()).toBe(false);
    expect(devtools.records()).toHaveLength(1);

    counter.set(2);
    await Promise.resolve();

    expect(devtools.stats().writes).toBe(1);
  });

  it('mounts the overlay lazily into document.body and renders tracked signals', async () => {
    configure({ enabled: true, hotkey: false, globalKey: false, refreshIntervalMs: 0 });
    const devtools = handle();
    TestBed.runInInjectionContext(() => devSignal(1, { name: 'counter' }));

    expect(document.querySelector('sdt-overlay-host')).toBeNull();

    await devtools.show();

    const host = document.querySelector('sdt-overlay-host');
    expect(host).toBeTruthy();
    expect(host!.textContent).toContain('ngx-signal-devtools');
    expect(host!.textContent).toContain('counter');
    expect(devtools.open()).toBe(true);

    await devtools.toggle();

    expect(devtools.open()).toBe(false);
    expect(document.querySelector('sdt-overlay-host')).toBeNull();
  });

  it('toggles with the configured hotkey and exposes a global handle', async () => {
    configure({
      enabled: true,
      hotkey: 'ctrl+shift+s',
      globalKey: 'ngSignalDevtools',
      refreshIntervalMs: 0,
    });
    const devtools = handle();

    expect(window.ngSignalDevtools).toBeDefined();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, shiftKey: true }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(devtools.open()).toBe(true);

    devtools.hide();
  });

  it('stays completely inert when disabled', async () => {
    configure({ enabled: false });
    const devtools = handle();
    const counter = TestBed.runInInjectionContext(() => devSignal(1, { name: 'untracked' }));

    counter.set(2);
    await devtools.show();

    expect(devtools.records()).toHaveLength(0);
    expect(devtools.stats().tracked).toBe(0);
    expect(document.querySelector('sdt-overlay-host')).toBeNull();
    expect(window.ngSignalDevtools).toBeUndefined();
  });

  it('produces a serializable snapshot', () => {
    configure({ enabled: true, hotkey: false, globalKey: false, refreshIntervalMs: 0 });
    const devtools = handle();
    TestBed.runInInjectionContext(() => devSignal(1, { name: 'counter' }));

    const snapshot = devtools.snapshot();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.angularVersion).toContain('22');
    expect(snapshot.signals).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(snapshot)).signals).toHaveLength(1);
  });

  it('clears and freezes the collected data', async () => {
    configure({ enabled: true, hotkey: false, globalKey: false, refreshIntervalMs: 0 });
    const devtools = handle();
    TestBed.runInInjectionContext(() => devSignal(1, { name: 'counter' }));

    devtools.pause();
    await Promise.resolve();
    expect(devtools.paused()).toBe(true);

    devtools.resume();
    devtools.clear();
    await Promise.resolve();

    expect(devtools.paused()).toBe(false);
    expect(devtools.records()).toHaveLength(0);
  });

  it('renders the overlay inside the configured document', async () => {
    configure({ enabled: true, hotkey: false, globalKey: false, refreshIntervalMs: 0 });
    const devtools = handle();
    const documentRef = TestBed.inject(DOCUMENT);

    await devtools.show();

    expect(documentRef.body.querySelector('sdt-overlay-host')).toBeTruthy();
    devtools.hide();
  });
});

describe('matchesHotkey', () => {
  it('requires the exact modifier combination', () => {
    const event = new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, shiftKey: true });
    expect(matchesHotkey(event, 'ctrl+shift+s')).toBe(true);
    expect(matchesHotkey(event, 'ctrl+s')).toBe(false);
    expect(matchesHotkey(event, 'shift+s')).toBe(false);
    expect(matchesHotkey(event, 'ctrl+shift+x')).toBe(false);
    expect(matchesHotkey(event, '')).toBe(false);
  });
});
