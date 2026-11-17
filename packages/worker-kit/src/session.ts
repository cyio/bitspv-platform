/**
 * Stateless session cookies: `base64url(JSON payload) . hex(HMAC-SHA256)`.
 *
 * Why a cookie session instead of BRC-104 per-request signatures: each request would
 * cost an extra ECDSA verification, and a Worker invocation has a small CPU budget.
 * We pay one verification at login and cheap HMACs afterwards. Writes additionally
 * require a CSRF token that is bound into the signed payload, so it cannot be forged
 * by a page that lacks the cookie.
 *
 * Everything product-specific is injected through `createSessions`:
 *
 *   - `cookieName` — send uses `bitspv_send_session`, vault uses `bitspv_session`;
 *   - `secret`     — read from `env` (a missing secret must throw in production);
 *   - `ttlSeconds` — defaults to 7 days;
 *   - `TExtra`     — payload fields on top of the shared base, e.g. vault's `vid`.
 *
 * No product name, cookie name or secret ever appears in this file.
 */

import {
  fromBase64UrlToUtf8,
  hmacSha256HexOfUtf8,
  randomHex,
  sha256Hex,
  timingSafeEqual,
  toBase64UrlOfUtf8,
  utf8
} from './crypto.ts'

/** Seven days, the value both products shipped with. */
export const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

export const CSRF_HEADER = 'x-csrf-token'

/** Keys the kit owns; an `extra` payload field may not shadow them. */
export const RESERVED_SESSION_KEYS = ['sub', 'ikh', 'csrf', 'iat', 'exp', 'jti'] as const

export interface SessionPayloadBase {
  /** accountId */
  sub: string
  /** sha256(appIdentity) prefix — scopes an owner without storing the key. */
  ikh: string
  /** CSRF token, bound into the signature. */
  csrf: string
  /** Issued at, Unix seconds. */
  iat: number
  /** Expires at, Unix seconds. */
  exp: number
  /** Random id, so two sessions issued in the same second still differ. */
  jti: string
}

/**
 * The signed payload. `TExtra` is the only extension point — vault instantiates the
 * kit as `createSessions<{ vid: string }>()`, send uses the default and gets nothing
 * but the base fields.
 */
export type SessionPayload<TExtra extends object = {}> = SessionPayloadBase & TExtra

type ExtraInput<TExtra extends object> = [keyof TExtra] extends [never]
  ? { extra?: TExtra }
  : { extra: TExtra }

export type IssueSessionInput<TExtra extends object = {}> = {
  accountId: string
  /** `sha256Hex(utf8(appIdentity)).slice(0, 32)` — see `identityHashOf`. */
  identityHash: string
  /** Unix seconds; defaults to the configured clock. */
  now?: number
} & ExtraInput<TExtra>

export interface IssuedSession<TExtra extends object = {}> {
  payload: SessionPayload<TExtra>
  cookie: string
}

/**
 * HMAC secret. Pass a string, or a reader that pulls it off `env` and throws when a
 * production deployment forgot to set it (fail loud, not "everyone is logged out").
 */
export type SessionSecret = string | ((env: unknown) => string)

export interface SessionOptions {
  cookieName: string
  secret: SessionSecret
  /** Lifetime in seconds. Default 7 days. */
  ttlSeconds?: number
  /** Header carrying the CSRF token. Default `x-csrf-token`. */
  csrfHeader?: string
  /** Cookie path. Default `/`. */
  path?: string
  /** Cookie SameSite attribute. Default `Lax`. */
  sameSite?: 'Lax' | 'Strict' | 'None'
  /**
   * Whether to append `Secure`. Default: `env.ENVIRONMENT === 'production'`, because
   * localhost is a secure context but browsers still refuse `Secure` over plain http.
   */
  secure?: (env: unknown) => boolean
  /** Clock in Unix seconds; injectable for tests. */
  now?: () => number
}

export interface SessionKit<TExtra extends object = {}> {
  readonly cookieName: string
  readonly csrfHeader: string
  readonly ttlSeconds: number
  issue (env: unknown, input: IssueSessionInput<TExtra>): Promise<IssuedSession<TExtra>>
  /** The payload, or null when the cookie is absent, forged, tampered with or expired. */
  read (env: unknown, request: Request): Promise<SessionPayload<TExtra> | null>
  csrfOk (request: Request, session: SessionPayloadBase): boolean
  /** `Set-Cookie` value that deletes the cookie. */
  clearCookie (env: unknown): string
  /** `sha256Hex(utf8(appIdentity))` truncated to 32 hex chars. */
  identityHashOf (appIdentity: string): Promise<string>
}

