/**
 * AudioText Extractor — Cloudflare Worker
 *
 * Scope is deliberately tiny (see README "Architecture"):
 *   1. CORS headers for the browser app.
 *   2. Request validation.
 *   3. A transparent proxy for YouTube requests so yt-dlp (running in the
 *      browser via Pyodide) is not blocked by CORS.
 *
 * This Worker does NOT run yt-dlp / FFmpeg / Whisper and does NOT store files.
 * Everything heavy happens client-side.
 */

/* Hosts the proxy may reach. Anything else is rejected so the Worker cannot be
 * abused as an open relay. */
const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtubei.googleapis.com',
  'youtube-nocookie.com',
]);

/* Origins allowed to call this Worker from a browser. */
const ALLOWED_ORIGINS = [
  'http://localhost:12000',
  'http://localhost:5173',
  'http://127.0.0.1:12000',
  'http://127.0.0.1:5173',
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.workers\.dev$/,
  /^https:\/\/[a-z0-9-]+\.prod-runtime\.all-hands\.dev$/,
];

const MAX_URL_LEN = 2048;
const PROXY_TIMEOUT_MS = 30_000;

const isAllowedOrigin = (origin) =>
  !!origin &&
  ALLOWED_ORIGINS.some((rule) => (typeof rule === 'string' ? rule === origin : rule.test(origin)));

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, X-Requested-With',
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges, X-Upstream-Status',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });

/** True only for explicitly allowed hosts (ignoring a leading `www.`). */
function hostAllowed(hostname) {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  if (ALLOWED_HOSTS.has(h)) return true;
  // googlevideo CDN uses per-region subdomains, e.g. r3---sn-abc.googlevideo.com
  return h === 'googlevideo.com' || h.endsWith('.googlevideo.com');
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Liveness probe used by the frontend "worker health" chip.
    if (url.pathname === '/health') {
      return json({ ok: true, ts: Date.now(), edge: request.cf?.colo ?? null }, 200, origin);
    }

    if (url.pathname === '/proxy') {
      return handleProxy(request, url, origin, ctx);
    }

    return json({ error: 'not_found', hint: 'GET /health or GET /proxy?url=' }, 404, origin);
  },
};

async function handleProxy(request, url, origin) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, origin);
  }

  const target = url.searchParams.get('url');
  if (!target) return json({ error: 'missing_url' }, 400, origin);
  if (target.length > MAX_URL_LEN) return json({ error: 'url_too_long' }, 414, origin);

  let upstream;
  try {
    upstream = new URL(target);
  } catch {
    return json({ error: 'invalid_url' }, 400, origin);
  }

  if (upstream.protocol !== 'https:') return json({ error: 'https_only' }, 400, origin);
  if (!hostAllowed(upstream.hostname)) {
    return json({ error: 'host_not_allowed', host: upstream.hostname }, 403, origin);
  }

  /* Forward a small, safe subset of headers and always send a desktop UA so
   * YouTube serves the standard web player. */
  const headers = new Headers({
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
  });
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);
  if (request.method === 'POST') {
    const ct = request.headers.get('Content-Type');
    if (ct) headers.set('Content-Type', ct);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await fetch(upstream.toString(), {
      method: request.method,
      headers,
      body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);

    // Stream the body straight through — never buffer whole media files.
    const out = new Headers(corsHeaders(origin));
    for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set('X-Upstream-Status', String(res.status));
    out.set('Cache-Control', 'no-store');

    return new Response(res.body, { status: res.status, headers: out });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err?.name === 'AbortError';
    return json(
      { error: aborted ? 'upstream_timeout' : 'upstream_failed', message: String(err?.message ?? err) },
      502,
      origin,
    );
  }
}
