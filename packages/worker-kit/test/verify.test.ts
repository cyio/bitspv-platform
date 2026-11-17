/**
 * ECDSA verification, pinned to one convention.
 *
 * The fixture is a real secp256k1 key (`privkey = 1`) signing a login preimage the way
 * a BRC-100 wallet does for `createSignature` with `dataTypeFlag = 1`: SHA-256 the
 * data, then ECDSA-sign the digest. `@bsv/sdk`'s `PrivateKey.sign(msg)` and
 * `PublicKey.verify(msg, sig)` both apply that inner SHA-256, so they line up.
 *
 * If someone "fixes" the verifier to hash (or stop hashing) on its own, these tests
 * fail — which is the point.
 */

import { describe, expect, it } from 'vitest'

import { fromHex } from '../src/bytes.ts'
import { sha256Hex, utf8 } from '../src/crypto.ts'
import { sdkVerifier, verifier } from '../src/verify.ts'

const FIXTURE = {
  publicKeyHex: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  preimage: 'bitspv:login:v1:203.0.113.7:1700000000',
  signatureHex: '30450221009a2b31731f82b70ac5ce6de58f8a40d04cab2b8cf5a4968f79b98404b8cefe5102207aac26c20e791130294bdfa9aacae39cca185502956e40b8dfe32f15c93c0007'
}

describe('sdkVerifier', () => {
  it('accepts a BRC-100 dataTypeFlag=1 signature over the exact preimage', () => {
    const result = verifier.verify(FIXTURE.publicKeyHex, FIXTURE.preimage, fromHex(FIXTURE.signatureHex))
    expect(result.ok).toBe(true)
    expect(result.reason).toBeUndefined()
    expect(result.ms).toBeGreaterThanOrEqual(0)
    expect(verifier.name).toBe('bsv-sdk')
    expect(verifier).toBe(sdkVerifier)
  })

  it('rejects a signature once the signed data changes', () => {
    const tampered = FIXTURE.preimage.replace('203.0.113.7', '203.0.113.8')
    const result = sdkVerifier.verify(FIXTURE.publicKeyHex, tampered, fromHex(FIXTURE.signatureHex))
    expect(result.ok).toBe(false)
  })

  it('rejects the same signature under a different public key', () => {
    const otherKey = '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5'
    const result = sdkVerifier.verify(otherKey, FIXTURE.preimage, fromHex(FIXTURE.signatureHex))
    expect(result.ok).toBe(false)
  })

  it('expects raw data, not the SHA-256 digest as a string', async () => {
    // The most likely integration mistake: pre-hashing before handing the value to
    // `PublicKey.verify`, which hashes again. The digest string must not verify.
    const digestHex = await sha256Hex(utf8(FIXTURE.preimage))
    expect(typeof digestHex).toBe('string')
    const result = sdkVerifier.verify(FIXTURE.publicKeyHex, digestHex, fromHex(FIXTURE.signatureHex))
    expect(result.ok).toBe(false)
  })

  it('returns ok:false with a reason instead of throwing on bad input', () => {
    const badKey = sdkVerifier.verify('not-a-key', FIXTURE.preimage, fromHex(FIXTURE.signatureHex))
    expect(badKey.ok).toBe(false)
    expect(badKey.reason).toBeTruthy()

    const badDer = sdkVerifier.verify(FIXTURE.publicKeyHex, FIXTURE.preimage, new Uint8Array([1, 2, 3]))
    expect(badDer.ok).toBe(false)
    expect(badDer.reason).toBeTruthy()

    const empty = sdkVerifier.verify(FIXTURE.publicKeyHex, FIXTURE.preimage, new Uint8Array())
    expect(empty.ok).toBe(false)
  })
})
