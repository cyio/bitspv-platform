/**
 * Rate limiting: the per-isolate burst window (rolling), the fail-open rules, and
 * the Durable-Object fixed window driven through a fake namespace.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_RATE_LIMIT_POLICY,
  createRateLimiter,
  normalizeClientIp,
  type DurableObjectNamespaceLike,
  type RateLimitDecision
} from '../src/rate-limit.ts'
import { RateLimiter, __resetNow, __setNow } from '../src/rate-limiter-do.ts'

const IP = '203.0.113.7'
const IP_HEADERS = { 'cf-connecting-ip': IP }

function request (headers: Record<string, string> = IP_HEADERS): Request {
  return new Request('https://example.test/api/thing', { headers })
}

/** A Durable Object namespace stub: records the name and policy body of each check. */
function fakeNamespace (reply: (name: string, body: { max: number, windowSeconds: number }) => Promise<Response> | Response): {
  namespace: DurableObjectNamespaceLike
  names: string[]
  bodies: Array<{ max: number, windowSeconds: number }>
} {
  const names: string[] = []
  const bodies: Array<{ max: number, windowSeconds: number }> = []
  return {
    names,
    bodies,
    namespace: {
      idFromName: (name) => ({ toString: () => name }),
      get: (id) => ({
        fetch: async (_input, init) => {
          const body = JSON.parse(String(init?.body)) as { max: number, windowSeconds: number }
          names.push(id.toString())
          bodies.push(body)
          return await reply(id.toString(), body)
        }
      })
    }
  }
}

const allow = (): Response =>
  new Response(JSON.stringify({ allowed: true, count: 1 }), { status: 200 })
const deny = (retryAfter: number): Response =>
  new Response(JSON.stringify({ allowed: false, count: 99, retryAfter }), { status: 200 })

beforeEach(() => {
  __resetNow()
})

describe('normalizeClientIp', () => {
  it('passes IPv4 through, lower-cased and trimmed', () => {
    expect(normalizeClientIp('203.0.113.7')).toBe('203.0.113.7')
    expect(normalizeClientIp(' 8.8.8.8 ')).toBe('8.8.8.8')
  })

  it('returns null for missing/empty values', () => {
    expect(normalizeClientIp('')).toBeNull()
    expect(normalizeClientIp('   ')).toBeNull()
    expect(normalizeClientIp(null)).toBeNull()
    expect(normalizeClientIp(undefined)).toBeNull()
  })

  it('truncates IPv6 to its /64 prefix', () => {
    expect(normalizeClientIp('2001:DB8:1234:5678:9abc:def0:1234:5678')).toBe('2001:db8:1234:5678::/64')
  })

  it('leaves a short IPv6 fragment alone', () => {
    expect(normalizeClientIp('::1')).toBe('::1')
  })
})

describe('burst window (per isolate)', () => {
  it('allows the limit, blocks the next request, and rolls the window', async () => {
    let at = 1_000_000
    const limiter = createRateLimiter({
      policy: { burstMaxFor: () => 2, burstWindowMs: 10_000 },
      now: () => at
    })

    expect(await limiter.enforceRateLimit({}, 'challenge', request())).toEqual({ allowed: true })
    expect(await limiter.enforceRateLimit({}, 'challenge', request())).toEqual({ allowed: true })

    const blocked = await limiter.enforceRateLimit({}, 'challenge', request())
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(10)

    // Still inside the window: the boundary is inclusive, so nothing has rolled yet.
    at += 9_999
    expect((await limiter.enforceRateLimit({}, 'challenge', request())).allowed).toBe(false)

    // Past the window: the two old timestamps are dropped and the key is usable again.
    at += 2
    expect((await limiter.enforceRateLimit({}, 'challenge', request())).allowed).toBe(true)
  })

  it('keeps one bucket per route, so a tripped route does not block another', async () => {
    let at = 1_000_000
    const limiter = createRateLimiter({
      policy: { burstMaxFor: (route) => (route === 'blob' ? 3 : 1) },
      now: () => at
    })

    expect((await limiter.enforceRateLimit({}, 'verify', request())).allowed).toBe(true)
    expect((await limiter.enforceRateLimit({}, 'verify', request())).allowed).toBe(false)

    // The chunk-upload route gets its own allowance (send's 30-vs-20 policy).
    expect((await limiter.enforceRateLimit({}, 'blob', request())).allowed).toBe(true)
    expect((await limiter.enforceRateLimit({}, 'blob', request())).allowed).toBe(true)
    expect((await limiter.enforceRateLimit({}, 'blob', request())).allowed).toBe(true)
    expect((await limiter.enforceRateLimit({}, 'blob', request())).allowed).toBe(false)

    at += 10_001
    expect((await limiter.enforceRateLimit({}, 'verify', request())).allowed).toBe(true)
  })

  it('keys by IP, and normalises IPv6 before keying', async () => {
    const limiter = createRateLimiter({ policy: { burstMaxFor: () => 1 }, now: () => 1_000_000 })
    const v6a = { 'cf-connecting-ip': '2001:db8:1234:5678:aaaa::1' }
    const v6b = { 'cf-connecting-ip': '2001:db8:1234:5678:bbbb::2' }

    expect((await limiter.enforceRateLimit({}, 'r', request(v6a))).allowed).toBe(true)
    // Same /64 → same bucket.
    expect((await limiter.enforceRateLimit({}, 'r', request(v6b))).allowed).toBe(false)
  })

  it('fails open when the request carries no client IP', async () => {
    const limiter = createRateLimiter({ policy: { burstMaxFor: () => 1 } })
    for (let i = 0; i < 5; i++) {
      expect((await limiter.enforceRateLimit({}, 'r', request({}))).allowed).toBe(true)
    }
  })

  it('resetMemory clears the per-isolate state', async () => {
    const limiter = createRateLimiter({ policy: { burstMaxFor: () => 1 }, now: () => 1_000_000 })
    expect((await limiter.enforceRateLimit({}, 'r', request())).allowed).toBe(true)
    expect((await limiter.enforceRateLimit({}, 'r', request())).allowed).toBe(false)
    limiter.resetMemory()
    expect((await limiter.enforceRateLimit({}, 'r', request())).allowed).toBe(true)
  })
})

