/** Shared HTTP helpers for Worker routes. */
export function json(value, status = 200, headers = {}) {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
    });
}
/** The stable error envelope both products' clients already map codes from. */
export function errorResponse(status, code, message) {
    return json({ error: { code, message } }, status);
}
/**
 * Alias kept because both source repos call this `apiError`; importing it under the
 * old name should not require a rename in every route.
 */
export const apiError = errorResponse;
/**
 * Default body cap: 1 MiB.
 *
 * The cap is per route and belongs to the caller (vault uses 1 MiB, send uses 2 MiB),
 * so this is only the default when none is passed.
 */
export const DEFAULT_MAX_JSON_BYTES = 1024 * 1024;
/**
 * Reject oversized or malformed JSON bodies before a route sees them.
 *
 * The declared `content-length` is checked first so an oversized POST can be refused
 * without reading it; the decoded text is measured afterwards because a chunked
 * request may not declare a length at all. The post-read check measures UTF-16 code
 * units (`String#length`), which is how both source repos behaved: it is an upper
 * bound for ASCII-heavy JSON and a conservative one for the rest.
 */
export async function readJson(request, maxBytes = DEFAULT_MAX_JSON_BYTES) {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(declared) && declared > maxBytes) {
        return tooLarge(maxBytes);
    }
    const raw = await request.text();
    if (raw.length > maxBytes) {
        return tooLarge(maxBytes);
    }
    try {
        return JSON.parse(raw);
    }
    catch {
        return errorResponse(400, 'ERR_BAD_JSON', 'Request body must be JSON');
    }
}
export function isResponse(value) {
    return value instanceof Response;
}
function tooLarge(maxBytes) {
    return errorResponse(413, 'ERR_BODY_TOO_LARGE', `Body exceeds ${maxBytes} bytes`);
}
