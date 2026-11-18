/**
 * AudioSource entity — mirrors
 * lib/features/extraction/domain/entities/audio_source.dart.
 *
 * Describes where the audio came from and the acquired bytes.
 */

/** Platform detection for the source badge. */
const PLATFORMS = [
  [/youtu\.?be/i, 'YouTube'],
  [/vimeo/i, 'Vimeo'],
  [/tiktok/i, 'TikTok'],
  [/soundcloud/i, 'SoundCloud'],
  [/facebook|fb\.watch/i, 'Facebook'],
  [/spotify/i, 'Spotify'],
];

export function detectPlatform(url) {
  if (!url || !url.trim()) return null;
  const hit = PLATFORMS.find(([re]) => re.test(url));
  return hit ? hit[1] : 'generic';
}

const YT_RE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;
export const isYouTubeUrl = (url) => YT_RE.test((url || '').trim());

export class AudioSource {
  /**
   * @param {object} o
   * @param {'youtube'|'file'} o.kind
   * @param {string} [o.url]        YouTube URL
   * @param {File}   [o.file]       local file
   * @param {object} [o.info]       yt-dlp metadata (title, uploader, duration…)
   * @param {Blob}   [o.blob]       acquired audio bytes
   * @param {string} [o.ext]        container extension
   * @param {number} [o.duration]   seconds
   */
  constructor(o = {}) {
    this.kind = o.kind ?? 'youtube';
    this.url = o.url ?? null;
    this.file = o.file ?? null;
    this.info = o.info ?? null;
    this.blob = o.blob ?? null;
    this.ext = o.ext ?? null;
    this.duration = o.duration ?? 0;
  }

  get platform() {
    return this.kind === 'file' ? 'Local file' : (detectPlatform(this.url) ?? 'auto-detect');
  }

  get title() {
    return this.info?.title || this.file?.name || 'audio';
  }

  get uploader() {
    return this.info?.uploader || null;
  }
}
