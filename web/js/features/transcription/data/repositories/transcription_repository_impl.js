/**
 * Transcription repository implementation — mirrors
 * lib/features/transcription/data/repositories/transcription_repository_impl.dart.
 */
import { TranscriptionRepository } from '../../domain/repositories/transcription_repository.js';
import { TranscriptSegment } from '../../domain/entities/transcript_segment.js';
import { WhisperDatasource } from '../datasources/whisper_datasource.js';
import { TranscriptionFailure } from '../../../../core/errors/failures.js';

export class TranscriptionRepositoryImpl extends TranscriptionRepository {
  constructor({ whisper = WhisperDatasource } = {}) {
    super();
    this.whisper = whisper;
  }

  async transcribe(wavBytes, opts = {}) {
    try {
      const { segments, engine } = await this.whisper.transcribe(wavBytes, opts);
      return {
        segments: segments.map((s) => new TranscriptSegment(s)),
        engine,
      };
    } catch (err) {
      if (err instanceof TranscriptionFailure) throw err;
      throw new TranscriptionFailure(String(err?.message ?? err), { cause: err, stage: 'transcribe' });
    }
  }
}

export const transcriptionRepository = new TranscriptionRepositoryImpl();
