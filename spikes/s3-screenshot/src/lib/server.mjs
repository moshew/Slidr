// Tiny static file server for the spike. Serves the spike folder on 127.0.0.1 only.
// A real HTTP origin is used (rather than Playwright route interception) so that the
// fetches html-to-image makes for fonts and images are timed against a normal local origin.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm',
  '.map': 'application/json',
};

export async function startServer(rootDir) {
  const root = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const rel = decodeURIComponent(url.pathname);
      if (rel === '/favicon.ico') {
        res.writeHead(204).end();
        return;
      }
      if (rel === '/patched/html-to-image.js') {
        // Diagnostic only: html-to-image 1.11.13 with its font-size adjustment
        // (floor(px) - 0.1) switched off, to measure how much of the A-vs-B text
        // difference that single line causes.
        const src = fs.readFileSync(path.join(root, 'node_modules/html-to-image/dist/html-to-image.js'), 'utf8');
        const needle = '"font-size"===n&&o.endsWith("px")';
        if (!src.includes(needle)) {
          res.writeHead(500).end('patch target not found in html-to-image bundle');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.js'] });
        res.end(src.replace(needle, 'false'));
        return;
      }
      const file = path.resolve(root, '.' + rel);
      if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end('not found: ' + rel);
        return;
      }
      const body = fs.readFileSync(file);
      const headers = {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': body.length,
        // The sandboxed iframe has an opaque origin; allow it (and nothing else needs this).
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=3600',
        'Accept-Ranges': 'bytes',
      };
      // Minimal range support so <video> can seek.
      const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Number(range[2]) : body.length - 1;
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${body.length}`,
          'Content-Length': end - start + 1,
        });
        res.end(body.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, headers);
      res.end(body);
    } catch (err) {
      res.writeHead(500).end(String(err));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
