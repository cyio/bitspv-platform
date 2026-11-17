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

export const RELAY_APP_HEADER = 'x-relay-app'
export const RELAY_SECRET_HEADER = 'x-relay-secret'
export const RELAY_DESKTOP_TOKEN_HEADER = 'x-desktop-token'

/**
 * `ERR_RELAY_*` are transport problems; the two `ERR_WALLET_*` codes mean the
 * relay answered but the phone side was missing or too slow.
 *
 * New consumers should switch on these codes, not on HTTP status.
 */
export type RelayErrorCode =
  | 'ERR_RELAY_CONFIG'
  | 'ERR_RELAY_UNAVAILABLE'
  | 'ERR_RELAY_REJECTED'
  | 'ERR_RELAY_PROTOCOL'
  | 'ERR_PAIR_NOT_FOUND'
  | 'ERR_WALLET_TIMEOUT'
  | 'ERR_WALLET_NOT_CONNECTED'

export class RelayError extends Error {
  readonly code: RelayErrorCode
  /** HTTP status when the relay answered; 502 for local transport/config errors. */
  readonly status: number

  constructor (code: RelayErrorCode, message: string, status = 502) {
    super(message)
    this.name = 'RelayError'
    this.code = code
    this.status = status
  }
}

// --- envelopes -------------------------------------------------------------

/** The body of `POST /api/request/:id`. */
export interface RelayRequestEnvelope {
  /** e.g. `getPublicKey`, `createSignature`, `createAction`. */
  method: string
  params?: unknown
}

export interface RelayRpcError {
  code?: number
  message?: string
}

/** The relay's answer to one RPC. A 200 may still carry a wallet-level `error`. */
export interface RelayRpcResponse {
  result?: Record<string, unknown>
  error?: RelayRpcError
}

/** True when the wallet answered without a wallet-level error. */
export function isRelayRpcSuccess (response: RelayRpcResponse): boolean {
  return response.error == null
}

/** The relay rejects methods longer than this (`server.ts`). */
const MAX_METHOD_LENGTH = 64

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMethod (value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_METHOD_LENGTH &&
    value.trim() !== ''
}

function parseJson (raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new RelayError('ERR_RELAY_PROTOCOL', 'relay envelope is not valid JSON')
  }
}

/**
 * Serialise one RPC envelope. Validates the method here so an empty or oversized
 * value can never reach the relay (which would answer 400 and lose the reason).
 */
export function encodeRelayEnvelope (envelope: RelayRequestEnvelope): string {
  if (!isRecord(envelope)) {
    throw new RelayError('ERR_RELAY_PROTOCOL', 'relay envelope must be an object')
  }
  const method: unknown = envelope.method
  if (!isMethod(method)) {
    throw new RelayError('ERR_RELAY_PROTOCOL', 'relay envelope needs a non-empty method (max 64 chars)')
  }
  const body: Record<string, unknown> = { method }
  if (envelope.params !== undefined) body.params = envelope.params
  try {
    return JSON.stringify(body)
  } catch {
    throw new RelayError('ERR_RELAY_PROTOCOL', 'relay envelope is not serialisable')
  }
}

/** Parse an envelope. Used by tests and by any consumer that terminates a relay. */
export function decodeRelayEnvelope (raw: string): RelayRequestEnvelope {
  const parsed = parseJson(raw)
  if (!isRecord(parsed)) {
    throw new RelayError('ERR_RELAY_PROTOCOL', 'relay envelope must be a JSON object')
  }
  const method = parsed.method
  if (!isMethod(method)) {
    throw new RelayError('ERR_RELAY_PROTOCOL', 'relay envelope needs a non-empty method (max 64 chars)')
  }
  return parsed.params === undefined ? { method } : { method, params: parsed.params }
}

/**
 * Parse a relay RPC response. The shape is checked because a wrong shape must
 * fail with a clear code, not surface later as `undefined.publicKey`.
 */
export function decodeRelayResponse (raw: string): RelayRpcResponse {
  const parsed = parseJson(raw)
  if (!isRecord(parsed)) {
    throw new RelayError('ERR_RELAY_PROTOCOL', 'relay response must be a JSON object')
  }

  const response: RelayRpcResponse = {}

  if (parsed.result !== undefined) {
    if (!isRecord(parsed.result)) {
      throw new RelayError('ERR_RELAY_PROTOCOL', 'relay response result must be an object')
    }
    response.result = parsed.result
  }

  if (parsed.error !== undefined) {
    if (!isRecord(parsed.error)) {
      throw new RelayError('ERR_RELAY_PROTOCOL', 'relay response error must be an object')
    }
    const code = parsed.error.code
    const message = parsed.error.message
    if (code !== undefined && typeof code !== 'number') {
      throw new RelayError('ERR_RELAY_PROTOCOL', 'relay response error.code must be a number')
    }
    if (message !== undefined && typeof message !== 'string') {
      throw new RelayError('ERR_RELAY_PROTOCOL', 'relay response error.message must be a string')
    }
    const error: RelayRpcError = {}
    if (code !== undefined) error.code = code
    if (message !== undefined) error.message = message
    response.error = error
  }

  return response
}

