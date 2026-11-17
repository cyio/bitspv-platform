/** Byte/encoding helpers and the two WebCrypto primitives, against known vectors. */

import { describe, expect, it } from 'vitest'

import {
  bytesEqual,
  fromBase64Url,
  fromBase64UrlToUtf8,
  fromHex,
  fromUtf8,
  toBase64Url,
  toBase64UrlOfUtf8,
  toHex,
  utf8,
  wipe
} from '../src/bytes.ts'
import { hmacSha256Hex, hmacSha256HexOfUtf8, sha256Hex } from '../src/crypto.ts'

describe('hex', () => {
  it('round-trips and is lower-case', () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0xa0, 0xff])
    expect(toHex(bytes)).toBe('000fa0ff')
    expect(fromHex('000fa0ff')).toEqual(bytes)
    expect(fromHex(' 000FA0FF ')).toEqual(bytes)
  })

  it('rejects odd-length and non-hex input', () => {
    expect(() => fromHex('abc')).toThrow(/invalid hex/)
    expect(() => fromHex('zz')).toThrow(/invalid hex/)
  })
})

describe('base64url', () => {
  it('is unpadded and round-trips UTF-8', () => {
    const encoded = toBase64UrlOfUtf8('你好, BitSPV ☃')
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(fromBase64UrlToUtf8(encoded)).toBe('你好, BitSPV ☃')
  })

  it('round-trips raw bytes, including 0xff', () => {
    const bytes = new Uint8Array([0, 1, 0x7f, 0x80, 0xff])
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
  })
})

describe('utf8 / equality / wipe', () => {
  it('round-trips text and reports byte length, not char length', () => {
    const bytes = utf8('é')
    expect(bytes.length).toBe(2)
    expect(fromUtf8(bytes)).toBe('é')
  })

  it('bytesEqual is length-safe', () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
  })

  it('wipe zeroes in place', () => {
    const bytes = new Uint8Array([1, 2, 3])
    wipe(bytes)
    expect([...bytes]).toEqual([0, 0, 0])
  })
})

describe('WebCrypto', () => {
  it('sha256Hex matches the FIPS 180-4 vector for "abc"', async () => {
    expect(await sha256Hex(utf8('abc')))
      .toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('hmacSha256Hex matches RFC 4231 test case 2', async () => {
    const mac = await hmacSha256Hex(utf8('Jefe'), utf8('what do ya want for nothing?'))
    expect(mac).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })

  it('hmacSha256HexOfUtf8 is the same computation over UTF-8 strings', async () => {
    const key = 'key'
    const message = 'The quick brown fox jumps over the lazy dog'
    expect(await hmacSha256HexOfUtf8(key, message))
      .toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
    expect(await hmacSha256HexOfUtf8(key, message))
      .toBe(await hmacSha256Hex(utf8(key), utf8(message)))
  })
})