describe('Durable-Object layer', () => {
  it('sends the configured policy and keys the DO by route/ip', async () => {
    const fake = fakeNamespace(() => allow())
    const limiter = createRateLimiter({
      policy: { minuteMaxFor: (route) => (route === 'blob' ? 360 : 60), windowSeconds: 60 }
    })

    const decision = await limiter.enforceRateLimit({ RATE: fake.namespace }, 'blob', request())
    expect(decision.allowed).toBe(true)
    expect(fake.names).toEqual(['blob/203.0.113.7'])
    expect(fake.bodies).toEqual([{ max: 360, windowSeconds: 60 }])
  })

  it('uses the documented defaults (20 burst / 60 per minute, 10 s / 60 s windows)', async () => {
    const fake = fakeNamespace(() => allow())
    const limiter = createRateLimiter()
    await limiter.enforceRateLimit({ RATE: fake.namespace }, 'verify', request())

    expect(DEFAULT_RATE_LIMIT_POLICY.burstMaxFor('anything')).toBe(20)
    expect(DEFAULT_RATE_LIMIT_POLICY.minuteMaxFor('anything')).toBe(60)
    expect(DEFAULT_RATE_LIMIT_POLICY.burstWindowMs).toBe(10_000)
    expect(DEFAULT_RATE_LIMIT_POLICY.windowSeconds).toBe(60)
    expect(fake.bodies).toEqual([{ max: 60, windowSeconds: 60 }])
  })

  it('propagates a DO rejection with its retryAfter', async () => {
    const fake = fakeNamespace(() => deny(42))
    const limiter = createRateLimiter()
    const decision: RateLimitDecision = await limiter.enforceRateLimit({ RATE: fake.namespace }, 'verify', request())
    expect(decision).toEqual({ allowed: false, retryAfterSeconds: 42 })
  })

  it('does not consult the DO once the burst layer has blocked the request', async () => {
    const fake = fakeNamespace(() => allow())
    const limiter = createRateLimiter({ policy: { burstMaxFor: () => 1 }, now: () => 1_000_000 })
    await limiter.enforceRateLimit({ RATE: fake.namespace }, 'verify', request())
    const blocked = await limiter.enforceRateLimit({ RATE: fake.namespace }, 'verify', request())
    expect(blocked.allowed).toBe(false)
    expect(fake.names.length).toBe(1)
  })

  it('fails open when the namespace throws', async () => {
    const namespace: DurableObjectNamespaceLike = {
      idFromName: () => ({ toString: () => 'x' }),
      get: () => ({ fetch: async () => { throw new Error('boom') } })
    }
    const limiter = createRateLimiter()
    expect((await limiter.enforceRateLimit({ RATE: namespace }, 'verify', request())).allowed).toBe(true)
  })

  it('fails open when there is no DO binding (dev/test)', async () => {
    const limiter = createRateLimiter()
    expect((await limiter.enforceRateLimit({}, 'verify', request())).allowed).toBe(true)
  })

  it('reads the namespace through a custom accessor', async () => {
    const fake = fakeNamespace(() => allow())
    const limiter = createRateLimiter({ namespaceOf: (env) => (env as { LIMITER?: DurableObjectNamespaceLike }).LIMITER })
    expect((await limiter.enforceRateLimit({ LIMITER: fake.namespace }, 'r', request())).allowed).toBe(true)
    expect(fake.names.length).toBe(1)
    // Default accessor would not find it.
    expect((await limiter.enforceRateLimit({ RATE: fake.namespace }, 'r', request())).allowed).toBe(true)
    expect(fake.names.length).toBe(1)
  })

  it('supports an arbitrary window (hourly pairing, etc.) with no in-memory layer', async () => {
    const fake = fakeNamespace(() => allow())
    const limiter = createRateLimiter()
    await limiter.enforceRateLimitWindow({ RATE: fake.namespace }, 'pair', request(), 10, 3600)
    expect(fake.names).toEqual(['pair/203.0.113.7'])
    expect(fake.bodies).toEqual([{ max: 10, windowSeconds: 3600 }])
  })

  it('keys principal limits by the principal instead of the IP', async () => {
    const fake = fakeNamespace(() => allow())
    const limiter = createRateLimiter()
    await limiter.enforcePrincipalRateLimit({ RATE: fake.namespace }, 'agent', 'device-abc', 5, 60)
    expect(fake.names).toEqual(['agent/device-abc'])
    expect(fake.bodies).toEqual([{ max: 5, windowSeconds: 60 }])
  })
})

