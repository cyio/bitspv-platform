/**
 * RateLimiter Durable Object.
 *
 * One instance per `route/key` name. A fixed-window counter, strongly consistent
 * because a single DO instance processes one request at a time — unlike KV, whose
 * read-modify-write under-counts exactly when it matters (high concurrency).
 *
 * The policy numbers arrive in the request body, so this class stays generic and the
 * thresholds stay in the product (`src/shared/rate-limit.ts` there, `rate-limit.ts`
 * here with `createRateLimiter`).
 *
 *   POST /check  { max, windowSeconds }  ->  { allowed, count, windowStart, retryAfter? }
 *
 * Wiring it up in a Worker is unchanged:
 *
 *   export { RateLimiter } from '@bitspv/worker-kit/rate-limiter-do'
 *   // wrangler.jsonc → durable_objects.bindings: [{ name: 'RATE', class_name: 'RateLimiter' }]
 */

export interface RateLimiterStorageLike {
  get: <T>(key: string) => Promise<T | undefined>
  put: (key: string, value: unknown) => Promise<void>
}

export interface RateLimiterStateLike {
  storage: RateLimiterStorageLike
}

export interface RateLimiterCheckBody {
  allowed: boolean
  count: number
  windowStart: number
  retryAfter?: number
}

const COUNT_KEY = 'count'
const WINDOW_KEY = 'windowStart'

/** Injectable clock for tests; the platform constructs the DO with `(state, env)`. */
let nowSeconds = (): number => Math.floor(Date.now() / 1000)

export function __setNow (fn: () => number): void {
  nowSeconds = fn
}

export function __resetNow (): void {
  nowSeconds = () => Math.floor(Date.now() / 1000)
}

export class RateLimiter {
  constructor (
    private readonly state: RateLimiterStateLike,
    // Wrangler passes `(state, env)`. Unused here, but the signature must accept it.
    private readonly _env?: unknown
  ) {}

  async fetch (request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname !== '/check' || request.method !== 'POST') {
      return json({ error: 'not found' }, 404)
    }

    let body: { max?: unknown, windowSeconds?: unknown }
    try {
      body = (await request.json()) as { max?: unknown, windowSeconds?: unknown }
    } catch {
      return json({ error: 'invalid JSON body' }, 400)
    }

    const max = body.max
    const windowSeconds = body.windowSeconds
    if (typeof max !== 'number' || !Number.isInteger(max) || max <= 0 ||
        typeof windowSeconds !== 'number' || !Number.isInteger(windowSeconds) || windowSeconds <= 0) {
      return json({ error: 'max and windowSeconds must be positive integers' }, 400)
    }

    const now = nowSeconds()
    const storedStart = await this.state.storage.get<number>(WINDOW_KEY)

    // A "new window" is: no stored start, the window having passed, or the clock
    // having gone backwards. All three must persist the start, else the window never
    // rolls and the key wedges open.
    if (storedStart == null || now - storedStart >= windowSeconds || now < storedStart) {
      await this.state.storage.put(WINDOW_KEY, now)
      await this.state.storage.put(COUNT_KEY, 1)
      return json({ allowed: true, count: 1, windowStart: now } satisfies RateLimiterCheckBody)
    }

    const count = (await this.state.storage.get<number>(COUNT_KEY)) ?? 0
    if (count >= max) {
      const retryAfter = storedStart + windowSeconds - now
      return json({
        allowed: false,
        count,
        windowStart: storedStart,
        retryAfter
      } satisfies RateLimiterCheckBody)
    }

    await this.state.storage.put(COUNT_KEY, count + 1)
    return json({ allowed: true, count: count + 1, windowStart: storedStart } satisfies RateLimiterCheckBody)
  }
}

function json (value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}
