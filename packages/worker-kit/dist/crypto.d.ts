/**
 * Worker-side crypto helpers: SHA-256 and HMAC only, on top of WebCrypto.
 *
 * Deliberately absent: any key derivation from user material, any decryption, any
 * access to a user key. The shared Worker verifies signatures and stores opaque bytes.
 *
 * The byte/encoding helpers are re-exported from `./bytes.ts` so a Worker can import
 * one module and get `utf8`, `toHex`, `toBase64UrlOfUtf8`, … as before.
 */
export { asBodyInit, asBufferSource, bytesEqual, fromBase64Url, fromBase64UrlToUtf8, fromHex, fromUtf8, randomBytes, randomHex, timingSafeEqual, toBase64Url, toBase64UrlOfUtf8, toHex, utf8, wipe } from './bytes.js';
export declare function sha256(bytes: Uint8Array): Promise<Uint8Array>;
export declare function sha256Hex(bytes: Uint8Array): Promise<string>;
export declare function hmacSha256(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array>;
export declare function hmacSha256Hex(keyBytes: Uint8Array, message: Uint8Array): Promise<string>;
/** HMAC the UTF-8 of `message` with the UTF-8 of `key`. */
export declare function hmacSha256HexOfUtf8(key: string, message: string): Promise<string>;
