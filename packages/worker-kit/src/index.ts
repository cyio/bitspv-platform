/**
 * Barrel export.
 *
 * Worker bundles care about size, so prefer the subpath imports in hot paths:
 *
 *   import { json, readJson } from '@bitspv/worker-kit/http'
 *   import { createSessions } from '@bitspv/worker-kit/session'
 *   import { RateLimiter } from '@bitspv/worker-kit/rate-limiter-do'
 *
 * The barrel re-exports everything, including `verify` (which pulls in
 * `@bsv/sdk`); bundlers that honour `sideEffects` will tree-shake what a route does
 * not use, but an explicit subpath import is the safe choice inside a Worker.
 */

// --- bytes -------------------------------------------------------------------
export {
  asBodyInit,
  asBufferSource,
  bytesEqual,
  fromBase64Url,
  fromBase64UrlToUtf8,
  fromHex,
  fromUtf8,
  randomBytes,
  randomHex,
  timingSafeEqual,
  toBase64Url,
  toBase64UrlOfUtf8,
  toHex,
  utf8,
  wipe
} from './bytes.ts'

// --- crypto (WebCrypto) ------------------------------------------------------
export { hmacSha256, hmacSha256Hex, hmacSha256HexOfUtf8, sha256, sha256Hex } from './crypto.ts'

// --- ECDSA verification ------------------------------------------------------
export { sdkVerifier, verifier } from './verify.ts'
export type { SignatureVerifier, VerifyResult } from './verify.ts'

// --- HTTP helpers ------------------------------------------------------------
export { DEFAULT_MAX_JSON_BYTES, apiError, errorResponse, isResponse, json, readJson } from './http.ts'
export type { ApiErrorBody } from './http.ts'

// --- sessions ----------------------------------------------------------------
export {
  CSRF_HEADER,
  DEFAULT_SESSION_TTL_SECONDS,
  RESERVED_SESSION_KEYS,
  createSessions
} from './session.ts'
export type {
  IssueSessionInput,
  IssuedSession,
  SessionKit,
  SessionOptions,
  SessionPayload,
  SessionPayloadBase,
  SessionSecret
} from './session.ts'

// --- rate limiting -----------------------------------------------------------
export { DEFAULT_RATE_LIMIT_POLICY, createRateLimiter, normalizeClientIp } from './rate-limit.ts'
export type {
  DurableObjectIdLike,
  DurableObjectNamespaceLike,
  DurableObjectStubLike,
  RateLimitDecision,
  RateLimitEnvLike,
  RateLimitKit,
  RateLimitPolicy,
  RateLimiterOptions
} from './rate-limit.ts'

// --- RateLimiter Durable Object ----------------------------------------------
export { RateLimiter, __resetNow, __setNow } from './rate-limiter-do.ts'
export type {
  RateLimiterCheckBody,
  RateLimiterStateLike,
  RateLimiterStorageLike
} from './rate-limiter-do.ts'

// --- i18n mechanism ----------------------------------------------------------
export { createI18n, detectLang, interpolate } from './i18n.ts'
export type { I18n, I18nOptions, Lang, MessageTable } from './i18n.ts'
