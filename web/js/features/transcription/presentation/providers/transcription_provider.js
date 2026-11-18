/**
 * Transcription provider — mirrors
 * lib/features/transcription/presentation/providers/transcription_provider.dart.
 */
import { transcriptionRepository } from '../../data/repositories/transcription_repository_impl.js';
import { AppConstants } from '../../../../core/constants/app_constants.js';

export class TranscriptionProvider {
  constructor(repo = transcriptionRepository) {
    this.repo = repo;
    this.state = {
      running: false,
      segments: [],
      engine: null,
      model: AppConstants.defaultModel,
      language: AppConstants.defaultLanguage,
      error: null,
    };
  }

  /**
   * @param {Uint8Array} wavBytes 16 kHz mono WAV
   * @param {{onProgress?:Function,onSegment?:Function}} [hooks]
   */
  async run(wavBytes, hooks = {}) {
    this.state.running = true;
    this.state.error = null;
    try {
      const { segments, engine } = await this.repo.transcribe(wavBytes, {
        model: this.state.model,
        language: this.state.language,
        onProgress: hooks.onProgress,
        onSegment: hooks.onSegment,
      });
      this.state.segments = segments;
      this.state.engine = engine;
      return segments;
    } catch (err) {
      this.state.error = err;
      throw err;
    } finally {
      this.state.running = false;
    }
  }
}

export const transcriptionProvider = new TranscriptionProvider();