// --- sessions --------------------------------------------------------------

/** What `POST /api/session` returns. `desktopToken` is a bearer secret. */
export interface RelaySessionInfo {
  sessionId: string
  status: string
  qrDataUrl?: string
  pairingUri: string
  desktopToken: string
}

/** What `GET /api/session/:id` returns; safe to hand to the phone. */
export interface RelaySessionPublic {
  sessionId: string
  status: string
  relay: string
  backendIdentityKey?: string
}

function requireString (
  record: Record<string, unknown>,
  field: string,
  options: { allowEmpty?: boolean } = {}
): string {
  const value = record[field]
  if (typeof value !== 'string' || (options.allowEmpty !== true && value.trim() === '')) {
    throw new RelayError('ERR_RELAY_PROTOCOL', `relay response is missing a usable "${field}"`)
  }
  return value
}

function optionalString (record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new RelayError('ERR_RELAY_PROTOCOL', `relay response field "${field}" must be a string`)
  }
  return value
}

function parseSessionInfo (value: unknown): RelaySessionInfo {
  if (!isRecord(value)) {
    throw new RelayError('ERR_RELAY_PROTOCOL', 'relay session response must be a JSON object')
  }
  const info: RelaySessionInfo = {
    sessionId: requireString(value, 'sessionId'),
    status: requireString(value, 'status'),
    pairingUri: requireString(value, 'pairingUri'),
    desktopToken: requireString(value, 'desktopToken')
  }
  const qrDataUrl = optionalString(value, 'qrDataUrl')
  if (qrDataUrl !== undefined) info.qrDataUrl = qrDataUrl
  return info
}

function parseSessionPublic (value: unknown): RelaySessionPublic {
  if (!isRecord(value)) {
    throw new RelayError('ERR_RELAY_PROTOCOL', 'relay session response must be a JSON object')
  }
  const info: RelaySessionPublic = {
    sessionId: requireString(value, 'sessionId'),
    status: requireString(value, 'status'),
    relay: requireString(value, 'relay')
  }
  const backendIdentityKey = optionalString(value, 'backendIdentityKey')
  if (backendIdentityKey !== undefined) info.backendIdentityKey = backendIdentityKey
  return info
}

// --- client ----------------------------------------------------------------

export interface RelayTimeouts {
  createMs: number
  getMs: number
  requestMs: number
  deleteMs: number
}

/** Same budgets as send's original client. */
export const DEFAULT_RELAY_TIMEOUTS: RelayTimeouts = {
  createMs: 10_000,
  getMs: 10_000,
  /** The relay itself rejects an unanswered RPC after 30 s; leave headroom. */
  requestMs: 35_000,
  deleteMs: 5_000
}

export interface RelayClientConfig {
  /** e.g. `https://relay.bitspv.com`; trailing slashes are ignored. */
  baseUrl: string
  /** The `x-relay-app` name registered on the relay, e.g. `send`. */
  appName: string
  /** The shared secret for that app. Never log it. */
  appSecret: string
  /** Injection seam for tests / non-global fetch environments. */
  fetch?: typeof fetch
  timeouts?: Partial<RelayTimeouts>
}

function resolveTimeout (value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.floor(value))
    : fallback
}

function timeoutSignal (ms: number): AbortSignal | undefined {
  try {
    return typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined
  } catch {
    return undefined
  }
}

function relayStatusError (status: number): RelayError {
  if (status === 504) return new RelayError('ERR_WALLET_TIMEOUT', 'wallet did not answer in time', 504)
  if (status === 409) return new RelayError('ERR_WALLET_NOT_CONNECTED', 'wallet not connected', 409)
  if (status === 429) return new RelayError('ERR_RELAY_UNAVAILABLE', 'relay busy', 429)
  return new RelayError('ERR_RELAY_REJECTED', `relay rejected the request (${status})`, status)
}

/**
 * One relay client per app deployment. Cheap to keep at module scope; safe to
 * create per request.
 */
export class RelayClient {
  private readonly baseUrl: string
  private readonly appName: string
  private readonly appSecret: string
  private readonly fetchImpl: typeof fetch
  private readonly timeouts: RelayTimeouts

