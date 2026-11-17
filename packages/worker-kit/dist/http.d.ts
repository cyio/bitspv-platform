/** Shared HTTP helpers for Worker routes. */
export interface ApiErrorBody {
    error: {
        code: string;
        message: string;
    };
}
export declare function json(value: unknown, status?: number, headers?: Record<string, string>): Response;
/** The stable error envelope both products' clients already map codes from. */
export declare function errorResponse(status: number, code: string, message: string): Response;
/**
 * Alias kept because both source repos call this `apiError`; importing it under the
 * old name should not require a rename in every route.
 */
export declare const apiError: typeof errorResponse;
/**
 * Default body cap: 1 MiB.
 *
 * The cap is per route and belongs to the caller (vault uses 1 MiB, send uses 2 MiB),
 * so this is only the default when none is passed.
 */
export declare const DEFAULT_MAX_JSON_BYTES: number;
/**
 * Reject oversized or malformed JSON bodies before a route sees them.
 *
 * The declared `content-length` is checked first so an oversized POST can be refused
 * without reading it; the decoded text is measured afterwards because a chunked
 * request may not declare a length at all. The post-read check measures UTF-16 code
 * units (`String#length`), which is how both source repos behaved: it is an upper
 * bound for ASCII-heavy JSON and a conservative one for the rest.
 */
export declare function readJson<T>(request: Request, maxBytes?: number): Promise<T | Response>;
export declare function isResponse(value: unknown): value is Response;
