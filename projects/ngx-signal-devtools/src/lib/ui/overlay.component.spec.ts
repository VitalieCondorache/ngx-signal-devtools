import { TestBed } from '@angular/core/testing';
import { devComputed, devSignal } from '../core/instrument';
import { provideSignalDevtools } from '../provide-signal-devtools';
import { SIGNAL_DEVTOOLS_REGISTRY } from '../tokens';
import { SignalDevtoolsService } from '../signal-devtools.service';
import { SdtOverlayComponent } from './overlay.component';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideSignalDevtools({
        enabled: true,
        captureReads: true,
        hotkey: false,
        globalKey: false,
        refreshIntervalMs: 0,
      }),
    ],
  });

  const counter = TestBed.runInInjectionContext(() => devSignal(1, { name: 'counter' }));
  const doubled = TestBed.runInInjectionContext(() =>
    devComputed(() => counter() * 2, { name: 'doubled' }),
  );
  doubled();

  TestBed.inject(SIGNAL_DEVTOOLS_REGISTRY)!.syncFromInternals();

  const fixture = TestBed.createComponent(SdtOverlayComponent);
  fixture.detectChanges();

  return { fixture, counter, doubled, service: TestBed.inject(SignalDevtoolsService) };
}

function text(fixture: { nativeElement: HTMLElement }): string {
  return fixture.nativeElement.textContent ?? '';
}

function clickTab(fixture: { nativeElement: HTMLElement }, label: string): void {
  const tab = [...fixture.nativeElement.querySelectorAll('.sdt-tabs button')].find((button) =>
    button.textContent?.includes(label),
  );
  (tab as HTMLButtonElement).click();
}

describe('SdtOverlayComponent', () => {
  afterEach(() => {
    document.querySelector('sdt-overlay-host')?.remove();
    TestBed.resetTestingModule();
  });

  it('renders the tracked signals and the summary counters', () => {
    const { fixture } = setup();

    const rows = fixture.nativeElement.querySelectorAll('.sdt-table tbody tr');
    expect(rows).toHaveLength(2);
    expect(text(fixture)).toContain('counter');
    expect(text(fixture)).toContain('doubled');
    expect(text(fixture)).toContain('2 tracked');
  });

  it('switches between the activity, diagnostics and graph tabs', () => {
    const { fixture } = setup();

    clickTab(fixture, 'Events');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sdt-events')).toBeTruthy();

    clickTab(fixture, 'Warnings');
    fixture.detectChanges();
    expect(text(fixture)).toContain('No diagnostics');

    clickTab(fixture, 'Graph');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('svg .sdt-node')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('svg .sdt-edge')).toHaveLength(1);
  });

  it('shows diagnostics with severity and hint', async () => {
    const { fixture, counter } = setup();
    counter.set(1); // equal value: recorded as a no-op write
    await new Promise((resolve) => setTimeout(resolve, 40)); // notifications are throttled
    fixture.detectChanges();

    clickTab(fixture, 'Warnings');
    fixture.detectChanges();

    expect(text(fixture)).toContain('noop-write');
    expect(fixture.nativeElement.querySelector('.sdt-warning')).toBeTruthy();
  });

  it('selects a signal and shows dependencies, consumers and timings', () => {
    const { fixture } = setup();

    const row = fixture.nativeElement.querySelector(
      '.sdt-table tbody tr:nth-child(2)',
    ) as HTMLTableRowElement;
    row.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.sdt-detail')).toBeTruthy();
    expect(text(fixture)).toContain('deps (discovered)');
    expect(text(fixture)).toContain('counter');

    row.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sdt-detail')).toBeNull();
  });

  it('collapses the panel body', () => {
    const { fixture } = setup();
    const collapse = [...fixture.nativeElement.querySelectorAll('.sdt-header button')].find(
      (button) => button.textContent?.trim() === '▼',
    ) as HTMLButtonElement;

    collapse.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.sdt-tabs')).toBeNull();
  });

  it('freezes, clears and exports through the header actions', () => {
    const { fixture, service } = setup();
    const buttons = [...fixture.nativeElement.querySelectorAll('.sdt-header button')];

    (buttons[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.paused()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('▶');

    (buttons[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(service.records()).toHaveLength(0);
  });

  it('closes on Escape', () => {
    const { fixture, service } = setup();
    const hide = vi.spyOn(service, 'hide');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(hide).toHaveBeenCalled();
  });
});
