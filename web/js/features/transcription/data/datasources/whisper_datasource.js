/**
 * Whisper datasource — mirrors
 * lib/features/transcription/data/datasources/whisper_datasource.dart.
 *
 * Runs Whisper fully in the browser. Two engines behind one interface:
 *
 *   whispercpp   → whisper.cpp compiled to WASM (Emscripten). Production target;
 *                  loads the module from AppConstants.whisperModuleUrl and a
 *                  ggml model from the CDN.
 *
 *   transformers → ONNX Runtime Web (WASM, or WebGPU when available) running
 *                  onnx-community/whisper-*. Zero-setup default because it is
 *                  reliably hosted on a public CDN and needs no custom build.
 *
 * Both accept 16 kHz mono Float32 PCM and return timestamped segments.
 */
import { AppConstants } from '../../../../core/constants/app_constants.js';
import { TranscriptionFailure } from '../../../../core/errors/failures.js';
import { download } from '../../../../core/services/download_service.js';
import { DEFAULT_MODELS } from '../../../bootstrap/domain/entities/app_manifest.js';

export const MODELS = DEFAULT_MODELS;

export const pickDevice = () =>
  typeof navigator !== 'undefined' && navigator.gpu ? 'webgpu' : 'wasm';

/* ── engine: transformers.js (ONNX Runtime Web) ─────────────────────────── */
let tjs = null;

async function loadTransformers() {
  if (tjs) return tjs;
  tjs = await import(`${AppConstants.transformersUrl}`);
  tjs.env.allowLocalModels = false;
  tjs.env.useBrowserCache = true; // transformers.js caches weights in Cache Storage
  // Single-threaded WASM avoids the SharedArrayBuffer/COOP+COEP requirement.
  try {
    tjs.env.backends.onnx.wasm.numThreads = 1;
    tjs.env.backends.onnx.wasm.proxy = false;
  } catch {
    /* backend not present until first use */
  }
  return tjs;
}

async function transformersEngine({ model, device, onProgress }) {
  const lib = await loadTransformers();
  const spec = MODELS[model] ?? MODELS.tiny;

  const build = (dev) =>
    lib.pipeline('automatic-speech-recognition', spec.hf, {
      device: dev,
      dtype: dev === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) {
          onProgress?.({ phase: 'model', loaded: p.loaded, total: p.total, ratio: p.loaded / p.total });
        } else if (p.status === 'done') {
          onProgress?.({ phase: 'model', loaded: spec.bytes, total: spec.bytes, ratio: 1 });
        }
      },
    });

  // `navigator.gpu` can exist while no adapter is actually available — fall back.
  let pipe;
  let usedDevice = device;
  try {
    pipe = await build(device);
  } catch (err) {
    if (device !== 'wasm') {
      onProgress?.({ phase: 'note', message: `${device} unavailable — falling back to wasm` });
      usedDevice = 'wasm';
      pipe = await build('wasm');
    } else {
      throw err;
    }
  }

  return {
    name: `transformers.js · ${spec.label} · ${usedDevice}`,
    async run(pcm, { language = 'auto', onSegment } = {}) {
      const out = await pipe(pcm, {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        language: language === 'auto' ? undefined : language,
        task: 'transcribe',
      });
      const chunks = out.chunks?.length ? out.chunks : [{ timestamp: [0, null], text: out.text ?? '' }];
      return chunks
        .map((c) => ({
          start: (c.timestamp?.[0] ?? 0) * 1000,
          end: (c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0) * 1000,
          text: (c.text ?? '').trim(),
        }))
        .filter((c) => c.text)
        .map((c) => (onSegment?.(c), c));
    },
  };
}

/* ── engine: whisper.cpp (WASM) ─────────────────────────────────────────── */
const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new TranscriptionFailure(`failed to load ${src}`));
    document.head.appendChild(s);
  });

async function whisperCppEngine({ model, onProgress }) {
  const spec = MODELS[model] ?? MODELS.tiny;

  await loadScript(AppConstants.whisperModuleUrl);
  const factory = window.WhisperCppModule;
  if (!factory) throw new TranscriptionFailure('whisper.cpp module did not register WhisperCppModule');

  const modelUrl = `${AppConstants.cdnUrl}/whisper/${spec.file}`;
  const weights = await download(modelUrl, {
    onProgress: (p) => onProgress?.({ phase: 'model', ...p }),
    sha256: spec.sha256,
  });

  const mod = await factory({
    print: () => {},
    printErr: () => {},
    wasmBinary: await (await fetch(`${AppConstants.cdnUrl}/whisper/whisper.wasm`)).arrayBuffer(),
  });
  mod.FS_createDataFile?.('/', spec.file, weights, true, true, true);
  mod.init?.(spec.file);

  return {
    name: `whisper.cpp · ${spec.label}`,
    async run(pcm, { onSegment, onProgress: segProgress } = {}) {
      const cues = [];
      mod.setProgressCallback?.((pct) => segProgress?.({ phase: 'transcribe', ratio: pct / 100 }));
      mod.transcribe?.(pcm, (seg) => {
        const cue = { start: seg.t0 * 10, end: seg.t1 * 10, text: (seg.text ?? '').trim() };
        if (cue.text) {
          cues.push(cue);
          onSegment?.(cue);
        }
      });
      if (!cues.length) throw new TranscriptionFailure('whisper.cpp returned no segments');
      return cues;
    },
  };
}

/* ── PCM helpers ───────────────────────────────────────────────────────── */

/** 16-bit little-endian PCM → Float32 in [-1, 1]. */
export function pcm16ToFloat32(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

/** Strip the WAV container and decode the `data` chunk to Float32. */
export function wavToFloat32(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 12;
  while (off + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
    const size = view.getUint32(off + 4, true);
    if (id === 'data') return pcm16ToFloat32(bytes.subarray(off + 8, off + 8 + size));
    off += 8 + size + (size % 2);
  }
  return pcm16ToFloat32(bytes.subarray(44));
}

/* ── datasource ────────────────────────────────────────────────────────── */

let engine = null;
let engineKey = '';

export const WhisperDatasource = {
  MODELS,

  /** Load (and cache) a transcription engine. */
  async ensureEngine({ model = AppConstants.defaultModel, engine: kind, device = pickDevice(), onProgress } = {}) {
    const type = kind ?? (AppConstants.whisperModuleUrl ? 'whispercpp' : 'transformers');
    const key = `${type}:${model}:${device}`;
    if (engine && engineKey === key) return engine;

    if (type === 'whispercpp') {
      try {
        engine = await whisperCppEngine({ model, onProgress });
      } catch (err) {
        console.warn('[whisper] whisper.cpp unavailable, falling back:', err);
        onProgress?.({ phase: 'note', message: 'whisper.cpp unavailable — using WASM fallback' });
        engine = await transformersEngine({ model, device, onProgress });
      }
    } else {
      engine = await transformersEngine({ model, device, onProgress });
    }
    engineKey = key;
    return engine;
  },

  /** Transcribe 16 kHz mono WAV bytes. */
  async transcribe(wavBytes, opts = {}) {
    const eng = await this.ensureEngine(opts);
    const pcm = wavToFloat32(wavBytes);
    if (!pcm.length) throw new TranscriptionFailure('audio contains no samples');
    const segments = await eng.run(pcm, opts);
    return { segments, engine: eng.name };
  },

  engineName: () => engine?.name ?? null,
};