export function createSessions<TExtra extends object = {}> (options: SessionOptions): SessionKit<TExtra> {
  if (options.cookieName === '') throw new Error('createSessions: cookieName is required')

  const cookieName = options.cookieName
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('createSessions: ttlSeconds must be a positive integer')
  }

  const csrfHeader = options.csrfHeader ?? CSRF_HEADER
  const path = options.path ?? '/'
  const sameSite = options.sameSite ?? 'Lax'
  const clock = options.now ?? ((): number => Math.floor(Date.now() / 1000))
  const secure = options.secure ?? defaultSecure
  const fixedSecret = options.secret
  const secretOf = typeof fixedSecret === 'function' ? fixedSecret : (): string => fixedSecret

  function buildCookie (env: unknown, value: string, maxAgeSeconds: number): string {
    const attributes = [
      `${cookieName}=${value}`,
      `Path=${path}`,
      'HttpOnly',
      `SameSite=${sameSite}`,
      `Max-Age=${maxAgeSeconds}`
    ]
    if (secure(env)) attributes.push('Secure')
    return attributes.join('; ')
  }

  async function issue (env: unknown, input: IssueSessionInput<TExtra>): Promise<IssuedSession<TExtra>> {
    const secret = requireSecret(secretOf(env))
    const now = input.now ?? clock()
    if (!Number.isFinite(now) || now <= 0) throw new Error('createSessions: now must be a Unix timestamp in seconds')

    const extra = (input as { extra?: TExtra }).extra
    if (extra != null) {
      for (const key of Object.keys(extra)) {
        if ((RESERVED_SESSION_KEYS as readonly string[]).includes(key)) {
          throw new Error(`createSessions: extra payload field "${key}" is reserved`)
        }
      }
    }

    const payload = {
      sub: input.accountId,
      ikh: input.identityHash,
      csrf: randomHex(16),
      iat: now,
      exp: now + ttlSeconds,
      jti: randomHex(16),
      ...(extra ?? {})
    } as SessionPayload<TExtra>

    const body = toBase64UrlOfUtf8(JSON.stringify(payload))
    const signature = await hmacSha256HexOfUtf8(secret, body)
    return { payload, cookie: buildCookie(env, `${body}.${signature}`, ttlSeconds) }
  }

  async function read (env: unknown, request: Request): Promise<SessionPayload<TExtra> | null> {
    const raw = readCookie(request, cookieName)
    if (raw == null) return null

    const separator = raw.lastIndexOf('.')
    if (separator <= 0) return null
    const body = raw.slice(0, separator)
    const signature = raw.slice(separator + 1)
    if (body === '' || signature === '') return null

    // Throws when a production deployment has no secret — same rule as `issue`.
    const secret = requireSecret(secretOf(env))
    const expected = await hmacSha256HexOfUtf8(secret, body)
    if (!timingSafeEqual(expected, signature)) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(fromBase64UrlToUtf8(body))
    } catch {
      return null
    }
    if (typeof parsed !== 'object' || parsed === null) return null

    const payload = parsed as Record<string, unknown>
    const now = clock()
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null
    if (typeof payload.sub !== 'string' || payload.sub === '') return null
    if (typeof payload.csrf !== 'string' || payload.csrf === '') return null
    return payload as SessionPayload<TExtra>
  }

  function csrfOk (request: Request, session: SessionPayloadBase): boolean {
    const token = request.headers.get(csrfHeader)
    if (token == null || token === '') return false
    if (typeof session.csrf !== 'string' || session.csrf === '') return false
    return timingSafeEqual(token, session.csrf)
  }

  function clearCookie (env: unknown): string {
    return buildCookie(env, '', 0)
  }

  async function identityHashOf (appIdentity: string): Promise<string> {
    return (await sha256Hex(utf8(appIdentity))).slice(0, 32)
  }

  return { cookieName, csrfHeader, ttlSeconds, issue, read, csrfOk, clearCookie, identityHashOf }
}

function defaultSecure (env: unknown): boolean {
  return typeof env === 'object' && env !== null &&
    (env as { ENVIRONMENT?: unknown }).ENVIRONMENT === 'production'
}

function requireSecret (secret: unknown): string {
  if (typeof secret !== 'string' || secret === '') {
    throw new Error('session secret is missing (set SESSION_HMAC_KEY / pass a secret)')
  }
  return secret
}

function readCookie (request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (header == null) return null
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1)
  }
  return null
}
