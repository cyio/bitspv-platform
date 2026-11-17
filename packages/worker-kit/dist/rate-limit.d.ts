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
    toString: () => string;
}
export interface DurableObjectStubLike {
    fetch: (input: string | Request, init?: RequestInit) => Promise<Response>;
}
export interface DurableObjectNamespaceLike {
    idFromName: (name: string) => DurableObjectIdLike;
    get: (id: DurableObjectIdLike) => DurableObjectStubLike;
}
/** The env shape this module reads; anything with a `RATE` binding satisfies it. */
export interface RateLimitEnvLike {
    RATE?: DurableObjectNamespaceLike;
}
export interface RateLimitDecision {
    allowed: boolean;
    retryAfterSeconds?: number;
}
export interface RateLimitPolicy {
    /** In-memory sliding window length, milliseconds. */
    burstWindowMs: number;
    /** Per-isolate burst allowance for a route. */
    burstMaxFor: (route: string) => number;
    /** Durable-Object fixed window length, seconds. */
    windowSeconds: number;
    /** Durable-Object fixed-window allowance for a route. */
    minuteMaxFor: (route: string) => number;
}
/**
 * Defaults are the numbers both products shipped with for control-plane routes.
 * A product that needs route-dependent or larger values overrides the functions.
 */
export declare const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicy;
export interface RateLimiterOptions {
    /** Missing fields fall back to `DEFAULT_RATE_LIMIT_POLICY`. */
    policy?: Partial<RateLimitPolicy>;
    /** Where the DO namespace lives on `env`. Default: `env.RATE`. */
    namespaceOf?: (env: unknown) => DurableObjectNamespaceLike | undefined;
    /** Header carrying the client IP. Default `cf-connecting-ip`. */
    ipHeader?: string;
    /** IP normaliser; default `normalizeClientIp`. */
    normalizeIp?: (raw: string | null | undefined) => string | null;
    /** Clock in milliseconds; injectable for tests. Default `Date.now`. */
    now?: () => number;
    /** Sweep the in-memory map every N operations. Default 1000. */
    sweepEvery?: number;
    /** Hard cap on in-memory keys before a sweep. Default 50 000. */
    maxMemoryKeys?: number;
}
/** The object `createRateLimiter` returns. Named `Kit` so it does not collide with the DO class. */
export interface RateLimitKit {
    readonly policy: RateLimitPolicy;
    /** Both layers: per-isolate burst, then the DO minute window. */
    enforceRateLimit: (env: unknown, route: string, request: Request) => Promise<RateLimitDecision>;
    /** An arbitrary window that does not fit the burst/minute pair (e.g. 10 per hour). */
    enforceRateLimitWindow: (env: unknown, route: string, request: Request, max: number, windowSeconds: number) => Promise<RateLimitDecision>;
    /** A window keyed by principal (device id) rather than IP — shared egress breaks per-IP keys. */
    enforcePrincipalRateLimit: (env: unknown, route: string, principalKey: string, max: number, windowSeconds: number) => Promise<RateLimitDecision>;
    /** Test helper: clear this instance's per-isolate memory. */
    resetMemory: () => void;
}
export declare function createRateLimiter(options?: RateLimiterOptions): RateLimitKit;
/**
 * Normalise a client IP into a rate-limit key.
 *
 * Production reads this from `CF-Connecting-IP`, which Cloudflare injects and the
 * client cannot spoof. IPv6 is truncated to /64 so one subscriber cannot rotate
 * addresses to dodge the limit. If the address cannot be split safely we fall back
 * to the raw value — still a valid, conservative key.
 */
export declare function normalizeClientIp(raw: string | null | undefined): string | null;
