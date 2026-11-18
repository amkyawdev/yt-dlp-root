/**
 * File helpers — mirrors lib/core/utils/file_utils.dart.
 */

export const MB = 1024 * 1024;

/** Human-readable byte size. */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Lower-case extension including the dot, or '.bin'. */
export function extOf(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name || '');
  return m ? `.${m[1].toLowerCase()}` : '.bin';
}

/** Strip the extension from a filename. */
export const baseName = (name) => (name || '').replace(/\.[a-z0-9]{1,5}$/i, '');

/** Filesystem-safe stem, preserving Myanmar Unicode. */
export function safeStem(name, max = 60) {
  return baseName(name)
    .replace(/[^\w\u1000-\u109F -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'audio';
}

export const isAudio = (type = '') => type.startsWith('audio');
export const isVideo = (type = '') => type.startsWith('video');

/**
 * Read a media file's duration in seconds by letting the browser parse its
 * metadata. Resolves to 0 when the duration is unknown (streams, odd codecs).
 */
export function probeDuration(blob) {
  return new Promise((resolve) => {
    const el = document.createElement(isAudio(blob.type) ? 'audio' : 'video');
    const url = URL.createObjectURL(blob);
    const done = (v) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => done(0);
    setTimeout(() => done(0), 4000);
    el.src = url;
  });
}

/** Trigger a browser download for a text payload. */
export function downloadText(filename, text, mime = 'text/plain') {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

/** Trigger a browser download for a binary payload. */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Copy text to the clipboard, returning a boolean instead of throwing. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
