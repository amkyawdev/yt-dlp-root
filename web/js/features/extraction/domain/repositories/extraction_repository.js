/**
 * Extraction repository interface — mirrors
 * lib/features/extraction/domain/repositories/extraction_repository.dart.
 *
 * Abstract contract; the implementation lives in data/repositories.
 */
export class ExtractionRepository {
  /** Resolve a source into an AudioSource (metadata + acquired audio). */
  async acquire(_source, _opts) {
    throw new Error('not implemented');
  }
}
