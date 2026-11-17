# @bitspv/brc100

BitSPV 的 BRC-100 共享基建。只抽「两个以上产品都在实现、且实现方式应该一致」的**机制**，不搬任何一家的业务协议。

```
packages/brc100/
├── src/wallet-access.ts   探测钱包 + 发起授权 + 取回 app 身份公钥
├── src/relay.ts           与 relay.bitspv.com 对接的传输客户端（配对 + RPC 信封）
├── src/pairing.ts         手机配对的生命周期状态机（纯函数）
├── src/index.ts           barrel（浏览器侧方便；worker 请用子路径）
├── test/                  59 个 vitest 用例
└── dist/                  tsc 产物（JS + d.ts），发布 tarball 里带的就是它
```

## 不是什么

- **不是钱包 SDK**。不实现 BRC-100 方法，只调用钱包暴露的 `WalletInterface`。
- **不是 relay**。relay 是独立服务；这里只是它的 HTTP 客户端。
- **不碰用户密钥**。relay 客户端不做加解密、不构造预映像、不验签；`wallet-access` 只把
  钱包返回的公钥交回调用方。
- **不搬业务协议**。`[1, 'bitspv send']` / `[1, 'bitspv vault']` 由各仓传入，登录预映像、
  challenge、session、配对记录存储都留在各仓。

## 安装

分发方式与 `@bitspv/tokens` 一致：仓库内 tarball + `raw.githubusercontent.com`，不需要 registry。

```json
{
  "dependencies": {
    "@bitspv/brc100": "https://raw.githubusercontent.com/cyio/bitspv-platform/brc100-v0.1.0/packages/brc100/dist/bitspv-brc100-0.1.0.tgz"
  }
}
```

`@bsv/sdk` 是 peer dependency（`^1.8.10`），消费方自己声明版本。

## 引入方式

```ts
// 浏览器 / 扩展页面：拿钱包
import { connectBrc100Wallet } from '@bitspv/brc100/wallet-access'

// Worker / CLI：只做 relay 传输和配对状态机
import { RelayClient } from '@bitspv/brc100/relay'
import { createPairingState, applyPairingEvent } from '@bitspv/brc100/pairing'
```

`@bitspv/brc100` 这个根入口会把三个模块都带进来，其中 `wallet-access` 依赖
`@bsv/sdk` 的浏览器钱包客户端。**Worker 侧请用 `./relay`、`./pairing` 子路径**，否则
worker bundle 会白白变大。

## API

### `./wallet-access`

```ts
resolveOriginator(hostname: string): string | undefined
isIpOrigin(hostname: string): boolean

class WalletAccessError extends Error {
  readonly code: WalletErrorCode
  readonly originalError: unknown
}

classifyWalletError(error: unknown): WalletErrorCode
explainWalletError(error: unknown, messages?: WalletErrorMessages): WalletAccessError

requestIdentityKey(wallet: Brc100Wallet, authorization: WalletAuthorization): Promise<string>

connectBrc100Wallet(options: ConnectWalletOptions): Promise<WalletAccess>
isWalletAvailable(options: ConnectWalletOptions): Promise<boolean>
```

```ts
const access = await connectBrc100Wallet({
  hostname: window.location.hostname,
  protocolID: [1, 'bitspv send']  // 必填，从本仓 protocol.ts 传入
  // keyID 默认 'identity'，counterparty 默认 'self'
  // probe: false 只探测、不弹授权
  // messages: { WALLET_NOT_FOUND: '...' } 覆盖文案
})

access.wallet       // 结构上满足 Brc100Wallet，可自行收窄
access.originator   // 钱包看到的 DNS originator；页面跑在 IP 上时为 undefined
access.identityKey  // 授权探测拿到的 app 身份公钥（probe: false 时没有）
```

错误码：

| code | 含义 |
|---|---|
| `WALLET_IP_ORIGIN` | 页面用 IP 打开，钱包拒绝把它当应用来源 |
| `WALLET_NOT_FOUND` | 没有可用钱包 |
| `WALLET_REJECTED` | 用户在钱包弹窗里拒绝 |
| `WALLET_PROTOCOL_DESCRIPTION_MISSING` | 钱包没有该协议描述；只影响弹窗文案，不影响授权 |
| `WALLET_UNAVAILABLE` | 其它钱包 / 传输失败 |

`WalletAccessError.message` 永远是一行可直接展示的文案；原始报错只在
`originalError` / `cause` 里，**不要渲染给用户**。

### `./relay`

