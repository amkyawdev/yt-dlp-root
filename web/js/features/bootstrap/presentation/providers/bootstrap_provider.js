/**
 * Bootstrap provider — mirrors
 * lib/features/bootstrap/presentation/providers/bootstrap_provider.dart.
 *
 * Owns bootstrap state and drives the splash UI. The model preload is
 * best-effort: a failure never blocks the app, because the transcription engine
 * downloads the same model on demand through the same cache.
 */
import { bootstrapRepository } from '../../data/repositories/bootstrap_repository_impl.js';

export class BootstrapProvider {
  constructor(repo = bootstrapRepository) {
    this.repo = repo;
    this.state = {
      phase: 'idle',      // idle | manifest | model | ready | error | skipped
      model: null,
      loaded: 0,
      total: 0,
      ratio: 0,
      fromCache: false,
      status: '',
      error: null,
      manifestVersion: null,
    };
    this._listeners = new Set();
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(patch = {}) {
    Object.assign(this.state, patch);
    for (const fn of this._listeners) fn(this.state);
  }

  /** Load the manifest and warm the model cache. Never throws. */
  async boot(model = 'tiny') {
    try {
      this._emit({ phase: 'manifest', model, status: 'fetching manifest' });
      const manifest = await this.repo.loadManifest((s) => this._emit({ status: s }));
      this._emit({ manifestVersion: manifest.version });

      this._emit({ phase: 'model', status: 'downloading model' });
      const { bytes } = await this.repo.ensureModel(model, (p) =>
        this._emit({
          loaded: p.loaded ?? p.received ?? 0,
          total: p.total ?? 0,
          ratio: p.ratio ?? 0,
          fromCache: !!p.fromCache,
          status: p.fromCache ? 'restored from cache' : 'downloading model',
        })
      );

      this._emit({ phase: 'ready', ratio: 1, loaded: bytes, total: bytes, status: 'engine ready' });
      return true;
    } catch (err) {
      // Not fatal — the engine downloads the model on first transcription.
      this._emit({ phase: 'error', error: String(err?.message ?? err), status: 'preload unavailable' });
      return false;
    }
  }

  skip() {
    this._emit({ phase: 'skipped', status: 'preload skipped' });
  }
}

export const bootstrapProvider = new BootstrapProvider();
