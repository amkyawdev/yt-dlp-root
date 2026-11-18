/**
 * AppManifest entity — mirrors lib/features/bootstrap/domain/entities/app_manifest.dart.
 *
 * Shape of manifest.json (hosted on R2/CDN):
 * {
 *   "version": "1.5.0",
 *   "models": {
 *     "tiny":  { "file": "ggml-tiny-q5_1.bin",  "bytes": 44040192, "sha256": "…" },
 *     "base":  { "file": "ggml-base-q5_1.bin",  "bytes": 62914560, "sha256": "…" },
 *     "small": { "file": "ggml-small-q5_1.bin", "bytes": 199229440, "sha256": "…" }
 *   },
 *   "runtime": { "ffmpeg": "6.1.1", "ytdlp": "2026.10.26" }
 * }
 */

/** The model table the app ships with, used when manifest.json is missing. */
export const DEFAULT_MODELS = Object.freeze({
  tiny: { label: 'tiny · q5_1', file: 'ggml-tiny-q5_1.bin', bytes: 42 * 1024 * 1024, hf: 'onnx-community/whisper-tiny' },
  base: { label: 'base · q5_1', file: 'ggml-base-q5_1.bin', bytes: 60 * 1024 * 1024, hf: 'onnx-community/whisper-base' },
  small: { label: 'small · q5_1', file: 'ggml-small-q5_1.bin', bytes: 190 * 1024 * 1024, hf: 'onnx-community/whisper-small' },
});

export class AppManifest {
  constructor({ version = 'unknown', models = {}, runtime = {}, source = 'built-in' } = {}) {
    this.version = version;
    this.runtime = runtime;
    this.source = source;
    // Merge the manifest's model entries over the built-in table so a partial
    // manifest still yields a complete, usable set.
    this.models = { ...DEFAULT_MODELS };
    for (const [key, spec] of Object.entries(models)) {
      this.models[key] = { ...(DEFAULT_MODELS[key] || {}), ...spec };
    }
  }

  static fromJson(data, source) {
    if (!data || typeof data !== 'object') throw new Error('malformed manifest');
    return new AppManifest({ ...data, source });
  }

  model(key) {
    return this.models[key] ?? this.models.tiny;
  }

  get isFallback() {
    return this.source === 'built-in';
  }
}