```ts
class RelayClient {
  constructor(config: RelayClientConfig)

  createSession(origin: string): Promise<RelaySessionInfo>
  getSession(sessionId: string): Promise<RelaySessionPublic>
  sendRequest(sessionId: string, desktopToken: string, method: string, params?: unknown): Promise<RelayRpcResponse>
  deleteSession(sessionId: string, desktopToken: string): Promise<void>   // best effort
}

encodeRelayEnvelope(envelope: RelayRequestEnvelope): string
decodeRelayEnvelope(raw: string): RelayRequestEnvelope
decodeRelayResponse(raw: string): RelayRpcResponse
isRelayRpcSuccess(response: RelayRpcResponse): boolean
```

```ts
const relay = new RelayClient({
  baseUrl: env.WALLET_RELAY_URL,
  appName: env.WALLET_RELAY_APP,
  appSecret: env.WALLET_RELAY_SECRET
})

const session = await relay.createSession(origin)   // { sessionId, status, pairingUri, desktopToken, qrDataUrl? }
const rpc = await relay.sendRequest(session.sessionId, session.desktopToken, 'getPublicKey', params)
if (!isRelayRpcSuccess(rpc)) { /* 钱包侧拒绝 */ }
```

- `desktopToken` 是 bearer secret：**只留在服务端**，永远不要返回浏览器。
- 200 响应仍可能带钱包级 `error`，必须检查 `isRelayRpcSuccess` / `result`。
- 方法白名单由调用方决定；这个客户端刻意不变成通用签名代理。
- 错误码：`ERR_RELAY_CONFIG` · `ERR_RELAY_UNAVAILABLE` · `ERR_RELAY_REJECTED` ·
  `ERR_RELAY_PROTOCOL` · `ERR_PAIR_NOT_FOUND` · `ERR_WALLET_TIMEOUT` ·
  `ERR_WALLET_NOT_CONNECTED`。HTTP body 不会写进错误消息。
- relay 对「app 凭证不对」和「配对不存在」都回 404（避免扫描器确认哪些 app 存在）；
  空 body 的 404 判为 `ERR_RELAY_REJECTED`，带 JSON 的 404 才是 `ERR_PAIR_NOT_FOUND`。

### `./pairing`

```ts
createPairingState({ createdAt, ttlSeconds }): PairingState
applyPairingEvent(state, event): PairingState
mapRelayStatus(status: string): PairingPhase | null
isTerminalPairingPhase(phase): boolean
isPairingExpired(state, now): boolean
remainingSeconds(state, now): number
```

```
pending ──relay connected──▶ connected ──consume──▶ consumed
   │                             │
   ├── relay expired / tick ─────┴──────────────▶ expired
   ├── cancel ──────────────────────────────────▶ cancelled
   └── reject / fail ───────────────────────────▶ rejected / failed
```

规则：

- 终态吸收后续所有事件（迟到的 `connected` 不会让已取消的配对复活）。
- `connected` 不会被轮询回退成 `pending`。
- 未连接时 `consume` 抛 `PairingStateError('PAIRING_NOT_CONNECTED')`，不假装成功。
- 未知 relay 状态返回 `null` / 保持原状态，轮询继续；relay 是独立服务，可能加状态。

## 故意没有抽的东西

| 没抽 | 为什么 |
|---|---|
| 配对记录存储（send 的 R2 + AES-GCM 封 `desktopToken`） | 绑 Cloudflare 绑定与各仓的 session secret；`purpose` / `quoteId` / `accountId` 是 send 的业务字段 |
| 登录预映像、challenge、session、验签 | 各仓协议不同（`bitspv-send-auth/1`、`bitspv-vault-auth/1`），且必须由服务端控制每一个输入 |
| 页内 DEV 钱包（`ProtoWallet` + localStorage） | 仅用于本地演示，属于各仓的开发开关，不是共享机制 |
| 轮询节奏（可见 1.8s / 隐藏 6s） | UI 行为，且 send 的隐藏标签页参数是实测调出来的；共享会诱导别处照抄错误值 |
| 二维码渲染 | `qrcode-generator` 与 DOM 绑定，跨框架无收益 |
| post 的 `withWriteFee` 包装 | 是 post 自己的收费策略，不是 BRC-100 机制 |

## 开发

```bash
pnpm -C packages/brc100 run typecheck   # 或 npx tsc --noEmit
pnpm -C packages/brc100 run test        # 59 个用例
pnpm -C packages/brc100 run build       # tsc → dist（发布 tarball 的内容）
```

发布（会改仓库状态，由根仓 owner 执行）：

```bash
node scripts/release.mjs brc100 --publish
# tag: brc100-v0.1.0
# tarball: packages/brc100/dist/bitspv-brc100-0.1.0.tgz
```

`scripts/release.mjs` 已经支持任意 `packages/*`：有 `build` 脚本就先构建，再把 tarball 放进
`dist/` 提交、打 tag、推送。本次没有改根目录任何文件。

## 版本

`0.1.0` — 首次抽取，API 尚未承诺稳定；各仓接入后按实际缺口再定 `0.2.0`。
