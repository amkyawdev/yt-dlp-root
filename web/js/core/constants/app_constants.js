/**
 * App constants — Worker URL, R2/CDN URL, manifest URL.
 *
 * Mirrors lib/core/constants/app_constants.dart from the project structure.
 *
 * IMPORTANT (workerUrl): keep it empty so requests go to the *same origin* as
 * the page (`/proxy`, `/health`). yt-dlp runs in Pyodide and performs
 * synchronous XHR; browsers forbid cross-origin sync XHR, and Pyodide's urllib
 * shim also cannot cross origins reliably. In production, expose the Worker on
 * your own domain via a route (example.com/proxy*) or a Pages Function.
 *
 * Override before the app boots:
 *   <script>window.AUDIOTEXT_CONFIG = { workerUrl: 'https://x.workers.dev' };</script>
 */
const overrides = (typeof window !== 'undefined' && window.AUDIOTEXT_CONFIG) || {};

export const AppConstants = Object.freeze({
  appName: 'AudioText Extractor',

  // ── endpoints ──────────────────────────────────────────────────────────
  /** Cloudflare Worker base. Empty => same-origin. */
  workerUrl: overrides.workerUrl ?? '',
  /** CDN/R2 base that hosts manifest.json and the Whisper models. */
  cdnUrl: overrides.cdnUrl ?? 'https://cdn.amkyaw.dev/audiotext',
  /** GitHub repository used by the update checker. */
  githubRepo: overrides.githubRepo ?? 'amkyawdev/yt-dlp-root',

  // ── third-party runtime CDNs ───────────────────────────────────────────
  pyodideUrl: overrides.pyodideUrl ?? 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
  ffmpegBase: overrides.ffmpegBase ?? 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd',
  ffmpegUmd: overrides.ffmpegUmd ?? 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js',
  transformersUrl: overrides.transformersUrl ?? 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2',
  /** whisper.cpp WASM module; empty => use the ONNX Runtime Web engine. */
  whisperModuleUrl: overrides.whisperModuleUrl ?? '',

  // ── defaults ───────────────────────────────────────────────────────────
  defaultModel: overrides.defaultModel ?? 'tiny',
  defaultLanguage: 'auto',
  defaultAudioFormat: 'original',

  // ── limits ─────────────────────────────────────────────────────────────
  maxLocalFileBytes: 1500 * 1024 * 1024, // 1.5 GB
  maxLocalFileSeconds: 90 * 60,          // 90 min
  proxyTimeoutMs: 30_000,
  resolveTimeoutMs: 120_000,

  // ── storage keys ───────────────────────────────────────────────────────
  cacheName: 'audiotext-v1',
  idbName: 'audiotext-cache',
  idbStore: 'artifacts',
});

export const manifestUrl = () => `${AppConstants.cdnUrl}/manifest.json`;
export const proxyBase = () =>
  AppConstants.workerUrl || (typeof location !== 'undefined' ? location.origin : '');
export const proxyUrl = (target) => `${proxyBase()}/proxy?url=${encodeURIComponent(target)}`;
export const healthUrl = () => `${proxyBase()}/health`;
