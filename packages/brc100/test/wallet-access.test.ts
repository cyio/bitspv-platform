import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WALLET_MESSAGES,
  WalletAccessError,
  classifyWalletError,
  connectBrc100Wallet,
  explainWalletError,
  isIpOrigin,
  isWalletAvailable,
  requestIdentityKey,
  resolveOriginator,
  type Brc100Wallet,
  type WalletAuthorization
} from '../src/wallet-access.js'

const PROTOCOL: WalletAuthorization = { protocolID: [1, 'bitspv send'] }
const IDENTITY_KEY = `02${'ab'.repeat(32)}`

function fakeWallet (
  getPublicKey: Brc100Wallet['getPublicKey'] = async () => ({ publicKey: IDENTITY_KEY }),
  onConnect?: () => void
): Brc100Wallet {
  return {
    getPublicKey,
    createHmac: async () => ({ hmac: [0] }),
    connectToSubstrate: async () => { onConnect?.() }
  }
}

describe('resolveOriginator', () => {
  it('normalises a DNS hostname', () => {
    expect(resolveOriginator('  SEND.BitSPV.com ')).toBe('send.bitspv.com')
    expect(resolveOriginator('localhost')).toBe('localhost')
    expect(resolveOriginator('vault.localhost')).toBe('vault.localhost')
  })

  it('refuses empty and IP origins', () => {
    expect(resolveOriginator('')).toBeUndefined()
    expect(resolveOriginator('   ')).toBeUndefined()
    expect(resolveOriginator('127.0.0.1')).toBeUndefined()
    expect(resolveOriginator('192.168.1.10')).toBeUndefined()
    expect(resolveOriginator('[::1]')).toBeUndefined()
    expect(resolveOriginator('::1')).toBe('::1')
  })
})

describe('isIpOrigin', () => {
  it('flags IPv4 and bracketed IPv6', () => {
    expect(isIpOrigin('127.0.0.1')).toBe(true)
    expect(isIpOrigin(' 10.0.0.1 ')).toBe(true)
    expect(isIpOrigin('[::1]')).toBe(true)
  })

  it('does not flag DNS names or unbracketed IPv6', () => {
    expect(isIpOrigin('send.bitspv.com')).toBe(false)
    expect(isIpOrigin('localhost')).toBe(false)
    expect(isIpOrigin('::1')).toBe(false)
  })
})

describe('classifyWalletError', () => {
  it('maps the originator/IP refusal', () => {
    expect(classifyWalletError(new Error('IP address originators are not permitted'))).toBe('WALLET_IP_ORIGIN')
  })

  it('maps a missing wallet', () => {
    expect(classifyWalletError(new Error('No wallet available'))).toBe('WALLET_NOT_FOUND')
  })

  it('maps a missing protocol description separately from rejection', () => {
    expect(classifyWalletError(new Error('Protocol description not found'))).toBe('WALLET_PROTOCOL_DESCRIPTION_MISSING')
  })

  it('maps the family of user rejection verbs', () => {
    for (const message of ['User rejected', 'request denied', 'declined by wallet', 'cancelled']) {
      expect(classifyWalletError(new Error(message))).toBe('WALLET_REJECTED')
    }
  })

  it('falls back to unavailable and accepts non-Error values', () => {
    expect(classifyWalletError(new Error('socket hang up'))).toBe('WALLET_UNAVAILABLE')
    expect(classifyWalletError('weird transport failure')).toBe('WALLET_UNAVAILABLE')
  })
})

describe('explainWalletError', () => {
  it('keeps the raw error off the message and on originalError/cause', () => {
    const raw = new Error('JSON: {"call":"getPublicKey","message":"No wallet available"}')
    const explained = explainWalletError(raw)

    expect(explained).toBeInstanceOf(WalletAccessError)
    expect(explained.code).toBe('WALLET_NOT_FOUND')
    expect(explained.message).toBe(DEFAULT_WALLET_MESSAGES.WALLET_NOT_FOUND)
    expect(explained.originalError).toBe(raw)
    expect((explained as { cause?: unknown }).cause).toBe(raw)
    expect(explained.message).not.toContain('JSON')
  })

  it('passes through an error it already explained', () => {
    const first = new WalletAccessError('WALLET_REJECTED', 'nope')
    expect(explainWalletError(first)).toBe(first)
  })

  it('uses app-specific wording when supplied', () => {
    const explained = explainWalletError(new Error('No wallet available'), {
      WALLET_NOT_FOUND: '请先安装钱包扩展'
    })
    expect(explained.message).toBe('请先安装钱包扩展')
    expect(explained.code).toBe('WALLET_NOT_FOUND')
  })
})

