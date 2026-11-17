/**
 * Getting hold of a BRC-100 wallet — the ONE place this happens.
 *
 * Reused by send / vault / (later) any other BitSPV app that needs a wallet.
 * From the wallet's point of view the request is identical; the only per-app
 * differences are which BRC-43 protocol it asks about (the app-scoped identity
 * namespace) and how the failure is worded. Both are parameters here.
 *
 * Transport-agnostic by design: we hand the job to `WalletClient('auto')`, which
 * discovers whichever BRC-100 wallet is present. We never bind to a particular
 * injection convention, because the standard is BRC-100's `WalletInterface`.
 *
 * ⚠️ This module is browser/extension-side only. It is also the only module in
 * the package that imports `@bsv/sdk`, so worker code should import the
 * `relay` / `pairing` subpaths instead of the package barrel.
 */
import WalletClient from '@bsv/sdk/wallet/WalletClient';
/** Default keyID for the app-scoped pseudonymous login identity. */
export const DEFAULT_IDENTITY_KEY_ID = 'identity';
/**
 * Default counterparty. ALWAYS pass it explicitly: `@bsv/sdk`'s defaults are not
 * uniform (`getPublicKey` defaults to 'self', `createSignature` to 'anyone'), so
 * omitting it silently derives two different keys.
 */
export const DEFAULT_AUTH_COUNTERPARTY = 'self';
/** `127.0.0.1`, `192.168.1.10`, … */
const IPV4_LIKE = /^\d{1,3}(\.\d{1,3}){3}$/;
/**
 * The wallet identifies applications by a DNS originator, and BRC-100 asks for an
 * FQDN. Wallets reject an IP address with "IP address originators are not
 * permitted" — which is what you get when a dev server is reached at
 * `http://127.0.0.1:8787` and the hostname is passed through naively.
 *
 * So: never hand the wallet an IP. Pass nothing and let the wallet fall back to
 * its own notion of the calling origin.
 */
export function resolveOriginator(hostname) {
    const trimmed = hostname.trim().toLowerCase();
    if (trimmed === '' || IPV4_LIKE.test(trimmed) || trimmed.startsWith('['))
        return undefined;
    return trimmed;
}
/** True when the page is served from an IP, which real wallets will refuse. */
export function isIpOrigin(hostname) {
    const trimmed = hostname.trim();
    return IPV4_LIKE.test(trimmed) || trimmed.startsWith('[');
}
/**
 * Deliberately ONE-LINE messages: the UI renders them as-is, next to its own
 * guidance. The raw wallet error is never appended — doing that made the UI say
 * the same thing twice (Chinese guidance + raw English stack text).
 */
export const DEFAULT_WALLET_MESSAGES = {
    WALLET_IP_ORIGIN: '钱包不接受当前页面地址作为应用来源',
    WALLET_NOT_FOUND: '没有检测到 BRC-100 钱包',
    WALLET_REJECTED: '你取消了钱包授权',
    WALLET_PROTOCOL_DESCRIPTION_MISSING: '钱包没有这个协议的描述，不影响授权，在弹窗里允许即可',
    WALLET_UNAVAILABLE: '钱包连接失败'
};
/**
 * A wallet problem split into a stable `code` + a user-facing message.
 *
 * The raw error is kept on `originalError` (and the platform's own `cause` slot,
 * for devtools/loggers) and is deliberately NOT part of `message`.
 */
export class WalletAccessError extends Error {
    constructor(code, message, options) {
        super(message);
        this.name = 'WalletAccessError';
        this.code = code;
        this.originalError = options?.cause;
        if (options != null && options.cause !== undefined) {
            // `Error.cause` needs lib ES2022, but consumers target ES2020. Define the
            // slot at runtime instead of using `super(message, options)`.
            Object.defineProperty(this, 'cause', {
                value: options.cause,
                enumerable: false,
                configurable: true,
                writable: true
            });
        }
    }
}
/** Classify a raw wallet failure. Order matters: the first match wins. */
export function classifyWalletError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/originator/i.test(message) && /ip address/i.test(message))
        return 'WALLET_IP_ORIGIN';
    if (/no wallet available/i.test(message))
        return 'WALLET_NOT_FOUND';
    if (/protocol description not found/i.test(message))
        return 'WALLET_PROTOCOL_DESCRIPTION_MISSING';
    // The user pressed "拒绝" in the wallet prompt. Wallets word this differently,
    // so match the family of verbs rather than one exact string.
    if (/reject|denied|declin|cancel/i.test(message))
        return 'WALLET_REJECTED';
    // Everything else (wallet timeouts, transport errors, provider quirks) carries
    // English, provider-specific wording that tells a user nothing.
    return 'WALLET_UNAVAILABLE';
}
/**
 * Turn a wallet failure into a `WalletAccessError` with stable code + wording.
 *
 * Passing an app-specific `messages` map keeps vault's more detailed guidance
 * without forking the classification logic.
 */
export function explainWalletError(error, messages) {
    if (error instanceof WalletAccessError)
        return error;
    const code = classifyWalletError(error);
    const message = messages?.[code] ?? DEFAULT_WALLET_MESSAGES[code];
    return new WalletAccessError(code, message, { cause: error });
}
/**
 * Ask the wallet for the app-scoped identity key.
 *
 * This is the authorization step: the wallet shows its permission prompt and the
 * grant it records is exactly what later `createHmac` / `createSignature` calls
 * rely on. Calling it once per origin is what stops the user being prompted
 * twice.
 */
export async function requestIdentityKey(wallet, authorization) {
    const result = await wallet.getPublicKey({
        protocolID: authorization.protocolID,
        keyID: authorization.keyID ?? DEFAULT_IDENTITY_KEY_ID,
        counterparty: authorization.counterparty ?? DEFAULT_AUTH_COUNTERPARTY
    });
    return result.publicKey;
}
function defaultWalletFactory(originator) {
    const client = new WalletClient('auto', originator);
    // `WalletClient`'s argument types are narrower (branded BRC-100 strings) than
    // this package's structural surface, so the bridge is explicit.
    return client;
}
/**
 * Acquire a wallet AND take the authorization step, in one place.
 *
 * Every failure — including "the SDK could not even be loaded" — comes back as a
 * `WalletAccessError`, so callers never have to pattern-match raw wallet text.
 */
export async function connectBrc100Wallet(options) {
    const originator = resolveOriginator(options.hostname);
    const createWallet = options.createWallet ?? defaultWalletFactory;
    try {
        const wallet = await createWallet(originator);
        if (typeof wallet.connectToSubstrate === 'function') {
            await wallet.connectToSubstrate();
        }
        const access = { wallet, originator };
        if (options.probe !== false) {
            const identityKey = await requestIdentityKey(wallet, options);
            if (typeof identityKey === 'string' && identityKey.trim() !== '') {
                access.identityKey = identityKey;
            }
        }
        return access;
    }
    catch (error) {
        throw explainWalletError(error, options.messages);
    }
}
/**
 * Cheap "is a desktop wallet there at all?" check.
 *
 * Never opens a permission prompt (`probe: false`), so it is safe to call when the
 * panel opens. A browser cannot tell "installed but not running" from "not
 * installed" here: both are silence.
 */
export async function isWalletAvailable(options) {
    try {
        await connectBrc100Wallet({ ...options, probe: false });
        return true;
    }
    catch {
        return false;
    }
}
