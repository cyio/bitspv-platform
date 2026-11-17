/**
 * Pairing / authorization lifecycle, as a pure state machine.
 *
 * A phone pairing has the same shape in every app: a QR is minted, a phone
 * connects, the server runs the authorized RPCs, and the record ends up consumed
 * or dead. What differs — TTL, what "consume" means, which UI step comes next —
 * stays in the app. This module only owns the transitions, so a late poll cannot
 * resurrect a finished pairing and an expired one cannot be silently consumed.
 *
 * It does NOT own storage, sealing, polling cadence or UI. Those are app-specific
 * (send seals `desktopToken` into R2; a future vault flow may store nothing at
 * all), and parameterising them here would produce the kind of abstraction that
 * needs editing for every app.
 */
export type PairingPhase = 'pending' | 'connected' | 'consumed' | 'expired' | 'cancelled' | 'rejected' | 'failed';
/**
 * `pending` → `connected` → `consumed`, with `expired` / `cancelled` /
 * `rejected` / `failed` reachable from either live phase.
 */
export interface PairingState {
    phase: PairingPhase;
    /** Unix seconds. */
    createdAt: number;
    /** Unix seconds; `createdAt + ttlSeconds`. */
    expiresAt: number;
    /** Stable failure code, only for `rejected` / `failed`. */
    failureCode?: string;
}
export type PairingEvent = 
/** The relay's session status, as returned by `GET /api/session/:id`. */
{
    type: 'relay-status';
    status: string;
}
/** This app finished the authorized work for the pairing. */
 | {
    type: 'consume';
}
/** The user closed / switched away from the pairing UI. */
 | {
    type: 'cancel';
}
/** The wallet user said no. */
 | {
    type: 'reject';
    code?: string;
}
/** Transport or app-side failure after the phone connected. */
 | {
    type: 'fail';
    code?: string;
}
/** Advance the clock; call on every poll tick. */
 | {
    type: 'tick';
    now: number;
};
export type PairingStateErrorCode = 'PAIRING_INVALID_INPUT' | 'PAIRING_NOT_CONNECTED';
export declare class PairingStateError extends Error {
    readonly code: PairingStateErrorCode;
    constructor(code: PairingStateErrorCode, message: string);
}
/** Terminal phases absorb every later event, including a late `connected`. */
export declare function isTerminalPairingPhase(phase: PairingPhase): boolean;
/**
 * Map the relay's session status onto a phase.
 *
 * Unknown statuses return `null` (the caller keeps polling) instead of throwing:
 * the relay is a separately deployed service and may add values.
 */
export declare function mapRelayStatus(status: string): PairingPhase | null;
export interface CreatePairingStateInput {
    /** Unix seconds. */
    createdAt: number;
    /** Must be positive. Five minutes is the conventional BitSPV TTL. */
    ttlSeconds: number;
}
/** Start a pairing. Expiry is computed here so both sides agree on the deadline. */
export declare function createPairingState(input: CreatePairingStateInput): PairingState;
/** True when the pairing has no live future: already expired or past its deadline. */
export declare function isPairingExpired(state: PairingState, now: number): boolean;
/** Seconds left, clamped at zero. Use for the QR countdown. */
export declare function remainingSeconds(state: PairingState, now: number): number;
/**
 * Apply one event and return the next state.
 *
 * Rules that matter in practice:
 * - terminal states absorb late poll results, so a `connected` that arrives after
 *   the user cancelled cannot reopen the flow;
 * - a relay status never moves `connected` back to `pending`;
 * - `consume` before the phone connected throws instead of pretending success.
 */
export declare function applyPairingEvent(state: PairingState, event: PairingEvent): PairingState;
