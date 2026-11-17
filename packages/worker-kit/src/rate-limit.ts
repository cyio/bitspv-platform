/**
 * Rate-limit enforcement: a per-isolate in-memory sliding window (cheap first line)
 * in front of the `RateLimiter` Durable Object (exact, cross-isolate fixed window).
 *
 * fail-open: when the request carries no client IP, or the DO is unavailable, the
 * request is allowed. A rate limiter must never become the thing that takes the
 * service down.
 *
 * Everything a product tunes is an option, because send and vault genuinely differ:
 *
 *   - send:  `burstMaxFor`/`minuteMaxFor` keyed by route (30/60 for `blob`, 20/60
 *            otherwise), so one 2 GiB upload is not throttled by its own chunk count;
 *   - vault: one global 20/10 s burst and 60/60 s minute window.
 *
 * Both are expressed with the same `createRateLimiter` call — no policy here.
 */

/** Structural types, so a product's own `Env` interface (no workers-types) fits. */
export interface DurableObjectIdLike {
  toString: () => string
}

export interface DurableObjectStubLike {
  fetch: (input: string | Request, init?: RequestInit) => Promise<Response>
}

export interface DurableObjectNamespaceLike {
  idFromName: (name: string) => DurableObjectIdLike
  get: (id: DurableObjectIdLike) => DurableObjectStubLike
}

/** The env shape this module reads; anything with a `RATE` binding satisfies it. */
export interface RateLimitEnvLike {
  RATE?: DurableObjectNamespaceLike
}

export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds?: number
}

export interface RateLimitPolicy {
  /** In-memory sliding window length, milliseconds. */
  burstWindowMs: number
  /** Per-isolate burst allowance for a route. */
  burstMaxFor: (route: string) => number
  /** Durable-Object fixed window length, seconds. */
  windowSeconds: number
  /** Durable-Object fixed-window allowance for a route. */
  minuteMaxFor: (route: string) => number
}

/**
 * Defaults are the numbers both products shipped with for control-plane routes.
 * A product that needs route-dependent or larger values overrides the functions.
 */
export const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicy = {
  burstWindowMs: 10 * 1000,
  burstMaxFor: () => 20,
  windowSeconds: 60,
  minuteMaxFor: () => 60
}

export interface RateLimiterOptions {
  /** Missing fields fall back to `DEFAULT_RATE_LIMIT_POLICY`. */
  policy?: Partial<RateLimitPolicy>
  /** Where the DO namespace lives on `env`. Default: `env.RATE`. */
  namespaceOf?: (env: unknown) => DurableObjectNamespaceLike | undefined
  /** Header carrying the client IP. Default `cf-connecting-ip`. */
  ipHeader?: string
  /** IP normaliser; default `normalizeClientIp`. */
  normalizeIp?: (raw: string | null | undefined) => string | null
  /** Clock in milliseconds; injectable for tests. Default `Date.now`. */
  now?: () => number
  /** Sweep the in-memory map every N operations. Default 1000. */
  sweepEvery?: number
  /** Hard cap on in-memory keys before a sweep. Default 50 000. */
  maxMemoryKeys?: number
}

/** The object `createRateLimiter` returns. Named `Kit` so it does not collide with the DO class. */
export interface RateLimitKit {
  readonly policy: RateLimitPolicy
  /** Both layers: per-isolate burst, then the DO minute window. */
  enforceRateLimit: (env: unknown, route: string, request: Request) => Promise<RateLimitDecision>
  /** An arbitrary window that does not fit the burst/minute pair (e.g. 10 per hour). */
  enforceRateLimitWindow: (
    env: unknown,
    route: string,
    request: Request,
    max: number,
    windowSeconds: number
  ) => Promise<RateLimitDecision>
  /** A window keyed by principal (device id) rather than IP — shared egress breaks per-IP keys. */
  enforcePrincipalRateLimit: (
    env: unknown,
    route: string,
    principalKey: string,
    max: number,
    windowSeconds: number
  ) => Promise<RateLimitDecision>
  /** Test helper: clear this instance's per-isolate memory. */
  resetMemory: () => void
}

