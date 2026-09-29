# Security policy

## Supported versions

Only the latest published minor of `@vitalie27dev/ngx-signal-devtools` is supported.

## Scope

This library is a development tool. It is enabled only when `isDevMode()` is true (or when explicitly
enabled) and it should never be active in a production build. Two things are worth knowing:

- The overlay renders inside your application and reads reactive graph metadata from `ɵSIGNAL`. It does
  not read application source code, network payloads or storage — except the values you allow it to
  preview (`captureValues`, truncated to a few characters).
- `snapshot()`/`download()` produce a JSON document you may share in a bug report. Review it before
  publishing it: it contains signal names, file paths and value previews.

## Reporting a vulnerability

Please open a private security advisory on GitHub
(`Security` → `Report a vulnerability`) instead of a public issue. Include the version, the Angular
version, a minimal reproduction and the impact you believe it has.

You can expect an initial response within a week. If the issue can be reproduced, a fix will be
released as a patch with a note in the changelog.
