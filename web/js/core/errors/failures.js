/**
 * Typed failures — mirrors lib/core/errors/failures.dart.
 * Every pipeline stage throws one of these so the UI can render a specific
 * message instead of a raw stack trace.
 */

export class Failure extends Error {
  constructor(message, { code = 'unknown', cause = null, stage = null } = {}) {
    super(message);
    this.name = 'Failure';
    this.code = code;
    this.cause = cause;
    this.stage = stage;
  }
  toString() {
    return `${this.code}: ${this.message}`;
  }
}

export class NetworkFailure extends Failure {
  constructor(message, opts = {}) {
    super(message, { code: 'network', ...opts });
    this.name = 'NetworkFailure';
  }
}

export class ProxyFailure extends Failure {
  constructor(message, opts = {}) {
    super(message, { code: 'proxy', ...opts });
    this.name = 'ProxyFailure';
  }
}

export class ExtractionFailure extends Failure {
  constructor(message, opts = {}) {
    super(message, { code: 'extraction', ...opts });
    this.name = 'ExtractionFailure';
  }
}

export class TranscriptionFailure extends Failure {
  constructor(message, opts = {}) {
    super(message, { code: 'transcription', ...opts });
    this.name = 'TranscriptionFailure';
  }
}

export class ValidationFailure extends Failure {
  constructor(message, opts = {}) {
    super(message, { code: 'validation', ...opts });
    this.name = 'ValidationFailure';
  }
}

export class CacheFailure extends Failure {
  constructor(message, opts = {}) {
    super(message, { code: 'cache', ...opts });
    this.name = 'CacheFailure';
  }
}

export class CancelledFailure extends Failure {
  constructor(message = 'cancelled by operator', opts = {}) {
    super(message, { code: 'cancelled', ...opts });
    this.name = 'CancelledFailure';
  }
}

/** Normalise any thrown value into a Failure for display. */
export function toFailure(err, opts = {}) {
  if (err instanceof Failure) return err;
  return new Failure(String(err?.message ?? err), { cause: err, ...opts });
}
