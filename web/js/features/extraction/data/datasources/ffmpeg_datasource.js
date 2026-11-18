/**
 * ffmpeg.wasm datasource.
 *
 * Loads the @ffmpeg/ffmpeg UMD bundle on demand and exposes:
 *   • extractToWav() — decode any media file to 16 kHz mono PCM WAV
 *   • transcode()    — re-encode to a shareable format (e.g. mp3)
 *
 * `toBlobURL` is required because ffmpeg.wasm instantiates its core inside a
 * Worker, and the core files are fetched cross-origin from the CDN.
 */
import { AppConstants } from '../../../../core/constants/app_constants.js';
import { ExtractionFailure } from '../../../../core/errors/failures.js';
import { extOf } from '../../../../core/utils/file_utils.js';

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new ExtractionFailure(`failed to load ${src}`));
    document.head.appendChild(s);
  });

async function toBlobURL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new ExtractionFailure(`failed to fetch ${url} (HTTP ${res.status})`);
  return URL.createObjectURL(await res.blob());
}

let ffmpeg = null;
let loading = null;

export const FfmpegDatasource = {
  isLoaded: () => !!ffmpeg,

  /** Lazily instantiate FFmpeg and wire a progress handler. */
  async ensure(onProgress) {
    if (ffmpeg) {
      if (onProgress) {
        if (ffmpeg._h) ffmpeg.off('progress', ffmpeg._h);
        ffmpeg._h = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress || 0)));
        ffmpeg.on('progress', ffmpeg._h);
      }
      return ffmpeg;
    }
    if (loading) return loading;

    loading = (async () => {
      if (!window.FFmpegWASM?.FFmpeg) await loadScript(AppConstants.ffmpegUmd);
      const lib = window.FFmpegWASM;
      if (!lib?.FFmpeg) throw new ExtractionFailure('ffmpeg.wasm failed to initialise');
      const inst = new lib.FFmpeg();
      const coreURL = await toBlobURL(`${AppConstants.ffmpegBase}/ffmpeg-core.js`);
      const wasmURL = await toBlobURL(`${AppConstants.ffmpegBase}/ffmpeg-core.wasm`);
      await inst.load({ coreURL, wasmURL });
      if (onProgress) {
        inst._h = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress || 0)));
        inst.on('progress', inst._h);
      }
      ffmpeg = inst;
      return inst;
    })();

    try {
      return await loading;
    } finally {
      loading = null;
    }
  },

  /**
   * Extract the audio track and encode it to 16 kHz mono WAV — exactly what
   * Whisper expects.
   * @returns {Promise<Uint8Array>}
   */
  async extractToWav(file, onProgress) {
    const ff = await this.ensure(onProgress);
    const inName = `input${extOf(file.name || 'media.bin')}`;
    const outName = 'audio_16k.wav';
    await ff.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
    try {
      await ff.exec(['-i', inName, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', outName]);
      const data = await ff.readFile(outName);
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    } finally {
      await ff.deleteFile(inName).catch(() => {});
      await ff.deleteFile(outName).catch(() => {});
    }
  },

  /** Re-encode a blob to another container/codec. */
  async transcode(input, outExt, args, onProgress) {
    const ff = await this.ensure(onProgress);
    const inName = `in${extOf(input.name || 'audio')}`;
    const outName = `out${outExt}`;
    await ff.writeFile(inName, new Uint8Array(await input.arrayBuffer()));
    try {
      await ff.exec(['-i', inName, ...args, outName]);
      const data = await ff.readFile(outName);
      return data instanceof Uint8Array ? data : new Uint8Array(data);
    } finally {
      await ff.deleteFile(inName).catch(() => {});
      await ff.deleteFile(outName).catch(() => {});
    }
  },
};
