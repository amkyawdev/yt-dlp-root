/**
 * Bootstrap repository — mirrors
 * lib/features/bootstrap/data/repositories/bootstrap_repository_impl.dart.
 *
 * Responsibilities:
 *   • load the manifest (falling back to the built-in model table)
 *   • ensure the Whisper model is present in the browser cache
 */
import { ManifestDatasource } from '../datasources/manifest_datasource.js';
import { AppManifest } from '../../domain/entities/app_manifest.js';
import { download, fromCache } from '../../../../core/services/download_service.js';
import { AppConstants } from '../../../../core/constants/app_constants.js';

export class BootstrapRepositoryImpl {
  constructor({ datasource = ManifestDatasource } = {}) {
    this.datasource = datasource;
    this._manifest = null;
  }

  /**
   * Load the manifest, degrading to the built-in table on any failure.
   * @param {(msg:string)=>void} [onStatus]
   */
  async loadManifest(onStatus) {
    onStatus?.('fetching manifest');
    try {
      this._manifest = await this.datasource.fetch();
    } catch (err) {
      onStatus?.(`manifest unavailable (${err.message}) — using defaults`);
      this._manifest = new AppManifest();
    }
    return this._manifest;
  }

  /** The last manifest loaded (or a default one). */
  get manifest() {
    return this._manifest ?? new AppManifest();
  }

  modelSpec(key) {
    return this.manifest.model(key);
  }

  /** URL for a model file, from the CDN. */
  modelUrl(key) {
    return `${AppConstants.cdnUrl}/whisper/${this.modelSpec(key).file}`;
  }

  /** True when the model is already cached locally. */
  async isCached(key) {
    return (await fromCache(this.modelUrl(key))) !== null;
  }

  /**
   * Download the model into the browser cache, verifying its checksum when the
   * manifest supplies one.
   * @param {string} key tiny|base|small
   * @param {(p:{received:number,total:number,ratio:number,fromCache:boolean})=>void} onProgress
   */
  async ensureModel(key, onProgress) {
    const spec = this.modelSpec(key);
    const url = this.modelUrl(key);
    const bytes = await download(url, { onProgress, sha256: spec.sha256 });
    return { bytes: bytes.length, url, spec };
  }
}

export const bootstrapRepository = new BootstrapRepositoryImpl();
