/**
 * Worker-side crypto helpers: SHA-256 and HMAC only, on top of WebCrypto.
 *
 * Deliberately absent: any key derivation from user material, any decryption, any
 * access to a user key. The shared Worker verifies signatures and stores opaque bytes.
 *
 * The byte/encoding helpers are re-exported from `./bytes.ts` so a Worker can import
 * one module and get `utf8`, `toHex`, `toBase64UrlOfUtf8`, … as before.
 */
import { asBufferSource, utf8 } from "./bytes.js";
export { asBodyInit, asBufferSource, bytesEqual, fromBase64Url, fromBase64UrlToUtf8, fromHex, fromUtf8, randomBytes, randomHex, timingSafeEqual, toBase64Url, toBase64UrlOfUtf8, toHex, utf8, wipe } from "./bytes.js";
export async function sha256(bytes) {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', asBufferSource(bytes)));
}
export async function sha256Hex(bytes) {
    return hexOf(await sha256(bytes));
}
export async function hmacSha256(keyBytes, message) {
    const key = await crypto.subtle.importKey('raw', asBufferSource(keyBytes), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, asBufferSource(message)));
}
export async function hmacSha256Hex(keyBytes, message) {
    return hexOf(await hmacSha256(keyBytes, message));
}
/** HMAC the UTF-8 of `message` with the UTF-8 of `key`. */
export async function hmacSha256HexOfUtf8(key, message) {
    return hmacSha256Hex(utf8(key), utf8(message));
}
function hexOf(bytes) {
    let out = '';
    for (const byte of bytes)
        out += byte.toString(16).padStart(2, '0');
    return out;
}
