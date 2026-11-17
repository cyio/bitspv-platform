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
/** Seven days, the value both products shipped with. */
export declare const DEFAULT_SESSION_TTL_SECONDS: number;
export declare const CSRF_HEADER = "x-csrf-token";
/** Keys the kit owns; an `extra` payload field may not shadow them. */
export declare const RESERVED_SESSION_KEYS: readonly ["sub", "ikh", "csrf", "iat", "exp", "jti"];
export interface SessionPayloadBase {
    /** accountId */
    sub: string;
    /** sha256(appIdentity) prefix — scopes an owner without storing the key. */
    ikh: string;
    /** CSRF token, bound into the signature. */
    csrf: string;
    /** Issued at, Unix seconds. */
    iat: number;
    /** Expires at, Unix seconds. */
    exp: number;
    /** Random id, so two sessions issued in the same second still differ. */
    jti: string;
}
/**
 * The signed payload. `TExtra` is the only extension point — vault instantiates the
 * kit as `createSessions<{ vid: string }>()`, send uses the default and gets nothing
 * but the base fields.
 */
export type SessionPayload<TExtra extends object = {}> = SessionPayloadBase & TExtra;
type ExtraInput<TExtra extends object> = [keyof TExtra] extends [never] ? {
    extra?: TExtra;
} : {
    extra: TExtra;
};
export type IssueSessionInput<TExtra extends object = {}> = {
    accountId: string;
    /** `sha256Hex(utf8(appIdentity)).slice(0, 32)` — see `identityHashOf`. */
    identityHash: string;
    /** Unix seconds; defaults to the configured clock. */
    now?: number;
} & ExtraInput<TExtra>;
export interface IssuedSession<TExtra extends object = {}> {
    payload: SessionPayload<TExtra>;
    cookie: string;
}
/**
 * HMAC secret. Pass a string, or a reader that pulls it off `env` and throws when a
 * production deployment forgot to set it (fail loud, not "everyone is logged out").
 */
export type SessionSecret = string | ((env: unknown) => string);
export interface SessionOptions {
    cookieName: string;
    secret: SessionSecret;
    /** Lifetime in seconds. Default 7 days. */
    ttlSeconds?: number;
    /** Header carrying the CSRF token. Default `x-csrf-token`. */
    csrfHeader?: string;
    /** Cookie path. Default `/`. */
    path?: string;
    /** Cookie SameSite attribute. Default `Lax`. */
    sameSite?: 'Lax' | 'Strict' | 'None';
    /**
     * Whether to append `Secure`. Default: `env.ENVIRONMENT === 'production'`, because
     * localhost is a secure context but browsers still refuse `Secure` over plain http.
     */
    secure?: (env: unknown) => boolean;
    /** Clock in Unix seconds; injectable for tests. */
    now?: () => number;
}
export interface SessionKit<TExtra extends object = {}> {
    readonly cookieName: string;
    readonly csrfHeader: string;
    readonly ttlSeconds: number;
    issue(env: unknown, input: IssueSessionInput<TExtra>): Promise<IssuedSession<TExtra>>;
    /** The payload, or null when the cookie is absent, forged, tampered with or expired. */
    read(env: unknown, request: Request): Promise<SessionPayload<TExtra> | null>;
    csrfOk(request: Request, session: SessionPayloadBase): boolean;
    /** `Set-Cookie` value that deletes the cookie. */
    clearCookie(env: unknown): string;
    /** `sha256Hex(utf8(appIdentity))` truncated to 32 hex chars. */
    identityHashOf(appIdentity: string): Promise<string>;
}
export declare function createSessions<TExtra extends object = {}>(options: SessionOptions): SessionKit<TExtra>;
export {};
