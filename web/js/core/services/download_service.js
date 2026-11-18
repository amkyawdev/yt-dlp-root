/**
 * Download service — mirrors lib/core/services/download_service.dart.
 *
 * Fetches an artifact, reports progress, verifies its SHA-256 when one is
 * supplied, and persists it to the browser cache (Cache Storage + IndexedDB).
 */
import { AppConstants } from '../constants/app_constants.js';
import { CacheFailure, NetworkFailure } from '../errors/failures.js';
import { verifyChecksum } from '../utils/checksum_utils.js';

/* ── IndexedDB (fallback store; Cache Storage is preferred) ─────────────── */
const idb = {
  _p: null,
  open() {
    if (this._p) return this._p;
    this._p = new Promise((resolve, reject) => {
      if (!('indexedDB' in self)) return reject(new CacheFailure('IndexedDB unavailable'));
      const req = indexedDB.open(AppConstants.idbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(AppConstants.idbStore);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this._p;
  },
  async put(key, value) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppConstants.idbStore, 'readwrite');
      tx.objectStore(AppConstants.idbStore).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async get(key) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AppConstants.idbStore, 'readonly');
      const req = tx.objectStore(AppConstants.idbStore).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  },
  async clear() {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction(AppConstants.idbStore, 'readwrite');
      tx.objectStore(AppConstants.idbStore).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  },
};

/* ── public API ────────────────────────────────────────────────────────── */

/** Look up a previously cached artifact. Returns Uint8Array or null. */
export async function fromCache(key) {
  try {
    if ('caches' in self) {
      const c = await caches.open(AppConstants.cacheName);
      const hit = await c.match(key);
      if (hit) return new Uint8Array(await hit.arrayBuffer());
    }
  } catch {
    /* fall through to IndexedDB */
  }
  try {
    const buf = await idb.get(key);
    if (buf) return new Uint8Array(buf);
  } catch {
    /* cache miss */
  }
  return null;
}

/** Persist an artifact to both stores (best effort). */
export async function toCache(key, bytes) {
  const copy = bytes.slice();
  try {
    if ('caches' in self) {
      const c = await caches.open(AppConstants.cacheName);
      await c.put(key, new Response(copy, { headers: { 'Content-Type': 'application/octet-stream' } }));
    }
  } catch {
    /* Cache Storage unavailable */
  }
  try {
    await idb.put(key, copy.buffer);
  } catch {
    /* IndexedDB unavailable */
  }
}

/**
 * Download an artifact, using the cache when possible.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {string} [opts.sha256]   expected digest; verified when provided
 * @param {(p:{received:number,total:number,ratio:number,fromCache:boolean})=>void} [opts.onProgress]
 * @param {boolean} [opts.force]   bypass the cache
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Uint8Array>}
 */
export async function download(url, opts = {}) {
  const { onProgress, sha256, force = false, signal } = opts;

  if (!force) {
    const cached = await fromCache(url);
    if (cached) {
      onProgress?.({ received: cached.length, total: cached.length, ratio: 1, fromCache: true });
      if (sha256) await verifyChecksum(cached, sha256);
      return cached;
    }
  }

  let res;
  try {
    res = await fetch(url, { mode: 'cors', credentials: 'omit', signal });
  } catch (err) {
    throw new NetworkFailure(`cannot reach ${url}`, { cause: err });
  }
  if (!res.ok) throw new NetworkFailure(`HTTP ${res.status} for ${url}`);

  const total = Number(res.headers.get('Content-Length')) || 0;
  const chunks = [];
  let received = 0;

  if (res.body?.getReader) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.({ received, total, ratio: total ? received / total : 0, fromCache: false });
    }
  } else {
    const buf = new Uint8Array(await res.arrayBuffer());
    chunks.push(buf);
    received = buf.length;
    onProgress?.({ received, total: received, ratio: 1, fromCache: false });
  }

  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }

  if (sha256) await verifyChecksum(out, sha256);
  await toCache(url, out);
  return out;
}

/** Remove every cached artifact. */
export async function clearCache() {
  try {
    if ('caches' in self) await caches.delete(AppConstants.cacheName);
  } catch {
    /* ignore */
  }
  try {
    await idb.clear();
  } catch {
    /* ignore */
  }
}

/** Approximate size/count of the cache, for the status chip. */
export async function cacheStats() {
  let bytes = 0;
  let count = 0;
  try {
    if ('caches' in self) {
      const c = await caches.open(AppConstants.cacheName);
      for (const req of await c.keys()) {
        const r = await c.match(req);
        bytes += Number(r.headers.get('Content-Length')) || (await r.clone().arrayBuffer()).byteLength;
        count++;
      }
    }
  } catch {
    /* ignore */
  }
  return { bytes, count };
}
