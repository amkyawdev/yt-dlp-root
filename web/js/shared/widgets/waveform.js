/**
 * Waveform widget — audio preview with a real peak envelope.
 *
 * Decodes the acquired audio with the Web Audio API to draw the actual
 * waveform, and plays it back through a hidden <audio> element.
 */
const N = 76;
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Waveform {
  constructor(root) {
    this.root = root;
    this.wave = root.querySelector('#wave');
    this.bars = root.querySelector('#waveBars');
    this.play = root.querySelector('#wavePlay');
    this.audio = root.querySelector('#waveAudio');
    this.time = root.querySelector('#waveTime');
    this.bitrate = root.querySelector('#waveBitrate');
    this.specBar = root.querySelector('#waveSpecBar');
    this.meta = root.querySelector('#waveMeta');
    this.url = null;

    this.play.addEventListener('click', () => this.togglePlay());
    this.audio.addEventListener('ended', () => this._setPlaying(false));
    this.audio.addEventListener('timeupdate', () => {
      this.time.textContent = `${fmt(this.audio.currentTime)} / ${fmt(this.audio.duration || 0)}`;
      if (this.audio.duration) this.specBar.style.width = `${(this.audio.currentTime / this.audio.duration) * 100}%`;
    });

    this._draw(null);
  }

  _draw(peaks) {
    this.bars.innerHTML = '';
    for (let i = 0; i < N; i++) {
      const b = document.createElement('i');
      const v = peaks ? peaks[Math.floor((i / N) * peaks.length)] : 0.12 + Math.random() * 0.2;
      b.style.height = `${Math.max(6, Math.min(100, v * 100))}%`;
      b.style.setProperty('--i', i);
      this.bars.appendChild(b);
    }
  }

  async _peaks(blob) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await ac.decodeAudioData((await blob.arrayBuffer()).slice(0));
      const ch = decoded.getChannelData(0);
      const size = Math.max(1, Math.floor(ch.length / N));
      const peaks = new Float32Array(N);
      let max = 0;
      for (let i = 0; i < N; i++) {
        let peak = 0;
        for (let j = 0; j < size; j += 40) peak = Math.max(peak, Math.abs(ch[i * size + j] || 0));
        peaks[i] = peak;
        max = Math.max(max, peak);
      }
      if (max) for (let i = 0; i < N; i++) peaks[i] /= max;
      ac.close();
      return peaks;
    } catch {
      return null;
    }
  }

  /** Load a playable blob into the preview. */
  load(blob, { label = 'ready', bitrate = null } = {}) {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = URL.createObjectURL(blob);
    this.audio.src = this.url;
    this.wave.dataset.state = 'ready';
    this.play.disabled = false;
    if (this.meta) this.meta.textContent = label;
    if (this.bitrate) this.bitrate.textContent = bitrate ? `${bitrate} kbps` : (blob.type || 'audio');
    this._peaks(blob).then((p) => this._draw(p));
  }

  _setPlaying(on) {
    this.wave.classList.toggle('is-playing', on);
    this.play.innerHTML = on
      ? '<svg viewBox="0 0 24 24" class="ico"><path d="M8 5h3v14H8zM13 5h3v14h-3z"/></svg>'
      : '<svg viewBox="0 0 24 24" class="ico"><path d="M7 4l13 8-13 8z"/></svg>';
  }

  async togglePlay() {
    if (this.audio.paused) {
      try {
        await this.audio.play();
        this._setPlaying(true);
      } catch {
        /* autoplay blocked */
      }
    } else {
      this.audio.pause();
      this._setPlaying(false);
    }
  }

  reset() {
    this.audio.pause();
    this._setPlaying(false);
    this.play.disabled = true;
    this.wave.dataset.state = 'empty';
    this._draw(null);
    this.time.textContent = '00:00 / 00:00';
    if (this.bitrate) this.bitrate.textContent = '— kbps';
    this.specBar.style.width = '0%';
  }
}
