import { describe, expect, it } from 'vitest'

import {
  RELAY_APP_HEADER,
  RELAY_DESKTOP_TOKEN_HEADER,
  RELAY_SECRET_HEADER,
  RelayClient,
  RelayError,
  decodeRelayEnvelope,
  decodeRelayResponse,
  encodeRelayEnvelope,
  isRelayRpcSuccess,
  type RelayClientConfig
} from '../src/relay.js'

const SECRET = 'relay-secret-0123456789abcdef'
const SESSION_ID = 'dGVzdC1zZXNzaW9u'
const DESKTOP_TOKEN = 'desktop-token-value'

interface Recorded {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
  hasSignal: boolean
}

function installFetch (
  handler: (recorded: Recorded) => Response | Promise<Response>
): { calls: Recorded[], fetchImpl: typeof fetch } {
  const calls: Recorded[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => { headers[key.toLowerCase()] = value })
    const recorded: Recorded = {
      url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
      hasSignal: init?.signal != null
    }
    calls.push(recorded)
    return await handler(recorded)
  }) as typeof fetch
  return { calls, fetchImpl }
}

function json (body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function makeClient (
  fetchImpl: typeof fetch,
  overrides: Partial<RelayClientConfig> = {}
): RelayClient {
  return new RelayClient({
    baseUrl: 'https://relay.test',
    appName: 'send',
    appSecret: SECRET,
    fetch: fetchImpl,
    ...overrides
  })
}

async function rejectionOf (promise: Promise<unknown>): Promise<RelayError> {
  const caught = await promise.then(
    () => { throw new Error('expected the promise to reject') },
    (error: unknown) => error
  )
  expect(caught).toBeInstanceOf(RelayError)
  return caught as RelayError
}

describe('relay envelope', () => {
  it('round-trips method and params', () => {
    const raw = encodeRelayEnvelope({
      method: 'createSignature',
      params: { data: [1, 2], protocolID: [1, 'bitspv send'] }
    })

    expect(JSON.parse(raw)).toEqual({
      method: 'createSignature',
      params: { data: [1, 2], protocolID: [1, 'bitspv send'] }
    })
    expect(decodeRelayEnvelope(raw)).toEqual({
      method: 'createSignature',
      params: { data: [1, 2], protocolID: [1, 'bitspv send'] }
    })
  })

  it('omits absent params', () => {
    const raw = encodeRelayEnvelope({ method: 'getPublicKey' })
    expect(raw).toBe('{"method":"getPublicKey"}')
    expect(decodeRelayEnvelope(raw)).toEqual({ method: 'getPublicKey' })
  })

  it('rejects invalid method values', () => {
    for (const method of ['', '   ', 'x'.repeat(65), 42 as unknown as string]) {
      expect(() => encodeRelayEnvelope({ method })).toThrowError(RelayError)
    }
  })

  it('rejects malformed JSON and non-object payloads', () => {
    expect(() => decodeRelayEnvelope('not json')).toThrowError(/not valid JSON/)
    expect(() => decodeRelayEnvelope('[]')).toThrowError(/must be a JSON object/)
    expect(() => decodeRelayEnvelope('{"params":{}}')).toThrowError(/non-empty method/)
    expect(() => decodeRelayEnvelope('{"method":42}')).toThrowError(/non-empty method/)
  })

  it('parses a response with a result', () => {
    expect(decodeRelayResponse('{"result":{"publicKey":"02ab"}}')).toEqual({
      result: { publicKey: '02ab' }
    })
    expect(isRelayRpcSuccess({ result: {} })).toBe(true)
  })

  it('parses a wallet-level error carried in a 200 response', () => {
    const response = decodeRelayResponse('{"error":{"code":1,"message":"user rejected"}}')
    expect(response).toEqual({ error: { code: 1, message: 'user rejected' } })
    expect(isRelayRpcSuccess(response)).toBe(false)
  })

  it('rejects a response whose fields have the wrong shape', () => {
    expect(() => decodeRelayResponse('[]')).toThrowError(/must be a JSON object/)
    expect(() => decodeRelayResponse('{"result":[]}')).toThrowError(/result must be an object/)
    expect(() => decodeRelayResponse('{"error":"no"}')).toThrowError(/error must be an object/)
    expect(() => decodeRelayResponse('{"error":{"code":"1"}}')).toThrowError(/error.code/)
    expect(() => decodeRelayResponse('{"error":{"message":1}}')).toThrowError(/error.message/)
  })

  it('accepts an empty response object', () => {
    expect(decodeRelayResponse('{}')).toEqual({})
  })
})

describe('RelayClient sessions', () => {
  it('creates a session with app credentials and the origin', async () => {
    const { calls, fetchImpl } = installFetch(() => json({
      sessionId: SESSION_ID,
      status: 'pending',
      qrDataUrl: 'data:image/png;base64,AAAA',
      pairingUri: 'bsv-browser://pair?topic=x',
      desktopToken: DESKTOP_TOKEN
    }))

    const client = makeClient(fetchImpl, { baseUrl: 'https://relay.test///' })
    const session = await client.createSession('https://send.bitspv.com')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://relay.test/api/session')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.headers[RELAY_APP_HEADER]).toBe('send')
    expect(calls[0]?.headers[RELAY_SECRET_HEADER]).toBe(SECRET)
    expect(calls[0]?.headers['content-type']).toBe('application/json')
    expect(calls[0]?.hasSignal).toBe(true)
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ origin: 'https://send.bitspv.com' })

    expect(session).toEqual({
      sessionId: SESSION_ID,
      status: 'pending',
      qrDataUrl: 'data:image/png;base64,AAAA',
      pairingUri: 'bsv-browser://pair?topic=x',
      desktopToken: DESKTOP_TOKEN
    })
  })

  it('rejects a session response with missing fields', async () => {
    const { fetchImpl } = installFetch(() => json({ sessionId: 'x', status: 'pending' }))
    const error = await rejectionOf(makeClient(fetchImpl).createSession('https://send.bitspv.com'))
    expect(error.code).toBe('ERR_RELAY_PROTOCOL')
  })

  it('gets a session with an encoded id', async () => {
    const { calls, fetchImpl } = installFetch(() => json({
      sessionId: 'a/b c',
      status: 'connected',
      relay: 'wss://relay.test/ws',
      backendIdentityKey: '02ab'
    }))

    const info = await makeClient(fetchImpl).getSession('a/b c')

    expect(calls[0]?.url).toBe('https://relay.test/api/session/a%2Fb%20c')
    expect(calls[0]?.method).toBe('GET')
    expect(info).toEqual({
      sessionId: 'a/b c',
      status: 'connected',
      relay: 'wss://relay.test/ws',
      backendIdentityKey: '02ab'
    })
  })

  it('sends one RPC envelope with the desktop token', async () => {
    const { calls, fetchImpl } = installFetch(() => json({ result: { publicKey: '02ab' } }))

    const response = await makeClient(fetchImpl).sendRequest(
      SESSION_ID,
      DESKTOP_TOKEN,
      'getPublicKey',
      { protocolID: [1, 'bitspv send'], keyID: 'identity', counterparty: 'self' }
    )

    expect(calls[0]?.url).toBe(`https://relay.test/api/request/${SESSION_ID}`)
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.headers[RELAY_DESKTOP_TOKEN_HEADER]).toBe(DESKTOP_TOKEN)
    expect(decodeRelayEnvelope(calls[0]?.body ?? '')).toEqual({
      method: 'getPublicKey',
      params: { protocolID: [1, 'bitspv send'], keyID: 'identity', counterparty: 'self' }
    })
    expect(response.result).toEqual({ publicKey: '02ab' })
    expect(isRelayRpcSuccess(response)).toBe(true)
  })

  it('deletes a session and resolves even when the relay fails', async () => {
    const { calls, fetchImpl } = installFetch((recorded) => {
      if (recorded.url.endsWith('/broken')) return new Response(null, { status: 500 })
      return new Response(null, { status: 204 })
    })
    const client = makeClient(fetchImpl)

    await client.deleteSession(SESSION_ID, DESKTOP_TOKEN)
    await client.deleteSession('broken', DESKTOP_TOKEN)

    expect(calls).toHaveLength(2)
    expect(calls[0]?.method).toBe('DELETE')
    expect(calls[0]?.headers[RELAY_DESKTOP_TOKEN_HEADER]).toBe(DESKTOP_TOKEN)
  })
})