  constructor (config: RelayClientConfig) {
    const baseUrl = typeof config.baseUrl === 'string'
      ? config.baseUrl.trim().replace(/\/+$/, '')
      : ''
    if (baseUrl === '') throw new RelayError('ERR_RELAY_CONFIG', 'relay baseUrl is required')

    const appName = typeof config.appName === 'string' ? config.appName.trim() : ''
    if (appName === '') throw new RelayError('ERR_RELAY_CONFIG', 'relay appName is required')

    if (typeof config.appSecret !== 'string' || config.appSecret === '') {
      throw new RelayError('ERR_RELAY_CONFIG', 'relay appSecret is required')
    }

    const fetchImpl = config.fetch ?? globalThis.fetch
    if (typeof fetchImpl !== 'function') {
      throw new RelayError('ERR_RELAY_CONFIG', 'no fetch implementation is available')
    }

    this.baseUrl = baseUrl
    this.appName = appName
    this.appSecret = config.appSecret
    this.fetchImpl = fetchImpl
    this.timeouts = {
      createMs: resolveTimeout(config.timeouts?.createMs, DEFAULT_RELAY_TIMEOUTS.createMs),
      getMs: resolveTimeout(config.timeouts?.getMs, DEFAULT_RELAY_TIMEOUTS.getMs),
      requestMs: resolveTimeout(config.timeouts?.requestMs, DEFAULT_RELAY_TIMEOUTS.requestMs),
      deleteMs: resolveTimeout(config.timeouts?.deleteMs, DEFAULT_RELAY_TIMEOUTS.deleteMs)
    }
  }

  /**
   * Send one authenticated request and return the raw `Response`.
   *
   * Caller-visible bodies are never echoed into errors: the relay's error pages
   * can contain upstream text we do not want to render.
   */
  private async request (path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set(RELAY_APP_HEADER, this.appName)
    headers.set(RELAY_SECRET_HEADER, this.appSecret)
    if (init.body != null) headers.set('content-type', 'application/json')

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: timeoutSignal(timeoutMs)
      })
    } catch (error) {
      // Only the error name: messages can embed URLs and environment detail.
      const reason = error instanceof Error ? error.name : 'unknown'
      throw new RelayError('ERR_RELAY_UNAVAILABLE', `relay unreachable (${reason})`)
    }

    if (!response.ok) {
      // The relay answers 404 to BOTH "no such pairing" and "bad app credentials"
      // (deliberately, so scanners cannot confirm which apps exist). Its auth
      // failure body is empty; a real missing session carries JSON. Collapsing the
      // two would make a secret misconfiguration look like an expired QR.
      if (response.status === 404) {
        const body = await response.text().catch(() => '')
        if (body.trim() === '') {
          throw new RelayError('ERR_RELAY_REJECTED', 'relay rejected the app credentials', 404)
        }
        throw new RelayError('ERR_PAIR_NOT_FOUND', 'pairing not found', 404)
      }
      throw relayStatusError(response.status)
    }
    return response
  }

  /** Create one pairing. `origin` must be an origin this app registered. */
  async createSession (origin: string): Promise<RelaySessionInfo> {
    const response = await this.request(
      '/api/session',
      { method: 'POST', body: JSON.stringify({ origin }) },
      this.timeouts.createMs
    )
    return parseSessionInfo(await this.readJson(response))
  }

  /** Status + relay URL + backend key; the phone-facing control-plane read. */
  async getSession (sessionId: string): Promise<RelaySessionPublic> {
    const response = await this.request(
      `/api/session/${encodeURIComponent(sessionId)}`,
      { method: 'GET' },
      this.timeouts.getMs
    )
    return parseSessionPublic(await this.readJson(response))
  }

  /**
   * Send one fixed RPC to the phone.
   *
   * The caller decides which methods are allowed; this client deliberately does
   * not become a general signing proxy. A 200 response may still carry a
   * wallet-level `error` — check `isRelayRpcSuccess` or inspect `result`.
   */
  async sendRequest (
    sessionId: string,
    desktopToken: string,
    method: string,
    params?: unknown
  ): Promise<RelayRpcResponse> {
    const body = encodeRelayEnvelope(params === undefined ? { method } : { method, params })
    const response = await this.request(
      `/api/request/${encodeURIComponent(sessionId)}`,
      {
        method: 'POST',
        headers: { [RELAY_DESKTOP_TOKEN_HEADER]: desktopToken },
        body
      },
      this.timeouts.requestMs
    )
    return decodeRelayResponse(await this.readText(response))
  }

  /** Best-effort teardown: failures here never fail the caller's request. */
  async deleteSession (sessionId: string, desktopToken: string): Promise<void> {
    try {
      await this.request(
        `/api/session/${encodeURIComponent(sessionId)}`,
        { method: 'DELETE', headers: { [RELAY_DESKTOP_TOKEN_HEADER]: desktopToken } },
        this.timeouts.deleteMs
      )
    } catch {
      // The pairing record is being deleted anyway; an orphaned relay session
      // expires on its own.
    }
  }

  private async readText (response: Response): Promise<string> {
    try {
      return await response.text()
    } catch {
      throw new RelayError('ERR_RELAY_UNAVAILABLE', 'relay response could not be read')
    }
  }

  private async readJson (response: Response): Promise<unknown> {
    const raw = await this.readText(response)
    try {
      return JSON.parse(raw) as unknown
    } catch {
      throw new RelayError('ERR_RELAY_PROTOCOL', 'relay returned a non-JSON body')
    }
  }
}
