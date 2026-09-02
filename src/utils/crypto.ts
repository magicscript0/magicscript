/**
 * Browser-side hashing helpers (Web Crypto). These run only in the admin's
 * or end user's browser; server-side hashing lives in the database functions.
 */

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 hex digest of a UTF-8 string. Never used with service secrets. */
export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure hashing is unavailable in this browser.')
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return toHex(new Uint8Array(digest))
}
