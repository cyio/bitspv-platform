/**
 * HTTP helpers: the JSON envelope, the body cap (`readJson(maxBytes)`), and the
 * `Response` sentinel that lets a route do `if (isResponse(parsed)) return parsed`.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MAX_JSON_BYTES,
  apiError,
  errorResponse,
  isResponse,
  json,
  readJson
} from '../src/http.ts'

function post (body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api', { method: 'POST', body, headers })
}

async function bodyOf (response: Response): Promise<{ error: { code: string, message: string } }> {
  return await response.json() as { error: { code: string, message: string } }
}

describe('json', () => {
  it('serialises with a JSON content type and the given status', async () => {
    const response = json({ ok: true }, 201)
    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(await response.json()).toEqual({ ok: true })
  })

  it('lets callers add headers', () => {
    const response = json({}, 200, { 'cache-control': 'no-store' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
  })
})

describe('errorResponse', () => {
  it('emits the stable { error: { code, message } } envelope', async () => {
    const response = errorResponse(429, 'ERR_RATE_LIMITED', 'slow down')
    expect(response.status).toBe(429)
    expect(await bodyOf(response)).toEqual({ error: { code: 'ERR_RATE_LIMITED', message: 'slow down' } })
  })

  it('is also exported under the legacy name apiError', () => {
    expect(apiError).toBe(errorResponse)
  })
})

describe('readJson', () => {
  it('parses a normal body', async () => {
    const parsed = await readJson<{ hello: string }>(post(JSON.stringify({ hello: 'world' })))
    expect(isResponse(parsed)).toBe(false)
    expect(parsed).toEqual({ hello: 'world' })
  })

  it('rejects a malformed body with 400 ERR_BAD_JSON', async () => {
    const parsed = await readJson(post('{not json'))
    expect(isResponse(parsed)).toBe(true)
    expect((parsed as Response).status).toBe(400)
    expect((await bodyOf(parsed as Response)).error.code).toBe('ERR_BAD_JSON')
  })

  it('rejects a body larger than a declared cap (vault uses 1 MiB)', async () => {
    const big = JSON.stringify({ data: 'x'.repeat(2048) })
    const parsed = await readJson(post(big), 1024)
    expect(isResponse(parsed)).toBe(true)
    const response = parsed as Response
    expect(response.status).toBe(413)
    const body = await bodyOf(response)
    expect(body.error.code).toBe('ERR_BODY_TOO_LARGE')
    expect(body.error.message).toContain('1024')
  })

  it('rejects an oversized body even when no content-length is declared', async () => {
    const big = JSON.stringify({ data: 'x'.repeat(4096) })
    // A streamed body carries no content-length header.
    const request = new Request('https://example.test/api', { method: 'POST', body: big })
    expect(request.headers.get('content-length')).toBeNull()

    const parsed = await readJson(request, 1024)
    expect(isResponse(parsed)).toBe(true)
    expect((parsed as Response).status).toBe(413)
  })

  it('rejects on the declared content-length before reading the body', async () => {
    const request = post('{}', { 'content-length': String(5 * 1024 * 1024) })
    const parsed = await readJson(request, DEFAULT_MAX_JSON_BYTES)
    expect(isResponse(parsed)).toBe(true)
    expect((parsed as Response).status).toBe(413)
  })

  it('accepts a body exactly at the cap', async () => {
    const body = JSON.stringify({ a: 'b' })
    const parsed = await readJson<{ a: string }>(post(body), body.length)
    expect(parsed).toEqual({ a: 'b' })
  })

  it('defaults to 1 MiB and the products pick 1 / 2 MiB explicitly', async () => {
    expect(DEFAULT_MAX_JSON_BYTES).toBe(1024 * 1024)
    expect((await readJson<{ ok: boolean }>(post('{"ok":true}'), 2 * 1024 * 1024))).toEqual({ ok: true })
  })
})

describe('isResponse', () => {
  it('distinguishes responses from payloads', () => {
    expect(isResponse(json({}))).toBe(true)
    expect(isResponse({})).toBe(false)
    expect(isResponse(null)).toBe(false)
    expect(isResponse(undefined)).toBe(false)
  })
})
