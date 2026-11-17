/**
 * Session cookies: issue/read round-trip, every flavour of forgery rejected, expiry,
 * CSRF binding, and the parameterised payload extension (vault's `vid`).
 */

import { describe, expect, it } from 'vitest'

import { fromBase64UrlToUtf8, hmacSha256HexOfUtf8, sha256Hex, toBase64UrlOfUtf8, utf8 } from '../src/crypto.ts'
import {
  CSRF_HEADER,
  DEFAULT_SESSION_TTL_SECONDS,
  createSessions,
  type SessionPayload
} from '../src/session.ts'

const SECRET = 'test-secret-not-a-real-key'
const ENV = { ENVIRONMENT: 'test' }
const PROD = { ENVIRONMENT: 'production' }

function cookieRequest (cookie: string): Request {
  return new Request('https://example.test/api/me', { headers: { Cookie: cookie } })
}

function cookieValue (setCookie: string): string {
  return setCookie.slice(0, setCookie.indexOf(';'))
}

function sessionsAt (now: number): ReturnType<typeof createSessions> {
  return createSessions({ cookieName: 'bitspv_session', secret: SECRET, now: () => now })
}

describe('issue', () => {
  it('builds an HttpOnly Lax cookie with Path, Max-Age and no Secure outside production', async () => {
    const sessions = sessionsAt(1_700_000_000)
    const { cookie, payload } = await sessions.issue(ENV, {
      accountId: 'acct-1',
      identityHash: 'abc123'
    })

    expect(cookie).toContain('bitspv_session=')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain(`Max-Age=${DEFAULT_SESSION_TTL_SECONDS}`)
    expect(cookie).not.toContain('Secure')

    expect(payload.sub).toBe('acct-1')
    expect(payload.ikh).toBe('abc123')
    expect(payload.iat).toBe(1_700_000_000)
    expect(payload.exp).toBe(1_700_000_000 + DEFAULT_SESSION_TTL_SECONDS)
    expect(payload.csrf).toMatch(/^[0-9a-f]{32}$/)
    expect(payload.jti).toMatch(/^[0-9a-f]{32}$/)
    expect(payload.jti).not.toBe(payload.csrf)
  })

  it('adds Secure in production and honours cookieName / ttl / SameSite overrides', async () => {
    const sessions = createSessions({
      cookieName: 'bitspv_send_session',
      secret: SECRET,
      ttlSeconds: 60,
      sameSite: 'Strict',
      now: () => 1
    })
    const { cookie } = await sessions.issue(PROD, { accountId: 'a', identityHash: 'b' })
    expect(cookie).toContain('bitspv_send_session=')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Max-Age=60')
    expect(cookie).toContain('Secure')
  })

  it('embeds extra payload fields (vault vid) and reads them back typed', async () => {
    const sessions = createSessions<{ vid: string }>({
      cookieName: 'bitspv_session',
      secret: SECRET,
      now: () => 1_700_000_000
    })
    const { cookie, payload } = await sessions.issue(ENV, {
      accountId: 'acct',
      identityHash: 'ikh',
      extra: { vid: 'vault-9' }
    })
    expect(payload.vid).toBe('vault-9')

    const read = await sessions.read(ENV, cookieRequest(cookieValue(cookie)))
    expect(read).not.toBeNull()
    const typed = read as SessionPayload<{ vid: string }>
    expect(typed.vid).toBe('vault-9')
    expect(typed.sub).toBe('acct')
  })

  it('refuses an extra field that would shadow a signed base field', async () => {
    const sessions = createSessions<{ sub: string }>({
      cookieName: 'c',
      secret: SECRET,
      now: () => 1
    })
    await expect(sessions.issue(ENV, {
      accountId: 'acct',
      identityHash: 'ikh',
      extra: { sub: 'attacker' }
    })).rejects.toThrow(/reserved/)
  })

  it('throws when the secret is missing (fail loud, not "everyone logged out")', async () => {
    const sessions = createSessions({ cookieName: 'c', secret: () => '', now: () => 1 })
    await expect(sessions.issue(ENV, { accountId: 'a', identityHash: 'b' })).rejects.toThrow(/secret is missing/)
  })
})

