/**
 * `@bitspv/brc100` — BitSPV's shared BRC-100 plumbing.
 *
 * Three independent pieces:
 *   - `wallet-access` — get a wallet + ask for the app-scoped identity;
 *   - `relay`         — talk to relay.bitspv.com (transport only);
 *   - `pairing`       — the phone-pairing state machine.
 *
 * Worker bundles should import the `relay` / `pairing` subpaths: the barrel also
 * re-exports `wallet-access`, which pulls in `@bsv/sdk`'s browser wallet client.
 */

export * from './wallet-access.js'
export * from './relay.js'
export * from './pairing.js'
