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
/**
 * BRC-43 invoice-number components: `[securityLevel, protocolName]`.
 *
 * Structurally identical to `WalletProtocol` in `@bsv/sdk/wallet`, but declared
 * locally so the public types do not leak an SDK version into consumers.
 */
export type WalletProtocol = readonly [number, string];
/** Default keyID for the app-scoped pseudonymous login identity. */
export declare const DEFAULT_IDENTITY_KEY_ID = "identity";
/**
 * Default counterparty. ALWAYS pass it explicitly: `@bsv/sdk`'s defaults are not
 * uniform (`getPublicKey` defaults to 'self', `createSignature` to 'anyone'), so
 * omitting it silently derives two different keys.
 */
export declare const DEFAULT_AUTH_COUNTERPARTY = "self";
/**
 * The wallet identifies applications by a DNS originator, and BRC-100 asks for an
 * FQDN. Wallets reject an IP address with "IP address originators are not
 * permitted" — which is what you get when a dev server is reached at
 * `http://127.0.0.1:8787` and the hostname is passed through naively.
 *
 * So: never hand the wallet an IP. Pass nothing and let the wallet fall back to
 * its own notion of the calling origin.
 */
export declare function resolveOriginator(hostname: string): string | undefined;
/** True when the page is served from an IP, which real wallets will refuse. */
export declare function isIpOrigin(hostname: string): boolean;
/** Machine-readable wallet failure, so the UI can render its own guidance. */
export type WalletErrorCode = 'WALLET_IP_ORIGIN' | 'WALLET_NOT_FOUND' | 'WALLET_REJECTED' | 'WALLET_PROTOCOL_DESCRIPTION_MISSING' | 'WALLET_UNAVAILABLE';
/** Per-app wording for the codes above. Missing entries fall back to the defaults. */
export type WalletErrorMessages = Partial<Record<WalletErrorCode, string>>;
/**
 * Deliberately ONE-LINE messages: the UI renders them as-is, next to its own
 * guidance. The raw wallet error is never appended — doing that made the UI say
 * the same thing twice (Chinese guidance + raw English stack text).
 */
export declare const DEFAULT_WALLET_MESSAGES: Record<WalletErrorCode, string>;
/**
 * A wallet problem split into a stable `code` + a user-facing message.
 *
 * The raw error is kept on `originalError` (and the platform's own `cause` slot,
 * for devtools/loggers) and is deliberately NOT part of `message`.
 */
export declare class WalletAccessError extends Error {
    readonly code: WalletErrorCode;
    /** What the wallet / SDK actually threw. Console or telemetry only. */
    readonly originalError: unknown;
    constructor(code: WalletErrorCode, message: string, options?: {
        cause?: unknown;
    });
}
/** Classify a raw wallet failure. Order matters: the first match wins. */
export declare function classifyWalletError(error: unknown): WalletErrorCode;
/**
 * Turn a wallet failure into a `WalletAccessError` with stable code + wording.
 *
 * Passing an app-specific `messages` map keeps vault's more detailed guidance
 * without forking the classification logic.
 */
export declare function explainWalletError(error: unknown, messages?: WalletErrorMessages): WalletAccessError;
/** The BRC-100 surface these modules need. `WalletClient` satisfies it. */
export interface Brc100Wallet {
    getPublicKey: (args: {
        protocolID?: WalletProtocol;
        keyID?: string;
        counterparty?: string;
        identityKey?: true;
    }) => Promise<{
        publicKey: string;
    }>;
    createHmac: (args: {
        data: number[];
        protocolID: WalletProtocol;
        keyID: string;
        counterparty?: string;
    }) => Promise<{
        hmac: number[];
    }>;
    /** Present on `WalletClient`; optional so test doubles stay small. */
    connectToSubstrate?: () => Promise<void>;
}
/**
 * How a wallet is constructed. The default uses `WalletClient('auto')`; tests
 * and the in-page DEV wallets inject their own.
 */
export type WalletFactory = (originator: string | undefined) => Brc100Wallet | Promise<Brc100Wallet>;
/** The BRC-43 identity an app authorises and later derives keys under. */
export interface WalletAuthorization {
    /** e.g. `[1, 'bitspv send']`. App-specific, never defaulted. */
    protocolID: WalletProtocol;
    /** Defaults to `identity`. */
    keyID?: string;
    /** Defaults to `self`. Keep it explicit — SDK defaults differ per method. */
    counterparty?: string;
}
export interface ConnectWalletOptions extends WalletAuthorization {
    /** Usually `window.location.hostname`. */
    hostname: string;
    /**
     * Run the authorization probe (`getPublicKey` under the app's protocol).
     * `false` only checks availability and never opens a permission prompt.
     */
    probe?: boolean;
    /** Test / DEV seam. Defaults to `new WalletClient('auto', originator)`. */
    createWallet?: WalletFactory;
    /** Per-app error wording. */
    messages?: WalletErrorMessages;
}
export interface WalletAccess {
    wallet: Brc100Wallet;
    /** What the wallet shows the user, or undefined when the page is on an IP. */
    originator: string | undefined;
    /** Present when the authorization probe ran and returned a key. */
    identityKey?: string;
}
/**
 * Ask the wallet for the app-scoped identity key.
 *
 * This is the authorization step: the wallet shows its permission prompt and the
 * grant it records is exactly what later `createHmac` / `createSignature` calls
 * rely on. Calling it once per origin is what stops the user being prompted
 * twice.
 */
export declare function requestIdentityKey(wallet: Brc100Wallet, authorization: WalletAuthorization): Promise<string>;
/**
 * Acquire a wallet AND take the authorization step, in one place.
 *
 * Every failure — including "the SDK could not even be loaded" — comes back as a
 * `WalletAccessError`, so callers never have to pattern-match raw wallet text.
 */
export declare function connectBrc100Wallet(options: ConnectWalletOptions): Promise<WalletAccess>;
/**
 * Cheap "is a desktop wallet there at all?" check.
 *
 * Never opens a permission prompt (`probe: false`), so it is safe to call when the
 * panel opens. A browser cannot tell "installed but not running" from "not
 * installed" here: both are silence.
 */
export declare function isWalletAvailable(options: ConnectWalletOptions): Promise<boolean>;