describe('read', () => {
  it('returns the payload for a valid cookie', async () => {
    const sessions = sessionsAt(1_700_000_000)
    const { cookie, payload } = await sessions.issue(ENV, { accountId: 'acct', identityHash: 'ikh' })
    const read = await sessions.read(ENV, cookieRequest(cookieValue(cookie)))
    expect(read).toMatchObject({ sub: payload.sub, csrf: payload.csrf, exp: payload.exp })
  })

  it('rejects a missing cookie, a malformed cookie and a foreign cookie name', async () => {
    const sessions = sessionsAt(1_700_000_000)
    const { cookie } = await sessions.issue(ENV, { accountId: 'acct', identityHash: 'ikh' })
    const value = cookieValue(cookie)

    expect(await sessions.read(ENV, new Request('https://example.test/'))).toBeNull()
    expect(await sessions.read(ENV, cookieRequest('bitspv_session=no-dot'))).toBeNull()
    expect(await sessions.read(ENV, cookieRequest(`bitspv_other=${value}`))).toBeNull()
    expect(await sessions.read(ENV, cookieRequest('bitspv_session='))).toBeNull()
  })

  it('rejects a tampered payload even though the cookie value still parses', async () => {
    const sessions = sessionsAt(1_700_000_000)
    const { cookie } = await sessions.issue(ENV, { accountId: 'victim', identityHash: 'ikh' })
    const [body, signature] = cookieValue(cookie).slice('bitspv_session='.length).split('.')
    const json = JSON.parse(fromBase64UrlToUtf8(body!)) as Record<string, unknown>
    json.sub = 'attacker'
    const forgedBody = toBase64UrlOfUtf8(JSON.stringify(json))

    expect(await sessions.read(ENV, cookieRequest(`bitspv_session=${forgedBody}.${signature}`))).toBeNull()
  })

  it('rejects a forged signature, including one signed with a different secret', async () => {
    const sessions = sessionsAt(1_700_000_000)
    const other = createSessions({ cookieName: 'bitspv_session', secret: 'attacker-secret', now: () => 1_700_000_000 })

    const { cookie } = await sessions.issue(ENV, { accountId: 'acct', identityHash: 'ikh' })
    const body = cookieValue(cookie).slice('bitspv_session='.length).split('.')[0]!
    const forged = await other.issue(ENV, { accountId: 'attacker', identityHash: 'x' })
    const forgedSignature = cookieValue(forged.cookie).slice('bitspv_session='.length).split('.')[1]!

    expect(await sessions.read(ENV, cookieRequest(`bitspv_session=${body}.${forgedSignature}`))).toBeNull()
    expect(await sessions.read(ENV, cookieRequest(`bitspv_session=${body}.deadbeef`))).toBeNull()
  })

  it('rejects an expired session', async () => {
    const issuedAt = 1_700_000_000
    const sessions = sessionsAt(issuedAt)
    const { cookie } = await sessions.issue(ENV, { accountId: 'acct', identityHash: 'ikh' })

    const later = createSessions({
      cookieName: 'bitspv_session',
      secret: SECRET,
      now: () => issuedAt + DEFAULT_SESSION_TTL_SECONDS
    })
    expect(await later.read(ENV, cookieRequest(cookieValue(cookie)))).toBeNull()

    const justBefore = createSessions({
      cookieName: 'bitspv_session',
      secret: SECRET,
      now: () => issuedAt + DEFAULT_SESSION_TTL_SECONDS - 1
    })
    expect(await justBefore.read(ENV, cookieRequest(cookieValue(cookie)))).not.toBeNull()
  })

  it('rejects a correctly signed body that is not a session payload', async () => {
    // Signed with the real secret, but the payload has no `sub`/`csrf`.
    const sessions = createSessions({ cookieName: 'bitspv_session', secret: SECRET, now: () => 1_700_000_000 })
    const body = toBase64UrlOfUtf8(JSON.stringify({ exp: 9_999_999_999 }))
    const signature = await hmacSha256HexOfUtf8(SECRET, body)

    expect(await sessions.read(ENV, cookieRequest(`bitspv_session=${body}.${signature}`))).toBeNull()
  })
})

describe('csrf', () => {
  it('accepts only the token bound into the session', async () => {
    const sessions = sessionsAt(1_700_000_000)
    const { payload } = await sessions.issue(ENV, { accountId: 'a', identityHash: 'b' })

    const ok = new Request('https://example.test/write', { headers: { [CSRF_HEADER]: payload.csrf } })
    const wrong = new Request('https://example.test/write', { headers: { [CSRF_HEADER]: 'x'.repeat(32) } })
    const missing = new Request('https://example.test/write')

    expect(sessions.csrfOk(ok, payload)).toBe(true)
    expect(sessions.csrfOk(wrong, payload)).toBe(false)
    expect(sessions.csrfOk(missing, payload)).toBe(false)
  })

  it('honours a custom CSRF header name', async () => {
    const sessions = createSessions({
      cookieName: 'c',
      csrfHeader: 'x-xsrf-token',
      secret: SECRET,
      now: () => 1
    })
    const { payload } = await sessions.issue(ENV, { accountId: 'a', identityHash: 'b' })
    const request = new Request('https://example.test/write', { headers: { 'x-xsrf-token': payload.csrf } })
    expect(sessions.csrfOk(request, payload)).toBe(true)
  })
})

describe('misc', () => {
  it('clearCookie expires the cookie', () => {
    const sessions = sessionsAt(1)
    const cleared = sessions.clearCookie(ENV)
    expect(cleared).toContain('bitspv_session=;')
    expect(cleared).toContain('Max-Age=0')
  })

  it('identityHashOf matches sha256(appIdentity) truncated to 32 hex chars', async () => {
    const sessions = sessionsAt(1)
    const identity = '03aabbccddeeff00112233445566778899aabbccddeeff0011223344556677'
    const expected = (await sha256Hex(utf8(identity))).slice(0, 32)
    expect(await sessions.identityHashOf(identity)).toBe(expected)
    expect(expected).toHaveLength(32)
  })

  it('exposes the defaults it documents', () => {
    const sessions = sessionsAt(1)
    expect(sessions.ttlSeconds).toBe(DEFAULT_SESSION_TTL_SECONDS)
    expect(sessions.csrfHeader).toBe(CSRF_HEADER)
    expect(sessions.cookieName).toBe('bitspv_session')
  })
})