describe('requestIdentityKey', () => {
  it('always sends keyID and counterparty explicitly', async () => {
    const seen: unknown[] = []
    const wallet = fakeWallet(async (args) => {
      seen.push(args)
      return { publicKey: IDENTITY_KEY }
    })

    const key = await requestIdentityKey(wallet, PROTOCOL)

    expect(key).toBe(IDENTITY_KEY)
    expect(seen).toEqual([{
      protocolID: [1, 'bitspv send'],
      keyID: 'identity',
      counterparty: 'self'
    }])
  })

  it('honours explicit keyID / counterparty', async () => {
    let seen: Record<string, unknown> | undefined
    const wallet = fakeWallet(async (args) => {
      seen = args as Record<string, unknown>
      return { publicKey: IDENTITY_KEY }
    })

    await requestIdentityKey(wallet, { protocolID: [2, 'other'], keyID: 'root', counterparty: 'anyone' })

    expect(seen).toEqual({ protocolID: [2, 'other'], keyID: 'root', counterparty: 'anyone' })
  })
})

describe('connectBrc100Wallet', () => {
  it('connects, authorises and returns the identity key', async () => {
    let connected = 0
    const wallet = fakeWallet(async () => ({ publicKey: IDENTITY_KEY }), () => { connected += 1 })
    const originators: Array<string | undefined> = []

    const access = await connectBrc100Wallet({
      hostname: 'SEND.BitSPV.com',
      ...PROTOCOL,
      createWallet: (originator) => {
        originators.push(originator)
        return wallet
      }
    })

    expect(originators).toEqual(['send.bitspv.com'])
    expect(connected).toBe(1)
    expect(access.wallet).toBe(wallet)
    expect(access.originator).toBe('send.bitspv.com')
    expect(access.identityKey).toBe(IDENTITY_KEY)
  })

  it('hands the wallet no originator when the page is on an IP', async () => {
    const originators: Array<string | undefined> = []

    const access = await connectBrc100Wallet({
      hostname: '127.0.0.1',
      ...PROTOCOL,
      createWallet: (originator) => {
        originators.push(originator)
        return fakeWallet()
      }
    })

    expect(originators).toEqual([undefined])
    expect(access.originator).toBeUndefined()
  })

  it('skips the permission prompt with probe: false', async () => {
    let probes = 0
    const wallet = fakeWallet(async () => {
      probes += 1
      return { publicKey: IDENTITY_KEY }
    })

    const access = await connectBrc100Wallet({
      hostname: 'send.bitspv.com',
      ...PROTOCOL,
      probe: false,
      createWallet: () => wallet
    })

    expect(probes).toBe(0)
    expect(access.identityKey).toBeUndefined()
  })

  it('does not report an empty identity key as authorised', async () => {
    const access = await connectBrc100Wallet({
      hostname: 'send.bitspv.com',
      ...PROTOCOL,
      createWallet: () => fakeWallet(async () => ({ publicKey: '   ' }))
    })
    expect(access.identityKey).toBeUndefined()
  })

  it('wraps a factory failure', async () => {
    const error = await connectBrc100Wallet({
      hostname: 'send.bitspv.com',
      ...PROTOCOL,
      createWallet: () => { throw new Error('No wallet available') }
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WalletAccessError)
    expect((error as WalletAccessError).code).toBe('WALLET_NOT_FOUND')
  })

  it('wraps a connectToSubstrate failure', async () => {
    const wallet: Brc100Wallet = {
      getPublicKey: async () => ({ publicKey: IDENTITY_KEY }),
      createHmac: async () => ({ hmac: [0] }),
      connectToSubstrate: async () => { throw new Error('socket hang up') }
    }

    const error = await connectBrc100Wallet({
      hostname: 'send.bitspv.com',
      ...PROTOCOL,
      createWallet: () => wallet
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WalletAccessError)
    expect((error as WalletAccessError).code).toBe('WALLET_UNAVAILABLE')
  })

  it('classifies a rejection from the probe', async () => {
    const error = await connectBrc100Wallet({
      hostname: 'send.bitspv.com',
      ...PROTOCOL,
      createWallet: () => fakeWallet(async () => { throw new Error('User rejected the request') })
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WalletAccessError)
    expect((error as WalletAccessError).code).toBe('WALLET_REJECTED')
  })

  it('applies app-specific messages to probe failures', async () => {
    const error = await connectBrc100Wallet({
      hostname: 'vault.bitspv.com',
      protocolID: [1, 'bitspv vault'],
      messages: { WALLET_REJECTED: '你拒绝了 vault 的授权' },
      createWallet: () => fakeWallet(async () => { throw new Error('denied') })
    }).catch((caught: unknown) => caught)

    expect((error as WalletAccessError).message).toBe('你拒绝了 vault 的授权')
  })
})

describe('isWalletAvailable', () => {
  it('reports found without prompting', async () => {
    let probes = 0
    const available = await isWalletAvailable({
      hostname: 'send.bitspv.com',
      ...PROTOCOL,
      createWallet: () => fakeWallet(async () => {
        probes += 1
        return { publicKey: IDENTITY_KEY }
      })
    })

    expect(available).toBe(true)
    expect(probes).toBe(0)
  })

  it('reports absent on failure', async () => {
    const available = await isWalletAvailable({
      hostname: 'send.bitspv.com',
      ...PROTOCOL,
      createWallet: () => { throw new Error('No wallet available') }
    })
    expect(available).toBe(false)
  })
})
