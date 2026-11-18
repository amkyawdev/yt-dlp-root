/**
 * yt-dlp datasource — mirrors
 * lib/features/extraction/data/datasources/ytdlp_datasource.dart.
 *
 * Fronts the Pyodide worker: spawns it once, forwards resolve requests, and
 * streams the resolved audio via the Worker proxy.
 */
import { AppConstants, proxyBase } from '../../../../core/constants/app_constants.js';
import { ExtractionFailure, NetworkFailure } from '../../../../core/errors/failures.js';
import { proxyStream } from '../../../../core/services/cloudflare_service.js';

let worker = null;
let ready = null;
let version = null;
let seq = 0;
const pending = new Map();

function ensureWorker(onStatus) {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    worker = new Worker(new URL('./pyodide_worker.js', import.meta.url), { type: 'module' });

    worker.onmessage = (e) => {
      const m = e.data || {};
      switch (m.type) {
        case 'status': onStatus?.(m.message); break;
        case 'ready': version = m.version; resolve(); break;
        case 'resolved': pending.get(m.id)?.resolve(m.info); pending.delete(m.id); break;
        case 'resolve-error': pending.get(m.id)?.reject(new ExtractionFailure(m.message)); pending.delete(m.id); break;
        case 'error': if (!pending.size) reject(new ExtractionFailure(m.message)); break;
        default: break;
      }
    };
    worker.onerror = (e) => reject(new ExtractionFailure(e.message || 'Pyodide worker failed'));

    worker.postMessage({ type: 'init', worker: proxyBase(), pyodideUrl: AppConstants.pyodideUrl });
  });
  return ready;
}

export const YtdlpDatasource = {
  /** True once the Pyodide runtime and yt-dlp are loaded. */
  isReady: () => !!version,
  version: () => version,

  /** Resolve a YouTube URL to metadata + best audio stream. */
  async resolve(url, { client = 'android', onStatus } = {}) {
    await ensureWorker(onStatus);
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'resolve', id, url, client });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new ExtractionFailure('yt-dlp timed out', { stage: 'resolve' }));
        }
      }, AppConstants.resolveTimeoutMs);
    });
  },

  /** Stream the resolved audio stream to a Blob, reporting progress. */
  async downloadAudio(audio, onProgress, { signal } = {}) {
    try {
      return await proxyStream(audio.url, onProgress, { signal });
    } catch (err) {
      throw new NetworkFailure(`audio fetch failed: ${err.message}`, { cause: err, stage: 'download' });
    }
  },
};
