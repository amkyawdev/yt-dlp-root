/**
 * Splash screen — mirrors
 * lib/features/bootstrap/presentation/screens/splash_screen.dart.
 *
 * The splash is the bootstrap banner at the top of the page: a progress ring,
 * a neon progress bar and live throughput/verification readouts. It subscribes
 * to the BootstrapProvider and hides itself once booting finishes.
 */
import { formatBytes } from '../../../../core/utils/file_utils.js';

export class SplashScreen {
  /**
   * @param {HTMLElement} root the #boot element
   * @param {import('../providers/bootstrap_provider.js').BootstrapProvider} provider
   */
  constructor(root, provider) {
    this.root = root;
    this.provider = provider;

    this.ring = root.querySelector('#bootRing');
    this.pct = root.querySelector('#bootPct');
    this.bar = root.querySelector('#bootBar');
    this.stage = root.querySelector('#bootStage');
    this.status = root.querySelector('#bootStatus');
    this.speed = root.querySelector('#bootSpeed');
    this.size = root.querySelector('#bootSize');
    this.modelTag = root.querySelector('#bootModel');
    this.retry = root.querySelector('#bootRetry');
    this.skip = root.querySelector('#bootSkip');

    this._lastT = 0;
    this._lastB = 0;

    provider.onChange((s) => this.render(s));
  }

  set model(key) {
    if (this.modelTag) this.modelTag.textContent = `whisper · ${key}`;
  }

  show() {
    this.root.hidden = false;
    this.root.classList.remove('is-done');
  }

  hide() {
    this.root.classList.add('is-done');
  }

  render(s) {
    const pct = Math.round((s.ratio || 0) * 100);
    if (this.ring) this.ring.style.setProperty('--p', (s.ratio || 0).toFixed(3));
    if (this.pct) this.pct.innerHTML = `${pct}<sup>%</sup>`;
    if (this.bar) this.bar.style.width = `${pct}%`;
    if (this.stage) {
      this.stage.textContent =
        s.phase === 'model' ? `downloading whisper ${s.model}` :
        s.phase === 'manifest' ? 'checking manifest' :
        s.phase === 'ready' ? 'engine ready' :
        s.phase === 'skipped' ? 'preload skipped' :
        s.phase === 'error' ? 'preload skipped' : 'preparing engine';
    }
    if (this.status) this.status.textContent = s.status || '';

    if (s.phase === 'model' && s.total) {
      const now = performance.now();
      if (now - this._lastT > 300) {
        const inst = ((s.loaded - this._lastB) / 1048576) / ((now - this._lastT) / 1000);
        if (inst > 0 && this.speed) this.speed.textContent = `${inst.toFixed(1)} MB/s`;
        this._lastT = now;
        this._lastB = s.loaded;
      }
      if (this.size) this.size.textContent = `${formatBytes(s.loaded)} / ${formatBytes(s.total)}`;
    }

    if (s.phase === 'ready' || s.phase === 'error' || s.phase === 'skipped') {
      if (this.speed) this.speed.textContent = s.phase === 'ready' ? '0.0 MB/s' : '— MB/s';
      if (s.phase !== 'ready' && this.retry) this.retry.hidden = false;
      setTimeout(() => this.hide(), s.phase === 'ready' ? 700 : 1200);
    }
  }
}
