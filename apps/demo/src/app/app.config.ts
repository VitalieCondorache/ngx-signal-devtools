import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideSignalDevtools } from '@vitalie27dev/ngx-signal-devtools';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // The showcase app is the documentation for the library, so the devtools stay enabled in the
    // production build too (this is what runs on GitHub Pages). In a real application leave the
    // option out: the default is `isDevMode()`, which keeps production bundles free of the registry.
    provideSignalDevtools({
      enabled: true,
      position: 'bottom-right',
      hotkey: 'ctrl+shift+s',
      captureReads: true,
    }),
  ],
};