export function createRateLimiter (options: RateLimiterOptions = {}): RateLimitKit {
  const policy: RateLimitPolicy = {
    burstWindowMs: options.policy?.burstWindowMs ?? DEFAULT_RATE_LIMIT_POLICY.burstWindowMs,
    burstMaxFor: options.policy?.burstMaxFor ?? DEFAULT_RATE_LIMIT_POLICY.burstMaxFor,
    windowSeconds: options.policy?.windowSeconds ?? DEFAULT_RATE_LIMIT_POLICY.windowSeconds,
    minuteMaxFor: options.policy?.minuteMaxFor ?? DEFAULT_RATE_LIMIT_POLICY.minuteMaxFor
  }
  if (!Number.isFinite(policy.burstWindowMs) || policy.burstWindowMs <= 0) {
    throw new Error('createRateLimiter: burstWindowMs must be a positive number')
  }
  if (!Number.isInteger(policy.windowSeconds) || policy.windowSeconds <= 0) {
    throw new Error('createRateLimiter: windowSeconds must be a positive integer')
  }

  const namespaceOf = options.namespaceOf ??
    ((env: unknown): DurableObjectNamespaceLike | undefined => (env as RateLimitEnvLike | undefined)?.RATE)
  const ipHeader = options.ipHeader ?? 'cf-connecting-ip'
  const normalizeIp = options.normalizeIp ?? normalizeClientIp
  const now = options.now ?? ((): number => Date.now())
  const sweepEvery = options.sweepEvery ?? 1000
  const maxMemoryKeys = options.maxMemoryKeys ?? 50_000

  // Per-instance module state: lives for the isolate, dies with it.
  const memory = new Map<string, number[]>()
  let operationsSinceSweep = 0

  function checkMemory (key: string, at: number, limit: number): boolean {
    const cutoff = at - policy.burstWindowMs
    const times = memory.get(key)
    if (times == null) {
      memory.set(key, [at])
      return true
    }
    const kept = times.filter((time) => time >= cutoff)
    if (kept.length >= limit) {
      memory.set(key, kept)
      return false
    }
    kept.push(at)
    memory.set(key, kept)
    return true
  }

  function sweepMemory (at: number): void {
    const cutoff = at - policy.burstWindowMs
    for (const [key, times] of memory) {
      const kept = times.filter((time) => time >= cutoff)
      if (kept.length === 0) memory.delete(key)
      else memory.set(key, kept)
    }
  }

  function maybeSweep (at: number): void {
    operationsSinceSweep++
    if (operationsSinceSweep >= sweepEvery || memory.size > maxMemoryKeys) {
      sweepMemory(at)
      operationsSinceSweep = 0
    }
  }

  async function checkDurableObject (
    env: unknown,
    route: string,
    key: string,
    max: number,
    windowSeconds: number
  ): Promise<RateLimitDecision> {
    const namespace = namespaceOf(env)
    if (namespace == null) return { allowed: true } // no DO binding (dev/test) -> allow
    try {
      const stub = namespace.get(namespace.idFromName(`${route}/${key}`))
      const response = await stub.fetch('https://rate-limiter/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ max, windowSeconds })
      })
      const body = (await response.json()) as { allowed?: boolean, retryAfter?: number }
      if (body.allowed === false) {
        return {
          allowed: false,
          retryAfterSeconds: typeof body.retryAfter === 'number' ? body.retryAfter : windowSeconds
        }
      }
      return { allowed: true }
    } catch {
      return { allowed: true } // fail-open
    }
  }

  async function enforceRateLimit (env: unknown, route: string, request: Request): Promise<RateLimitDecision> {
    const ip = normalizeIp(request.headers.get(ipHeader))
    if (ip == null) return { allowed: true } // no client IP -> cannot rate limit

    const key = `${route}|${ip}`
    const at = now()
    maybeSweep(at)
    if (!checkMemory(key, at, policy.burstMaxFor(route))) {
      return { allowed: false, retryAfterSeconds: Math.ceil(policy.burstWindowMs / 1000) }
    }

    return await checkDurableObject(env, route, ip, policy.minuteMaxFor(route), policy.windowSeconds)
  }

  async function enforceRateLimitWindow (
    env: unknown,
    route: string,
    request: Request,
    max: number,
    windowSeconds: number
  ): Promise<RateLimitDecision> {
    const ip = normalizeIp(request.headers.get(ipHeader))
    if (ip == null) return { allowed: true }
    return await checkDurableObject(env, route, ip, max, windowSeconds)
  }

  async function enforcePrincipalRateLimit (
    env: unknown,
    route: string,
    principalKey: string,
    max: number,
    windowSeconds: number
  ): Promise<RateLimitDecision> {
    if (principalKey === '') return { allowed: true }
    return await checkDurableObject(env, route, principalKey, max, windowSeconds)
  }

  return {
    policy,
    enforceRateLimit,
    enforceRateLimitWindow,
    enforcePrincipalRateLimit,
    resetMemory: () => {
      memory.clear()
      operationsSinceSweep = 0
    }
  }
}

/**
 * Normalise a client IP into a rate-limit key.
 *
 * Production reads this from `CF-Connecting-IP`, which Cloudflare injects and the
 * client cannot spoof. IPv6 is truncated to /64 so one subscriber cannot rotate
 * addresses to dodge the limit. If the address cannot be split safely we fall back
 * to the raw value — still a valid, conservative key.
 */
export function normalizeClientIp (raw: string | null | undefined): string | null {
  if (raw == null) return null
  const ip = raw.trim().toLowerCase()
  if (ip === '') return null
  if (ip.includes(':')) {
    const groups = ip.split(':')
    return groups.length >= 4 ? `${groups.slice(0, 4).join(':')}::/64` : ip
  }
  return ip
}
