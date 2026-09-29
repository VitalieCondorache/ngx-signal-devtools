import { TestBed } from '@angular/core/testing';
import { provideSignalDevtools } from '@vitalie/ngx-signal-devtools';
import { App } from './app';

describe('App (demo showcase)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideSignalDevtools({ enabled: true, hotkey: false, globalKey: false })],
    }).compileComponents();
  });

  afterEach(() => {
    document.querySelector('sdt-overlay-host')?.remove();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the hero title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Angular signal devtools');
  });

  it('should show the instrumented todo list', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.todos li').length).toBeGreaterThan(0);
    expect(compiled.textContent).toContain('Install @vitalie/ngx-signal-devtools');
  });

  it('should add a todo through the instrumented draft signal', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const input = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = 'Published on npm';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    fixture.nativeElement.querySelector('form button').click();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Published on npm');
  });
});
