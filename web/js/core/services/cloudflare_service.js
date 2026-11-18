/**
 * Cloudflare Worker service — mirrors lib/core/services/cloudflare_service.dart.
 *
 * The Worker is deliberately thin: CORS, validation, and a YouTube proxy. This
 * client only knows how to reach it.
 */
import { AppConstants, proxyUrl as buildProxyUrl, healthUrl } from '../constants/app_constants.js';
import { ProxyFailure, NetworkFailure } from '../errors/failures.js';

/** Liveness probe. Never throws — returns a structured result. */
export async function ping(timeoutMs = 8000) {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(healthUrl(), { cache: 'no-store', signal: ctrl.signal });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) return { ok: false, ms, error: `HTTP ${res.status}` };
    const body = await res.json();
    return { ok: !!body.ok, ms, edge: body.edge ?? null };
  } catch (err) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a proxied resource as text. */
export async function proxyText(target, init = {}) {
  const res = await fetch(buildProxyUrl(target), init);
  if (!res.ok) throw new ProxyFailure(`proxy ${res.status} for ${target}`);
  return res.text();
}

/** Fetch a proxied resource as bytes. */
export async function proxyBytes(target, init = {}) {
  const res = await fetch(buildProxyUrl(target), init);
  if (!res.ok) throw new ProxyFailure(`proxy ${res.status} for ${target}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Stream a proxied resource with progress reporting.
 * @param {string} target
 * @param {(p:{received:number,total:number,ratio:number})=>void} [onProgress]
 * @param {{signal?:AbortSignal}} [opts]
 * @returns {Promise<{blob:Blob, bytes:number, contentType:string}>}
 */
export async function proxyStream(target, onProgress, { signal } = {}) {
  const res = await fetch(buildProxyUrl(target), { signal });
  if (!res.ok) throw new ProxyFailure(`proxy ${res.status} for ${target}`);

  const total = Number(res.headers.get('Content-Length')) || 0;
  const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
  const chunks = [];
  let received = 0;

  if (res.body?.getReader) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.({ received, total, ratio: total ? received / total : 0 });
    }
  } else {
    const buf = new Uint8Array(await res.arrayBuffer());
    chunks.push(buf);
    received = buf.length;
    onProgress?.({ received, total: received, ratio: 1 });
  }

  return { blob: new Blob(chunks, { type: contentType }), bytes: received, contentType };
}

export const proxyUrl = buildProxyUrl;
export const workerBase = () => AppConstants.workerUrl || location.origin;

export { NetworkFailure, ProxyFailure };
