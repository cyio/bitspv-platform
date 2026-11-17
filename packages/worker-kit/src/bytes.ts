/**
 * Byte / encoding helpers shared by the browser client, the Worker and the tests.
 *
 * Moved verbatim out of `bitspv-send` and `bitspv-vault`, whose `src/shared/bytes.ts`
 * were already the same file. Nothing here knows about BitSPV.
 */

/**
 * TypeScript 5.7+ made TypedArrays generic over their backing buffer, so a bare
 * `Uint8Array` means `Uint8Array<ArrayBufferLike>` while WebCrypto's `BufferSource`
 * only accepts `ArrayBuffer`-backed views. Every array we hand to `crypto.subtle`
 * is genuinely ArrayBuffer-backed, so this one documented cast keeps call sites
 * readable instead of scattering `as unknown as BufferSource`.
 */
export function asBufferSource (bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource
}

/**
 * TypeScript 5.7+ types `Uint8Array<ArrayBufferLike>` as not assignable to
 * `BodyInit` (which wants an ArrayBuffer-backed view). The bytes we put in a request
 * body are always ArrayBuffer-backed, so this documented cast keeps call sites clean.
 */
export function asBodyInit (bytes: Uint8Array): BodyInit {
  return bytes as unknown as BodyInit
}

export function utf8 (value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function fromUtf8 (bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

const HEX = '0123456789abcdef'

export function toHex (bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += HEX[byte >> 4]! + HEX[byte & 0x0f]!
  return out
}

export function fromHex (hex: string): Uint8Array {
  const clean = hex.trim()
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('invalid hex string')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function randomBytes (length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

export function randomHex (length: number): string {
  return toHex(randomBytes(length))
}

// --- base64url (no padding) ------------------------------------------------

export function toBase64Url (bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function toBase64UrlOfUtf8 (value: string): string {
  return toBase64Url(utf8(value))
}

export function fromBase64Url (value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function fromBase64UrlToUtf8 (value: string): string {
  return fromUtf8(fromBase64Url(value))
}

/**
 * Constant-time comparison for equal-length byte arrays.
 * Returns false when lengths differ (that leak is unavoidable and harmless here).
 */
export function bytesEqual (a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/** Constant-time string comparison for equal-length hex/base64 digests. */
export function timingSafeEqual (a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Overwrite key material in place. */
export function wipe (bytes: Uint8Array): void {
  bytes.fill(0)
}
