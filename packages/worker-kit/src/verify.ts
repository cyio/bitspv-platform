/**
 * The shared Worker's ONLY cryptographic job: verify an ECDSA signature.
 *
 * `@bsv/sdk`'s `PublicKey.verify(msg, sig)` hashes with SHA-256 internally, which
 * matches BRC-100 `createSignature` with `dataTypeFlag = 1` ("sign this data"): the
 * wallet hashes the bytes with SHA-256, then signs the digest. Getting this
 * convention wrong is the most likely integration bug, so it is pinned by a test
 * with a fixed key (`test/verify.test.ts`).
 *
 * Imported via the `@bsv/sdk/primitives/…` subpath export so a Worker bundle stays
 * small instead of pulling in transactions / overlay / tools.
 *
 * The verifier sits behind an interface so a deployment can swap in a different
 * implementation (e.g. a WASM verifier) without touching callers.
 */

import PublicKey from '@bsv/sdk/primitives/PublicKey'
import Signature from '@bsv/sdk/primitives/Signature'

export interface VerifyResult {
  ok: boolean
  /** Wall-clock cost of the verification itself, in milliseconds. */
  ms: number
  reason?: string
}

export interface SignatureVerifier {
  readonly name: string
  /**
   * @param publicKeyHex 33-byte compressed secp256k1 public key, hex.
   * @param preimage     the exact UTF-8 bytes that were signed.
   * @param signatureDer DER-encoded ECDSA signature.
   */
  verify: (publicKeyHex: string, preimage: string, signatureDer: Uint8Array) => VerifyResult
}

/** Reference verifier backed by `@bsv/sdk`. */
export const sdkVerifier: SignatureVerifier = {
  name: 'bsv-sdk',
  verify (publicKeyHex, preimage, signatureDer) {
    const started = performance.now()
    try {
      const publicKey = PublicKey.fromString(publicKeyHex)
      const signature = Signature.fromDER(Array.from(signatureDer))
      const ok = publicKey.verify(preimage, signature)
      return { ok, ms: performance.now() - started }
    } catch (error) {
      return {
        ok: false,
        ms: performance.now() - started,
        reason: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

export const verifier: SignatureVerifier = sdkVerifier
