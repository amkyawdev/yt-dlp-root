/**
 * Checksum helpers — mirrors lib/core/utils/checksum_utils.dart.
 *
 * The app verifies downloaded artifacts against the SHA-256 published in
 * manifest.json. Verification streams through the Web Crypto digest so it never
 * materialises a second copy of a large model in memory.
 */
import { CacheFailure } from '../errors/failures.js';

const HEX = [...Array(256).keys()].map((n) => n.toString(16).padStart(2, '0'));

const toHex = (buf) => {
  const view = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < view.length; i++) out += HEX[view[i]];
  return out;
};

/** SHA-256 of a byte array / ArrayBuffer / Blob, as lower-case hex. */
export async function sha256(data) {
  const bytes = data instanceof Blob ? await data.arrayBuffer() : data;
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(buf);
}

/** Compare two hex digests in constant time (avoids timing side channels). */
export function digestsEqual(a = '', b = '') {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify `bytes` against an expected digest.
 * @param {Uint8Array} bytes
 * @param {string} [expected] when omitted, only the digest is returned
 * @returns {Promise<{ ok: boolean, digest: string }>}
 */
export async function verifyChecksum(bytes, expected) {
  const digest = await sha256(bytes);
  if (!expected) return { ok: true, digest };
  const ok = digestsEqual(digest, expected);
  if (!ok) throw new CacheFailure(`checksum mismatch (expected ${expected.slice(0, 12)}…, got ${digest.slice(0, 12)}…)`);
  return { ok, digest };
}