describe('RelayClient errors', () => {
  it('maps relay HTTP statuses onto stable codes', async () => {
    const cases: Array<[number, string]> = [
      [404, 'ERR_PAIR_NOT_FOUND'],
      [504, 'ERR_WALLET_TIMEOUT'],
      [409, 'ERR_WALLET_NOT_CONNECTED'],
      [429, 'ERR_RELAY_UNAVAILABLE'],
      [403, 'ERR_RELAY_REJECTED'],
      [500, 'ERR_RELAY_REJECTED']
    ]

    for (const [status, code] of cases) {
      const { fetchImpl } = installFetch(() => new Response('nope', { status }))
      const error = await rejectionOf(makeClient(fetchImpl).getSession(SESSION_ID))
      expect(error.code).toBe(code)
      expect(error.status).toBe(status)
      expect(error.message).not.toContain('nope')
    }
  })

  it('treats an empty 404 as rejected credentials, not a missing pairing', async () => {
    // The relay answers 404 with no body when X-Relay-App/Secret do not match,
    // so scanners cannot confirm which apps exist.
    const { fetchImpl } = installFetch(() => new Response(null, { status: 404 }))
    const error = await rejectionOf(makeClient(fetchImpl).getSession(SESSION_ID))

    expect(error.code).toBe('ERR_RELAY_REJECTED')
    expect(error.status).toBe(404)
  })

  it('reports a non-JSON success body as a protocol error', async () => {
    const { fetchImpl } = installFetch(() => new Response('<html>proxy</html>', { status: 200 }))
    const error = await rejectionOf(makeClient(fetchImpl).createSession('https://send.bitspv.com'))
    expect(error.code).toBe('ERR_RELAY_PROTOCOL')
    expect(error.message).not.toContain('proxy')
  })

  it('reports a non-JSON RPC body as a protocol error', async () => {
    const { fetchImpl } = installFetch(() => new Response('not json', { status: 200 }))
    const error = await rejectionOf(makeClient(fetchImpl).sendRequest(SESSION_ID, DESKTOP_TOKEN, 'getPublicKey'))
    expect(error.code).toBe('ERR_RELAY_PROTOCOL')
  })

  it('reports transport failures without leaking credentials', async () => {
    const { fetchImpl } = installFetch(() => { throw new TypeError('fetch failed') })
    const error = await rejectionOf(makeClient(fetchImpl).createSession('https://send.bitspv.com'))

    expect(error.code).toBe('ERR_RELAY_UNAVAILABLE')
    expect(error.message).toBe('relay unreachable (TypeError)')
    expect(error.message).not.toContain(SECRET)
  })

  it('validates configuration at construction time', () => {
    const config = { baseUrl: 'https://relay.test', appName: 'send', appSecret: SECRET }

    expect(() => new RelayClient({ ...config, baseUrl: '  ' })).toThrowError(RelayError)
    expect(() => new RelayClient({ ...config, appName: '' })).toThrowError(/appName/)
    expect(() => new RelayClient({ ...config, appSecret: '' })).toThrowError(/appSecret/)

    try {
      new RelayClient({ ...config, appSecret: '' })
    } catch (error) {
      expect((error as RelayError).code).toBe('ERR_RELAY_CONFIG')
      expect((error as RelayError).message).not.toContain('relay.test')
    }
  })

  it('honours custom timeouts', async () => {
    const { calls, fetchImpl } = installFetch(() => json({ sessionId: SESSION_ID, status: 'pending', relay: 'x' }))
    await makeClient(fetchImpl, { timeouts: { getMs: 2500 } }).getSession(SESSION_ID)
    expect(calls[0]?.hasSignal).toBe(true)
  })
})
