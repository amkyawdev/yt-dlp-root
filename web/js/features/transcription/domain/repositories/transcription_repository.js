/**
 * Transcription repository interface — mirrors
 * lib/features/transcription/domain/repositories/transcription_repository.dart.
 */
export class TranscriptionRepository {
  /**
   * Transcribe 16 kHz mono WAV bytes.
   * @returns {Promise<{segments:import('../entities/transcript_segment.js').TranscriptSegment[], engine:string}>}
   */
  async transcribe(_wavBytes, _opts) {
    throw new Error('not implemented');
  }
}
