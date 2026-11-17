/** Shared HTTP helpers for Worker routes. */

export interface ApiErrorBody {
  error: { code: string, message: string }
}

export function json (value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  })
}

/** The stable error envelope both products' clients already map codes from. */
export function errorResponse (status: number, code: string, message: string): Response {
  return json({ error: { code, message } } satisfies ApiErrorBody, status)
}

/**
 * Alias kept because both source repos call this `apiError`; importing it under the
 * old name should not require a rename in every route.
 */
export const apiError = errorResponse

/**
 * Default body cap: 1 MiB.
 *
 * The cap is per route and belongs to the caller (vault uses 1 MiB, send uses 2 MiB),
 * so this is only the default when none is passed.
 */
export const DEFAULT_MAX_JSON_BYTES = 1024 * 1024

/**
 * Reject oversized or malformed JSON bodies before a route sees them.
 *
 * The declared `content-length` is checked first so an oversized POST can be refused
 * without reading it; the decoded text is measured afterwards because a chunked
 * request may not declare a length at all. The post-read check measures UTF-16 code
 * units (`String#length`), which is how both source repos behaved: it is an upper
 * bound for ASCII-heavy JSON and a conservative one for the rest.
 */
export async function readJson<T> (request: Request, maxBytes = DEFAULT_MAX_JSON_BYTES): Promise<T | Response> {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > maxBytes) {
    return tooLarge(maxBytes)
  }
  const raw = await request.text()
  if (raw.length > maxBytes) {
    return tooLarge(maxBytes)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return errorResponse(400, 'ERR_BAD_JSON', 'Request body must be JSON')
  }
}

export function isResponse (value: unknown): value is Response {
  return value instanceof Response
}

function tooLarge (maxBytes: number): Response {
  return errorResponse(413, 'ERR_BODY_TOO_LARGE', `Body exceeds ${maxBytes} bytes`)
}
