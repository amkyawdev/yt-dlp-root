/**
 * Update provider — mirrors
 * lib/features/update/presentation/providers/update_provider.dart.
 *
 * Checks GitHub Releases for a newer build and exposes the result to the UI.
 * This is the web equivalent of the APK update check: it compares the deployed
 * build's version with the latest release tag and offers the download.
 */
import { AppConstants } from '../../../../core/constants/app_constants.js';
import { NetworkFailure } from '../../../../core/errors/failures.js';

const API = 'https://api.github.com';

/** Compare semver-ish tags ("v1.5.0"). Returns true when `latest` > `current`. */
export function isNewer(latest, current) {
  const norm = (v) => String(v || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = norm(latest);
  const b = norm(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

export class UpdateProvider {
  constructor({ repo = AppConstants.githubRepo, currentVersion = AppConstants.appVersion } = {}) {
    this.repo = repo;
    this.currentVersion = currentVersion;
    this.state = { checking: false, release: null, available: false, error: null };
  }

  /** Query the latest release. Never throws — records the error instead. */
  async check() {
    this.state.checking = true;
    this.state.error = null;
    try {
      const res = await fetch(`${API}/repos/${this.repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store',
      });
      if (res.status === 404) {
        this.state.release = null;
        this.state.available = false;
        return this.state;
      }
      if (!res.ok) throw new NetworkFailure(`GitHub API HTTP ${res.status}`);
      const release = await res.json();
      const tag = release.tag_name || release.name || '';
      this.state.release = {
        tag,
        name: release.name || tag,
        notes: (release.body || '').trim(),
        htmlUrl: release.html_url,
        publishedAt: release.published_at,
        assets: (release.assets || []).map((a) => ({
          name: a.name,
          size: a.size,
          url: a.browser_download_url,
        })),
      };
      this.state.available = isNewer(tag, this.currentVersion);
      return this.state;
    } catch (err) {
      this.state.error = String(err?.message ?? err);
      this.state.available = false;
      return this.state;
    } finally {
      this.state.checking = false;
    }
  }
}

export const updateProvider = new UpdateProvider();
