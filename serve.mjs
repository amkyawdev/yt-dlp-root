/**
 * Dev server: static files + a SAME-ORIGIN proxy for /health and /proxy.
 *
 * Why same-origin matters: yt-dlp (in Pyodide) performs *synchronous* XHR, and
 * browsers forbid cross-origin synchronous XHR. Pointing the app at a Worker on
 * a different origin therefore fails with "Host is unreachable". Serving the
 * proxy from the same origin as the page fixes it.
 *
 * In production this same-origin surface is provided by a Cloudflare Worker
 * route on your own domain (e.g. example.com/proxy*) or by Pages Functions.
 * This script emulates that locally by forwarding to the deployed Worker.
 *
 *   node serve.mjs                 # http://localhost:12000
 *   PORT=8080 node serve.mjs
 *   UPSTREAM=https://other.workers.dev node serve.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'web');
const PORT = Number(process.env.PORT) || 12000;
const UPSTREAM = (process.env.UPSTREAM || 'https://yt-dlp.burme-vpn.workers.dev').replace(/\/$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

async function proxy(req, res, url) {
  const target = UPSTREAM + url.pathname + url.search;
  const headers = {};
  for (const h of ['range', 'content-type', 'accept']) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  const init = { method: req.method, headers, redirect: 'follow' };
  if (req.method === 'POST') init.body = await readBody(req);

  try {
    const r = await fetch(target, init);
    const out = {
      'content-type': r.headers.get('content-type') || 'application/octet-stream',
      'accept-ranges': 'bytes',
      'access-control-allow-origin': '*',
    };
    const len = r.headers.get('content-length');
    if (len) out['content-length'] = len;
    const cr = r.headers.get('content-range');
    if (cr) out['content-range'] = cr;
    res.writeHead(r.status, out);
    if (r.body) for await (const chunk of r.body) res.write(chunk);
    res.end();
  } catch (err) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`proxy error: ${err.message}`);
  }
}

async function serveStatic(res, url) {
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(ROOT, rel === '/' ? 'index.html' : rel);
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, 'index.html');
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('404');
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  }
}

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === '/health' || url.pathname === '/proxy') return proxy(req, res, url);
  return serveStatic(res, url);
}).listen(PORT, () => {
  console.log(`\n  AudioText Extractor  →  http://localhost:${PORT}`);
  console.log(`  same-origin proxy    →  ${UPSTREAM}\n`);
});