describe('createRateLimiter validation', () => {
  it('rejects a non-positive burst window', () => {
    expect(() => createRateLimiter({ policy: { burstWindowMs: 0 } })).toThrow(/burstWindowMs/)
  })

  it('rejects a non-integer minute window', () => {
    expect(() => createRateLimiter({ policy: { windowSeconds: 1.5 } })).toThrow(/windowSeconds/)
  })
})

describe('RateLimiter Durable Object (fixed window)', () => {
  function storage (): { get: <T>(key: string) => Promise<T | undefined>, put: (key: string, value: unknown) => Promise<void> } {
    const map = new Map<string, unknown>()
    return {
      get: async <T>(key: string) => map.get(key) as T | undefined,
      put: async (key, value) => { map.set(key, value) }
    }
  }

  async function check (limiter: RateLimiter, body: unknown): Promise<{ status: number, json: Record<string, unknown> }> {
    const response = await limiter.fetch(new Request('https://rate-limiter/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }))
    return { status: response.status, json: (await response.json()) as Record<string, unknown> }
  }

  it('counts up to max inside a window and rejects past it with retryAfter', async () => {
    const limiter = new RateLimiter({ storage: storage() })
    expect((await check(limiter, { max: 2, windowSeconds: 60 })).json).toMatchObject({ allowed: true, count: 1 })
    expect((await check(limiter, { max: 2, windowSeconds: 60 })).json).toMatchObject({ allowed: true, count: 2 })

    const third = await check(limiter, { max: 2, windowSeconds: 60 })
    expect(third.json.allowed).toBe(false)
    expect(third.json.retryAfter).toBe(60)
  })

  it('rolls the window over and restarts the count', async () => {
    let at = 1_000_000
    __setNow(() => at)
    const limiter = new RateLimiter({ storage: storage() })

    expect((await check(limiter, { max: 1, windowSeconds: 60 })).json).toMatchObject({ allowed: true, count: 1 })
    expect((await check(limiter, { max: 1, windowSeconds: 60 })).json.allowed).toBe(false)

    at += 59
    expect((await check(limiter, { max: 1, windowSeconds: 60 })).json.allowed).toBe(false)

    at += 1
    expect((await check(limiter, { max: 1, windowSeconds: 60 })).json).toMatchObject({
      allowed: true,
      count: 1,
      windowStart: 1_000_060
    })
  })

  it('restarts the window when the clock goes backwards (a wedged key heals)', async () => {
    let at = 1_000_000
    __setNow(() => at)
    const limiter = new RateLimiter({ storage: storage() })
    expect((await check(limiter, { max: 1, windowSeconds: 60 })).json.allowed).toBe(true)
    expect((await check(limiter, { max: 1, windowSeconds: 60 })).json.allowed).toBe(false)

    at = 500_000
    expect((await check(limiter, { max: 1, windowSeconds: 60 })).json).toMatchObject({ allowed: true, windowStart: 500_000 })
  })

  it('rejects non-positive policy numbers and unknown routes', async () => {
    const limiter = new RateLimiter({ storage: storage() })
    expect((await check(limiter, { max: 0, windowSeconds: 60 })).status).toBe(400)
    expect((await check(limiter, { max: 2, windowSeconds: -1 })).status).toBe(400)
    expect((await check(limiter, { max: '2', windowSeconds: 60 })).status).toBe(400)

    const notFound = await limiter.fetch(new Request('https://rate-limiter/nope', { method: 'POST' }))
    expect(notFound.status).toBe(404)
    const wrongMethod = await limiter.fetch(new Request('https://rate-limiter/check', { method: 'GET' }))
    expect(wrongMethod.status).toBe(404)
  })

  it('rejects a body that is not JSON', async () => {
    const limiter = new RateLimiter({ storage: storage() })
    const response = await limiter.fetch(new Request('https://rate-limiter/check', { method: 'POST', body: 'nope' }))
    expect(response.status).toBe(400)
  })
})
