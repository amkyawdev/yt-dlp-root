/**
 * AudioText Extractor — deployed Worker (Static Assets + same-origin proxy).
 *
 * This single Worker *is* the published application:
 *   • serves the static app from ./web via the ASSETS binding
 *   • serves /health and /proxy from the SAME ORIGIN as the page
 *
 * Why same-origin matters: yt-dlp runs in Pyodide and issues synchronous XHR,
 * which browsers forbid cross-origin. A separate *.workers.dev origin would
 * fail with "Host is unreachable"; serving the proxy here avoids that.
 *
 * Scope of the proxy is deliberately tiny — CORS, validation, and a YouTube
 * passthrough. It does NOT run yt-dlp / FFmpeg / Whisper and does NOT store files.
 */

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtubei.googleapis.com',
  'youtube-nocookie.com',
]);

const MAX_URL_LEN = 2048;
const PROXY_TIMEOUT_MS = 30_000;

/** True only for explicitly allowed hosts (ignoring a leading `www.`). */
function hostAllowed(hostname) {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  if (ALLOWED_HOSTS.has(h)) return true;
  // googlevideo CDN uses per-region subdomains, e.g. r3---sn-abc.googlevideo.com
  return h === 'googlevideo.com' || h.endsWith('.googlevideo.com');
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, X-Requested-With',
    'Access-Control-Expose-Headers':
      'Content-Length, Content-Range, Accept-Ranges, X-Upstream-Status',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (request, body, status) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) },
  });

async function handleProxy(request, url) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json(request, { error: 'method_not_allowed' }, 405);
  }

  const target = url.searchParams.get('url');
  if (!target) return json(request, { error: 'missing_url' }, 400);
  if (target.length > MAX_URL_LEN) return json(request, { error: 'url_too_long' }, 414);

  let upstream;
  try {
    upstream = new URL(target);
  } catch {
    return json(request, { error: 'invalid_url' }, 400);
  }
  if (upstream.protocol !== 'https:') return json(request, { error: 'https_only' }, 400);
  if (!hostAllowed(upstream.hostname)) {
    return json(request, { error: 'host_not_allowed', host: upstream.hostname }, 403);
  }

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

    // Stream straight through — never buffer whole media files.
    const out = new Headers(corsHeaders(request));
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
      request,
      { error: aborted ? 'upstream_timeout' : 'upstream_failed', message: String(err?.message ?? err) },
      502,
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
      return json(request, { ok: true, ts: Date.now(), edge: request.cf?.colo ?? null }, 200);
    }

    if (url.pathname === '/proxy') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
      return handleProxy(request, url);
    }

    // Everything else: the static application (assets binding).
    return env.ASSETS.fetch(request);
  },
};
