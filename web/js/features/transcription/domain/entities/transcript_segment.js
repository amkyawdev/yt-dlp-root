/**
 * TranscriptSegment entity — mirrors
 * lib/features/transcription/domain/entities/transcript_segment.dart.
 *
 * Also owns the timestamp formatters and subtitle serialisers (SRT / VTT /
 * plain text), keeping timing in one place.
 */

export class TranscriptSegment {
  /** @param {{start:number, end:number, text:string}} o start/end in ms */
  constructor({ start = 0, end = 0, text = '' } = {}) {
    this.start = start;
    this.end = end;
    this.text = text.trim();
  }

  static fromWhisper({ timestamp, text }) {
    return new TranscriptSegment({
      start: (timestamp?.[0] ?? 0) * 1000,
      end: (timestamp?.[1] ?? timestamp?.[0] ?? 0) * 1000,
      text: text ?? '',
    });
  }

  get duration() {
    return Math.max(0, this.end - this.start);
  }
}

/** ms → "HH:MM:SS,mmm" (SRT) or "HH:MM:SS.mmm" (VTT). */
export function fmtTime(ms, sep = ',') {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const ms3 = t % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms3, 3)}`;
}

/** "HH:MM:SS,mmm" → ms. */
export function parseTime(str) {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/.exec(String(str).trim());
  if (!m) return 0;
  const [, h = '0', mm, ss, ms] = m;
  return ((+h * 60 + +mm) * 60 + +ss) * 1000 + +ms.padEnd(3, '0');
}

/** Short "M:SS" label for the UI. */
export const fmtShort = (ms) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/* ── serialisers ───────────────────────────────────────────────────────── */

export function toSRT(segments) {
  return segments
    .map((c, i) => `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}

export function toVTT(segments) {
  const body = segments
    .map((c) => `${fmtTime(c.start, '.')} --> ${fmtTime(c.end, '.')}\n${c.text}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function toPlainText(segments, withTimestamps = true) {
  return segments
    .map((c) => (withTimestamps ? `[${fmtTime(c.start).replace(',', '.')}] ${c.text}` : c.text))
    .join('\n');
}
