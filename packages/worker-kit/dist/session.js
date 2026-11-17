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
import { fromBase64UrlToUtf8, hmacSha256HexOfUtf8, randomHex, sha256Hex, timingSafeEqual, toBase64UrlOfUtf8, utf8 } from "./crypto.js";
/** Seven days, the value both products shipped with. */
export const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const CSRF_HEADER = 'x-csrf-token';
/** Keys the kit owns; an `extra` payload field may not shadow them. */
export const RESERVED_SESSION_KEYS = ['sub', 'ikh', 'csrf', 'iat', 'exp', 'jti'];
export function createSessions(options) {
    if (options.cookieName === '')
        throw new Error('createSessions: cookieName is required');
    const cookieName = options.cookieName;
    const ttlSeconds = options.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
        throw new Error('createSessions: ttlSeconds must be a positive integer');
    }
    const csrfHeader = options.csrfHeader ?? CSRF_HEADER;
    const path = options.path ?? '/';
    const sameSite = options.sameSite ?? 'Lax';
    const clock = options.now ?? (() => Math.floor(Date.now() / 1000));
    const secure = options.secure ?? defaultSecure;
    const fixedSecret = options.secret;
    const secretOf = typeof fixedSecret === 'function' ? fixedSecret : () => fixedSecret;
    function buildCookie(env, value, maxAgeSeconds) {
        const attributes = [
            `${cookieName}=${value}`,
            `Path=${path}`,
            'HttpOnly',
            `SameSite=${sameSite}`,
            `Max-Age=${maxAgeSeconds}`
        ];
        if (secure(env))
            attributes.push('Secure');
        return attributes.join('; ');
    }
    async function issue(env, input) {
        const secret = requireSecret(secretOf(env));
        const now = input.now ?? clock();
        if (!Number.isFinite(now) || now <= 0)
            throw new Error('createSessions: now must be a Unix timestamp in seconds');
        const extra = input.extra;
        if (extra != null) {
            for (const key of Object.keys(extra)) {
                if (RESERVED_SESSION_KEYS.includes(key)) {
                    throw new Error(`createSessions: extra payload field "${key}" is reserved`);
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
        };
        const body = toBase64UrlOfUtf8(JSON.stringify(payload));
        const signature = await hmacSha256HexOfUtf8(secret, body);
        return { payload, cookie: buildCookie(env, `${body}.${signature}`, ttlSeconds) };
    }
    async function read(env, request) {
        const raw = readCookie(request, cookieName);
        if (raw == null)
            return null;
        const separator = raw.lastIndexOf('.');
        if (separator <= 0)
            return null;
        const body = raw.slice(0, separator);
        const signature = raw.slice(separator + 1);
        if (body === '' || signature === '')
            return null;
        // Throws when a production deployment has no secret — same rule as `issue`.
        const secret = requireSecret(secretOf(env));
        const expected = await hmacSha256HexOfUtf8(secret, body);
        if (!timingSafeEqual(expected, signature))
            return null;
        let parsed;
        try {
            parsed = JSON.parse(fromBase64UrlToUtf8(body));
        }
        catch {
            return null;
        }
        if (typeof parsed !== 'object' || parsed === null)
            return null;
        const payload = parsed;
        const now = clock();
        if (typeof payload.exp !== 'number' || payload.exp <= now)
            return null;
        if (typeof payload.sub !== 'string' || payload.sub === '')
            return null;
        if (typeof payload.csrf !== 'string' || payload.csrf === '')
            return null;
        return payload;
    }
    function csrfOk(request, session) {
        const token = request.headers.get(csrfHeader);
        if (token == null || token === '')
            return false;
        if (typeof session.csrf !== 'string' || session.csrf === '')
            return false;
        return timingSafeEqual(token, session.csrf);
    }
    function clearCookie(env) {
        return buildCookie(env, '', 0);
    }
    async function identityHashOf(appIdentity) {
        return (await sha256Hex(utf8(appIdentity))).slice(0, 32);
    }
    return { cookieName, csrfHeader, ttlSeconds, issue, read, csrfOk, clearCookie, identityHashOf };
}
function defaultSecure(env) {
    return typeof env === 'object' && env !== null &&
        env.ENVIRONMENT === 'production';
}
function requireSecret(secret) {
    if (typeof secret !== 'string' || secret === '') {
        throw new Error('session secret is missing (set SESSION_HMAC_KEY / pass a secret)');
    }
    return secret;
}
function readCookie(request, name) {
    const header = request.headers.get('Cookie');
    if (header == null)
        return null;
    for (const part of header.split(';')) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf('=');
        if (eq <= 0)
            continue;
        if (trimmed.slice(0, eq) === name)
            return trimmed.slice(eq + 1);
    }
    return null;
}
