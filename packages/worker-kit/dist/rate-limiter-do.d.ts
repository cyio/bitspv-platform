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
    get: <T>(key: string) => Promise<T | undefined>;
    put: (key: string, value: unknown) => Promise<void>;
}
export interface RateLimiterStateLike {
    storage: RateLimiterStorageLike;
}
export interface RateLimiterCheckBody {
    allowed: boolean;
    count: number;
    windowStart: number;
    retryAfter?: number;
}
export declare function __setNow(fn: () => number): void;
export declare function __resetNow(): void;
export declare class RateLimiter {
    private readonly state;
    private readonly _env?;
    constructor(state: RateLimiterStateLike, _env?: unknown | undefined);
    fetch(request: Request): Promise<Response>;
}
