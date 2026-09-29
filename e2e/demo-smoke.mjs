import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveDirectory } from './static-server.mjs';

/**
 * Browser smoke test for the built demo.
 *
 * Unit tests run against the library sources with manual change detection, so they cannot catch a
 * devtool that keeps the scheduler busy: a production build whose boot never completes still passes
 * `ng test`. This test boots the real optimised bundle in Chromium and fails when the page does not
 * reach the `load` event, crawls or throws.
 *
 * It also exercises the paths that only exist in a browser: the exposed global, the overlay chunk
 * opened with the default hotkey, and leak detection on a destroyed signal.
 *
 * Usage: npm run test:e2e (builds the library and the demo first).
 */

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const distDirectory = join(projectRoot, 'dist/demo/browser');

if (!existsSync(join(distDirectory, 'index.html'))) {
  console.error('✖ dist/demo/browser/index.html is missing — run `npm run build:demo` first.');
  process.exit(1);
}

const results = [];
const check = (name, passed, details = '') => {
  results.push({ details, name, passed: Boolean(passed) });
  console.log(`${passed ? '✔' : '✖'} ${name}${details ? ` — ${details}` : ''}`);
};

const read = (page) =>
  page.evaluate(() => ({
    cards: document.querySelectorAll('.card').length,
    counters: {
      reads: window.ngSignalDevtools.stats().reads,
      writes: window.ngSignalDevtools.stats().writes,
    },
    diagnostics: window.ngSignalDevtools.warnings().map((warning) => warning.code),
    heading: document.querySelector('h1')?.textContent?.trim() ?? null,
    overlay: {
      rows: document.querySelectorAll('sdt-overlay-host .sdt-table tbody tr').length,
      panel: (() => {
        const rect = document.querySelector('sdt-overlay-host .sdt-panel')?.getBoundingClientRect();
        return rect ? `${Math.round(rect.width)}×${Math.round(rect.height)}` : 'n/a';
      })(),
      tabs: document.querySelectorAll('sdt-overlay-host .sdt-tabs button').length,
    },
    privateGraph: document.querySelector('.tag')?.textContent?.trim() ?? null,
    tracked: window.ngSignalDevtools.stats().tracked,
  }));

const server = await serveDirectory(distDirectory);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const failures = [];
page.on('pageerror', (error) => failures.push(String(error).split('\n')[0]));
page.on('console', (message) => {
  if (message.type() === 'error') {
    failures.push(`console: ${message.text().slice(0, 160)}`);
  }
});

try {
  // 1. Booting the optimised bundle must be boring. A devtool that spins change detection would
  //    never fire `load`, which is exactly the regression this check exists for.
  const started = Date.now();
  let booted = true;
  try {
    await page.goto(server.url, { waitUntil: 'load', timeout: 20_000 });
  } catch {
    booted = false;
  }
  const bootMs = Date.now() - started;
  check(
    'the production bundle boots and fires the load event',
    booted && bootMs < 15_000,
    `${bootMs} ms`,
  );
  if (!booted) {
    throw new Error('the page never reached the load event');
  }

  // Bootstrapping is asynchronous: `load` fires before the AppRef consumed the environment
  // providers, so wait for the registry global and the first render instead of racing them.
  await page.waitForSelector('h1', { timeout: 15_000 });
  await page.waitForFunction(() => typeof window.ngSignalDevtools !== 'undefined', null, {
    timeout: 15_000,
  });

  const initial = await read(page);
  check(
    'the demo renders its content',
    initial.heading === 'Angular signal devtools' && initial.cards >= 4,
    `h1="${initial.heading}", ${initial.cards} cards`,
  );
  check('signals are tracked in the browser', initial.tracked > 0, `${initial.tracked} tracked`);
  check(
    'the private signal graph is readable in a production build',
    initial.privateGraph === 'private graph: readable',
    initial.privateGraph ?? 'n/a',
  );

  // 2. Instrumentation reacts to real interactions.
  await page.getByRole('button', { name: 'Write an equal value' }).click();
  await page.getByRole('button', { name: /^clicks:/ }).click();
  await page.waitForTimeout(300);
  const interacted = await read(page);
  check(
    'instrumented signals record reads and writes',
    interacted.counters.reads > 0 && interacted.counters.writes > 0,
    `${interacted.counters.reads} reads / ${interacted.counters.writes} writes`,
  );
  check(
    'an equal write is reported as a no-op',
    interacted.diagnostics.includes('noop-write'),
    interacted.diagnostics.join(', ') || 'no diagnostics',
  );

  // 3. The overlay is a lazy chunk opened with the configured hotkey.
  await page.keyboard.press('Control+Shift+S');
  await page.waitForSelector('sdt-overlay-host .sdt-table tbody tr', { timeout: 15_000 });
  const overlay = await read(page);
  check(
    'the overlay chunk loads and lists the tracked signals',
    overlay.overlay.rows > 0 && overlay.overlay.tabs === 4,
    `${overlay.overlay.rows} rows, ${overlay.overlay.tabs} tabs, panel ${overlay.overlay.panel}`,
  );

  // 4. Leak detection: the demo's widget interval keeps writing a destroyed signal.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Destroy widget' }).click();
  let leak = null;
  for (let attempt = 0; attempt < 20 && !leak; attempt++) {
    await page.waitForTimeout(500);
    leak = await page.evaluate(
      () =>
        window.ngSignalDevtools
          .warnings()
          .find((warning) => warning.code === 'write-after-destroy') ?? null,
    );
  }
  check(
    'a destroyed signal written by a leaked interval is flagged',
    leak?.name === 'widgetTicks',
    leak ? `${leak.code} on ${leak.name}` : 'no diagnostic within 10 s',
  );

  check(
    'no runtime error reached the page',
    failures.length === 0,
    failures.slice(0, 2).join(' | '),
  );
} catch (error) {
  check('the browser smoke run completed', false, String(error).split('\n')[0]);
  try {
    const artifactDirectory = join(projectRoot, 'test-results');
    await mkdir(artifactDirectory, { recursive: true });
    await page.screenshot({ path: join(artifactDirectory, 'smoke-failure.png') });
  } catch {
    // Screenshots are a convenience for CI; never let them mask the real failure.
  }
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((result) => !result.passed);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
