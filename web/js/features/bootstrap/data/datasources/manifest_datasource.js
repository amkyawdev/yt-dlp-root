/**
 * Manifest datasource — mirrors
 * lib/features/bootstrap/data/datasources/manifest_datasource.dart.
 */
import { manifestUrl } from '../../../../core/constants/app_constants.js';
import { NetworkFailure } from '../../../../core/errors/failures.js';
import { AppManifest } from '../../domain/entities/app_manifest.js';

export const ManifestDatasource = {
  /** Fetch and parse manifest.json from the CDN. Throws on network/parse error. */
  async fetch() {
    const url = manifestUrl();
    let res;
    try {
      res = await fetch(url, { cache: 'no-cache' });
    } catch (err) {
      throw new NetworkFailure(`manifest unreachable (${err?.message ?? err})`, { cause: err });
    }
    if (!res.ok) throw new NetworkFailure(`manifest HTTP ${res.status}`);
    const data = await res.json();
    return AppManifest.fromJson(data, url);
  },
};
