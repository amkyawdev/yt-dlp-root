/**
 * Extraction repository implementation — mirrors
 * lib/features/extraction/data/repositories/extraction_repository_impl.dart.
 *
 * Turns a user-supplied source (YouTube URL or local file) into an AudioSource
 * whose `blob` is playable audio, and produces the 16 kHz mono WAV that Whisper
 * consumes.
 */
import { ExtractionRepository } from '../../domain/repositories/extraction_repository.js';
import { AudioSource, isYouTubeUrl } from '../../domain/entities/audio_source.js';
import { YtdlpDatasource } from '../datasources/ytdlp_datasource.js';
import { FfmpegDatasource } from '../datasources/ffmpeg_datasource.js';
import { ValidationFailure, CancelledFailure } from '../../../../core/errors/failures.js';
import { probeDuration, extOf } from '../../../../core/utils/file_utils.js';
import { AppConstants } from '../../../../core/constants/app_constants.js';

export class ExtractionRepositoryImpl extends ExtractionRepository {
  constructor({ ytdlp = YtdlpDatasource, ffmpeg = FfmpegDatasource } = {}) {
    super();
    this.ytdlp = ytdlp;
    this.ffmpeg = ffmpeg;
  }

  /**
   * Acquire audio from the given source.
   *
   * @param {{kind:'youtube'|'file', url?:string, file?:File}} source
   * @param {object} opts
   * @param {(stage:string, pct?:number)=>void} [opts.onStage]
   * @param {(msg:string)=>void} [opts.onStatus]
   * @param {()=>boolean} [opts.isCancelled]
   * @returns {Promise<{audio:AudioSource, wav:Uint8Array}>}
   */
  async acquire(source, opts = {}) {
    const { onStage, onStatus, isCancelled } = opts;
    const guard = () => {
      if (isCancelled?.()) throw new CancelledFailure();
    };

    const audio = new AudioSource({ kind: source.kind });

    if (source.kind === 'youtube') {
      if (!isYouTubeUrl(source.url)) {
        throw new ValidationFailure('not a recognised YouTube URL', { stage: 'resolve' });
      }
      onStage?.('resolve');
      onStatus?.(`yt-dlp resolving ${source.url}`);
      audio.url = source.url.trim();
      audio.info = await this.ytdlp.resolve(audio.url, { onStatus });
      audio.duration = audio.info.duration || 0;
      guard();

      onStage?.('download');
      const { blob, bytes } = await this.ytdlp.downloadAudio(audio.info.audio, (p) =>
        onStage?.('download', (p.ratio || 0) * 100)
      );
      audio.blob = blob;
      audio.ext = audio.info.audio.ext || 'm4a';
      onStatus?.(`acquired audio stream (${bytes} bytes, .${audio.ext})`);
      guard();
    } else {
      if (!source.file) throw new ValidationFailure('no file selected', { stage: 'resolve' });
      if (source.file.size > AppConstants.maxLocalFileBytes) {
        throw new ValidationFailure(`file too large (max ${Math.round(AppConstants.maxLocalFileBytes / 1048576)} MB)`);
      }
      onStage?.('resolve');
      onStatus?.(`probing local file ${source.file.name}`);
      audio.file = source.file;
      audio.blob = source.file;
      audio.ext = extOf(source.file.name).slice(1);
      audio.duration = await probeDuration(source.file);
      if (audio.duration > AppConstants.maxLocalFileSeconds) {
        throw new ValidationFailure(`audio too long (max ${AppConstants.maxLocalFileSeconds / 60} min)`);
      }
      onStage?.('download', 100);
      guard();
    }

    onStage?.('extract');
    onStatus?.('ffmpeg.wasm extracting audio → 16 kHz mono wav');
    const wav = await this.ffmpeg.extractToWav(audio.blob, (p) => onStage?.('extract', p * 100));
    onStage?.('convert', 100);

    return { audio, wav };
  }

  /** Re-encode the acquired audio for download in a chosen format. */
  async exportAudio(audio, format) {
    if (format === 'mp3') {
      return { bytes: await this.ffmpeg.transcode(audio.blob, '.mp3', ['-vn', '-c:a', 'libmp3lame', '-q:a', '2']), ext: 'mp3', mime: 'audio/mpeg' };
    }
    return { bytes: new Uint8Array(await audio.blob.arrayBuffer()), ext: audio.ext || 'm4a', mime: audio.blob.type || 'application/octet-stream' };
  }
}

export const extractionRepository = new ExtractionRepositoryImpl();
