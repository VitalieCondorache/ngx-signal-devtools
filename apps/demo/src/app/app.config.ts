import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideSignalDevtools } from '@vitalie/ngx-signal-devtools';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Enabled automatically in development builds; inert in production and on the server.
    provideSignalDevtools({
      position: 'bottom-right',
      hotkey: 'ctrl+shift+s',
      captureReads: true,
    }),
  ],
};
