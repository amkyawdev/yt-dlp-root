/**
 * Extraction provider — mirrors
 * lib/features/extraction/presentation/providers/extraction_provider.dart.
 *
 * Holds the current source + options and exposes the acquisition flow to the UI.
 */
import { extractionRepository } from '../../data/repositories/extraction_repository_impl.js';
import { AppConstants } from '../../../../core/constants/app_constants.js';

export class ExtractionProvider {
  constructor(repo = extractionRepository) {
    this.repo = repo;
    this.state = {
      mode: 'youtube',               // youtube | file
      url: '',
      file: null,
      model: AppConstants.defaultModel,
      language: AppConstants.defaultLanguage,
      format: AppConstants.defaultAudioFormat,
      running: false,
      audio: null,                   // AudioSource
      wav: null,                     // Uint8Array (16 kHz mono)
      error: null,
    };
  }

  setMode(mode) {
    this.state.mode = mode;
  }
  setUrl(url) {
    this.state.url = url;
  }
  setFile(file) {
    this.state.file = file;
  }
  setOption(key, value) {
    if (key in this.state) this.state[key] = value;
  }

  get canRun() {
    return this.state.mode === 'youtube' ? !!this.state.url.trim() : !!this.state.file;
  }

  /**
   * Run resolve → download → extract → convert.
   * @param {{onStage:Function,onStatus:Function,isCancelled:()=>boolean}} hooks
   */
  async run(hooks) {
    this.state.running = true;
    this.state.error = null;
    try {
      const source = this.state.mode === 'youtube'
        ? { kind: 'youtube', url: this.state.url }
        : { kind: 'file', file: this.state.file };
      const { audio, wav } = await this.repo.acquire(source, hooks);
      this.state.audio = audio;
      this.state.wav = wav;
      return { audio, wav };
    } catch (err) {
      this.state.error = err;
      throw err;
    } finally {
      this.state.running = false;
    }
  }

  exportAudio(format = this.state.format) {
    return this.repo.exportAudio(this.state.audio, format);
  }
}

export const extractionProvider = new ExtractionProvider();
