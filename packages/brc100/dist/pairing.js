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
export class PairingStateError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'PairingStateError';
        this.code = code;
    }
}
const TERMINAL_PHASES = new Set([
    'consumed',
    'expired',
    'cancelled',
    'rejected',
    'failed'
]);
/** Terminal phases absorb every later event, including a late `connected`. */
export function isTerminalPairingPhase(phase) {
    return TERMINAL_PHASES.has(phase);
}
/**
 * Map the relay's session status onto a phase.
 *
 * Unknown statuses return `null` (the caller keeps polling) instead of throwing:
 * the relay is a separately deployed service and may add values.
 */
export function mapRelayStatus(status) {
    if (typeof status !== 'string')
        return null;
    switch (status.trim().toLowerCase()) {
        case 'pending': return 'pending';
        case 'connected': return 'connected';
        case 'consumed': return 'consumed';
        case 'expired': return 'expired';
        case 'cancelled':
        case 'canceled': return 'cancelled';
        case 'rejected': return 'rejected';
        case 'failed':
        case 'failure': return 'failed';
        default: return null;
    }
}
/** Start a pairing. Expiry is computed here so both sides agree on the deadline. */
export function createPairingState(input) {
    const { createdAt, ttlSeconds } = input;
    if (!Number.isFinite(createdAt)) {
        throw new PairingStateError('PAIRING_INVALID_INPUT', 'createdAt must be a finite number of seconds');
    }
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
        throw new PairingStateError('PAIRING_INVALID_INPUT', 'ttlSeconds must be a positive number');
    }
    return {
        phase: 'pending',
        createdAt,
        expiresAt: createdAt + ttlSeconds
    };
}
/** True when the pairing has no live future: already expired or past its deadline. */
export function isPairingExpired(state, now) {
    if (state.phase === 'expired')
        return true;
    if (isTerminalPairingPhase(state.phase))
        return false;
    return now >= state.expiresAt;
}
/** Seconds left, clamped at zero. Use for the QR countdown. */
export function remainingSeconds(state, now) {
    if (isTerminalPairingPhase(state.phase))
        return 0;
    return Math.max(0, state.expiresAt - now);
}
/**
 * Apply one event and return the next state.
 *
 * Rules that matter in practice:
 * - terminal states absorb late poll results, so a `connected` that arrives after
 *   the user cancelled cannot reopen the flow;
 * - a relay status never moves `connected` back to `pending`;
 * - `consume` before the phone connected throws instead of pretending success.
 */
export function applyPairingEvent(state, event) {
    if (isTerminalPairingPhase(state.phase))
        return state;
    switch (event.type) {
        case 'tick':
            return event.now >= state.expiresAt ? { ...state, phase: 'expired' } : state;
        case 'cancel':
            return { ...state, phase: 'cancelled' };
        case 'reject': {
            const next = { ...state, phase: 'rejected' };
            if (event.code !== undefined)
                next.failureCode = event.code;
            return next;
        }
        case 'fail': {
            const next = { ...state, phase: 'failed' };
            if (event.code !== undefined)
                next.failureCode = event.code;
            return next;
        }
        case 'consume':
            if (state.phase !== 'connected') {
                throw new PairingStateError('PAIRING_NOT_CONNECTED', `cannot consume a pairing in phase "${state.phase}"`);
            }
            return { ...state, phase: 'consumed' };
        case 'relay-status': {
            const next = mapRelayStatus(event.status);
            if (next == null)
                return state;
            // No regression: a status read can race the previous one.
            if (next === 'pending' || next === state.phase)
                return state;
            return { ...state, phase: next };
        }
        default:
            return state;
    }
}
