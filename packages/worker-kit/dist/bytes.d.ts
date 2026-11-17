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
export declare function asBufferSource(bytes: Uint8Array): BufferSource;
/**
 * TypeScript 5.7+ types `Uint8Array<ArrayBufferLike>` as not assignable to
 * `BodyInit` (which wants an ArrayBuffer-backed view). The bytes we put in a request
 * body are always ArrayBuffer-backed, so this documented cast keeps call sites clean.
 */
export declare function asBodyInit(bytes: Uint8Array): BodyInit;
export declare function utf8(value: string): Uint8Array;
export declare function fromUtf8(bytes: Uint8Array): string;
export declare function toHex(bytes: Uint8Array): string;
export declare function fromHex(hex: string): Uint8Array;
export declare function randomBytes(length: number): Uint8Array;
export declare function randomHex(length: number): string;
export declare function toBase64Url(bytes: Uint8Array): string;
export declare function toBase64UrlOfUtf8(value: string): string;
export declare function fromBase64Url(value: string): Uint8Array;
export declare function fromBase64UrlToUtf8(value: string): string;
/**
 * Constant-time comparison for equal-length byte arrays.
 * Returns false when lengths differ (that leak is unavoidable and harmless here).
 */
export declare function bytesEqual(a: Uint8Array, b: Uint8Array): boolean;
/** Constant-time string comparison for equal-length hex/base64 digests. */
export declare function timingSafeEqual(a: string, b: string): boolean;
/** Overwrite key material in place. */
export declare function wipe(bytes: Uint8Array): void;
