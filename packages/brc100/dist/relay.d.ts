/**
 * Client for the BitSPV relay (`relay.bitspv.com`).
 *
 * The relay is transport only: it signs the pairing QR, forwards encrypted
 * BRC-100 requests to the phone, and returns the answer. This client mirrors that
 * boundary — it pairs, carries the RPC envelope and maps transport failures. It
 * never inspects a signature, constructs a protocol preimage or touches a user
 * key. Callers verify every result themselves.
 *
 * Extracted from `bitspv-send/src/worker/relay.ts`; the HTTP contract is the
 * relay's `POST /api/session`, `GET|DELETE /api/session/:id` and
 * `POST /api/request/:id`.
 *
 * No `@bsv/sdk` import here on purpose: this module must stay cheap enough for a
 * Worker bundle.
 */
export declare const RELAY_APP_HEADER = "x-relay-app";
export declare const RELAY_SECRET_HEADER = "x-relay-secret";
export declare const RELAY_DESKTOP_TOKEN_HEADER = "x-desktop-token";
/**
 * `ERR_RELAY_*` are transport problems; the two `ERR_WALLET_*` codes mean the
 * relay answered but the phone side was missing or too slow.
 *
 * New consumers should switch on these codes, not on HTTP status.
 */
export type RelayErrorCode = 'ERR_RELAY_CONFIG' | 'ERR_RELAY_UNAVAILABLE' | 'ERR_RELAY_REJECTED' | 'ERR_RELAY_PROTOCOL' | 'ERR_PAIR_NOT_FOUND' | 'ERR_WALLET_TIMEOUT' | 'ERR_WALLET_NOT_CONNECTED';
export declare class RelayError extends Error {
    readonly code: RelayErrorCode;
    /** HTTP status when the relay answered; 502 for local transport/config errors. */
    readonly status: number;
    constructor(code: RelayErrorCode, message: string, status?: number);
}
/** The body of `POST /api/request/:id`. */
export interface RelayRequestEnvelope {
    /** e.g. `getPublicKey`, `createSignature`, `createAction`. */
    method: string;
    params?: unknown;
}
export interface RelayRpcError {
    code?: number;
    message?: string;
}
/** The relay's answer to one RPC. A 200 may still carry a wallet-level `error`. */
export interface RelayRpcResponse {
    result?: Record<string, unknown>;
    error?: RelayRpcError;
}
/** True when the wallet answered without a wallet-level error. */
export declare function isRelayRpcSuccess(response: RelayRpcResponse): boolean;
/**
 * Serialise one RPC envelope. Validates the method here so an empty or oversized
 * value can never reach the relay (which would answer 400 and lose the reason).
 */
export declare function encodeRelayEnvelope(envelope: RelayRequestEnvelope): string;
/** Parse an envelope. Used by tests and by any consumer that terminates a relay. */
export declare function decodeRelayEnvelope(raw: string): RelayRequestEnvelope;
/**
 * Parse a relay RPC response. The shape is checked because a wrong shape must
 * fail with a clear code, not surface later as `undefined.publicKey`.
 */
export declare function decodeRelayResponse(raw: string): RelayRpcResponse;
/** What `POST /api/session` returns. `desktopToken` is a bearer secret. */
export interface RelaySessionInfo {
    sessionId: string;
    status: string;
    qrDataUrl?: string;
    pairingUri: string;
    desktopToken: string;
}
/** What `GET /api/session/:id` returns; safe to hand to the phone. */
export interface RelaySessionPublic {
    sessionId: string;
    status: string;
    relay: string;
    backendIdentityKey?: string;
}
export interface RelayTimeouts {
    createMs: number;
    getMs: number;
    requestMs: number;
    deleteMs: number;
}
/** Same budgets as send's original client. */
export declare const DEFAULT_RELAY_TIMEOUTS: RelayTimeouts;
export interface RelayClientConfig {
    /** e.g. `https://relay.bitspv.com`; trailing slashes are ignored. */
    baseUrl: string;
    /** The `x-relay-app` name registered on the relay, e.g. `send`. */
    appName: string;
    /** The shared secret for that app. Never log it. */
    appSecret: string;
    /** Injection seam for tests / non-global fetch environments. */
    fetch?: typeof fetch;
    timeouts?: Partial<RelayTimeouts>;
}
/**
 * One relay client per app deployment. Cheap to keep at module scope; safe to
 * create per request.
 */
export declare class RelayClient {
    private readonly baseUrl;
    private readonly appName;
    private readonly appSecret;
    private readonly fetchImpl;
    private readonly timeouts;
    constructor(config: RelayClientConfig);
    /**
     * Send one authenticated request and return the raw `Response`.
     *
     * Caller-visible bodies are never echoed into errors: the relay's error pages
     * can contain upstream text we do not want to render.
     */
    private request;
    /** Create one pairing. `origin` must be an origin this app registered. */
    createSession(origin: string): Promise<RelaySessionInfo>;
    /** Status + relay URL + backend key; the phone-facing control-plane read. */
    getSession(sessionId: string): Promise<RelaySessionPublic>;
    /**
     * Send one fixed RPC to the phone.
     *
     * The caller decides which methods are allowed; this client deliberately does
     * not become a general signing proxy. A 200 response may still carry a
     * wallet-level `error` — check `isRelayRpcSuccess` or inspect `result`.
     */
    sendRequest(sessionId: string, desktopToken: string, method: string, params?: unknown): Promise<RelayRpcResponse>;
    /** Best-effort teardown: failures here never fail the caller's request. */
    deleteSession(sessionId: string, desktopToken: string): Promise<void>;
    private readText;
    private readJson;
}
