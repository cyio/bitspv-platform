import { describe, expect, it } from 'vitest'

import {
  PairingStateError,
  applyPairingEvent,
  createPairingState,
  isPairingExpired,
  isTerminalPairingPhase,
  mapRelayStatus,
  remainingSeconds,
  type PairingPhase,
  type PairingState
} from '../src/pairing.js'

const CREATED_AT = 1_700_000_000
const TTL = 300

function state (): PairingState {
  return createPairingState({ createdAt: CREATED_AT, ttlSeconds: TTL })
}

function connected (): PairingState {
  return applyPairingEvent(state(), { type: 'relay-status', status: 'connected' })
}

describe('createPairingState', () => {
  it('starts pending and computes the deadline', () => {
    expect(state()).toEqual({
      phase: 'pending',
      createdAt: CREATED_AT,
      expiresAt: CREATED_AT + TTL
    })
  })

  it('rejects a non-positive or non-finite ttl', () => {
    for (const ttlSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createPairingState({ createdAt: CREATED_AT, ttlSeconds })).toThrowError(PairingStateError)
    }
    expect(() => createPairingState({ createdAt: Number.NaN, ttlSeconds: TTL })).toThrowError(/createdAt/)
  })

  it('tags invalid input with a stable code', () => {
    try {
      createPairingState({ createdAt: CREATED_AT, ttlSeconds: 0 })
    } catch (error) {
      expect((error as PairingStateError).code).toBe('PAIRING_INVALID_INPUT')
    }
  })
})

describe('mapRelayStatus', () => {
  it('maps known relay statuses', () => {
    expect(mapRelayStatus('pending')).toBe('pending')
    expect(mapRelayStatus(' CONNECTED ')).toBe('connected')
    expect(mapRelayStatus('expired')).toBe('expired')
    expect(mapRelayStatus('consumed')).toBe('consumed')
    expect(mapRelayStatus('cancelled')).toBe('cancelled')
    expect(mapRelayStatus('canceled')).toBe('cancelled')
    expect(mapRelayStatus('rejected')).toBe('rejected')
    expect(mapRelayStatus('failed')).toBe('failed')
    expect(mapRelayStatus('failure')).toBe('failed')
  })

  it('returns null for unknown statuses instead of throwing', () => {
    expect(mapRelayStatus('warming-up')).toBeNull()
    expect(mapRelayStatus('')).toBeNull()
  })
})

describe('applyPairingEvent', () => {
  it('moves pending to connected only for a connected relay status', () => {
    expect(applyPairingEvent(state(), { type: 'relay-status', status: 'pending' }).phase).toBe('pending')
    expect(applyPairingEvent(state(), { type: 'relay-status', status: 'unknown' }).phase).toBe('pending')
    expect(connected().phase).toBe('connected')
  })

  it('never moves connected back to pending', () => {
    const current = connected()
    expect(applyPairingEvent(current, { type: 'relay-status', status: 'pending' })).toBe(current)
  })

  it('consumes only after the phone connected', () => {
    expect(applyPairingEvent(connected(), { type: 'consume' }).phase).toBe('consumed')

    try {
      applyPairingEvent(state(), { type: 'consume' })
      throw new Error('expected consume to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(PairingStateError)
      expect((error as PairingStateError).code).toBe('PAIRING_NOT_CONNECTED')
    }
  })

  it('expires on the first tick at or after the deadline', () => {
    expect(applyPairingEvent(state(), { type: 'tick', now: CREATED_AT + TTL - 1 }).phase).toBe('pending')
    expect(applyPairingEvent(state(), { type: 'tick', now: CREATED_AT + TTL }).phase).toBe('expired')
  })

  it('lets the relay expire a pairing before the local deadline', () => {
    expect(applyPairingEvent(state(), { type: 'relay-status', status: 'expired' }).phase).toBe('expired')
  })

  it('cancels and records rejection/failure codes', () => {
    expect(applyPairingEvent(state(), { type: 'cancel' }).phase).toBe('cancelled')

    const rejected = applyPairingEvent(connected(), { type: 'reject', code: 'USER_DECLINED' })
    expect(rejected.phase).toBe('rejected')
    expect(rejected.failureCode).toBe('USER_DECLINED')

    const failed = applyPairingEvent(connected(), { type: 'fail', code: 'RELAY_DOWN' })
    expect(failed.phase).toBe('failed')
    expect(failed.failureCode).toBe('RELAY_DOWN')
  })

  it('absorbs every event after a terminal phase', () => {
    const terminalPhases: PairingPhase[] = ['consumed', 'expired', 'cancelled', 'rejected', 'failed']

    for (const phase of terminalPhases) {
      const terminal = applyPairingEvent(state(), { type: 'cancel' })
      const forced: PairingState = { ...terminal, phase }
      for (const event of [
        { type: 'relay-status', status: 'connected' } as const,
        { type: 'tick', now: CREATED_AT + TTL + 1 } as const,
        { type: 'consume' } as const,
        { type: 'reject', code: 'late' } as const
      ]) {
        expect(applyPairingEvent(forced, event)).toBe(forced)
      }
    }
  })
})

describe('expiry helpers', () => {
  it('reports expiry only for live states past the deadline', () => {
    expect(isPairingExpired(state(), CREATED_AT + TTL - 1)).toBe(false)
    expect(isPairingExpired(state(), CREATED_AT + TTL)).toBe(true)
    expect(isPairingExpired(connected(), CREATED_AT + TTL + 1)).toBe(true)

    const consumed = applyPairingEvent(connected(), { type: 'consume' })
    expect(isPairingExpired(consumed, CREATED_AT + TTL * 10)).toBe(false)
    expect(isPairingExpired({ ...state(), phase: 'expired' }, CREATED_AT)).toBe(true)
  })

  it('clamps remaining seconds at zero and stops at terminal phases', () => {
    expect(remainingSeconds(state(), CREATED_AT)).toBe(TTL)
    expect(remainingSeconds(state(), CREATED_AT + TTL + 10)).toBe(0)
    expect(remainingSeconds(applyPairingEvent(state(), { type: 'cancel' }), CREATED_AT)).toBe(0)
  })

  it('classifies terminal phases', () => {
    const terminal: PairingPhase[] = ['consumed', 'expired', 'cancelled', 'rejected', 'failed']
    const live: PairingPhase[] = ['pending', 'connected']
    for (const phase of terminal) expect(isTerminalPairingPhase(phase)).toBe(true)
    for (const phase of live) expect(isTerminalPairingPhase(phase)).toBe(false)
  })
})
