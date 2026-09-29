import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

/**
 * Serves a built Angular app over `127.0.0.1`, honouring the `<base href>` in `index.html` so the
 * same smoke test works for a project page (`/ngx-signal-devtools/`) and for a root deployment.
 */
export async function serveDirectory(directory, { port = 0 } = {}) {
  const root = resolve(directory);
  const indexHtml = await readFile(join(root, 'index.html'), 'utf8');
  const baseHref = /<base href="([^"]*)"/.exec(indexHtml)?.[1] ?? '/';
  const prefix = baseHref.startsWith('/') ? baseHref : `/${baseHref}`;

  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);

    if (!pathname.startsWith(prefix)) {
      response.writeHead(302, { location: prefix });
      response.end();
      return;
    }

    const relative = pathname.slice(prefix.length);
    const target = relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative;
    const file = resolve(join(root, target));

    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end('forbidden');
      return;
    }

    try {
      const info = await stat(file);
      if (!info.isFile()) {
        throw new Error('not a file');
      }
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-length': info.size,
        'content-type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
      });
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    }
  });

  await new Promise((ready) => server.listen(port, '127.0.0.1', ready));
  const { port: boundPort } = server.address();

  return {
    url: `http://127.0.0.1:${boundPort}${prefix}`,
    close: () => new Promise((closed) => server.close(closed)),
  };
}
