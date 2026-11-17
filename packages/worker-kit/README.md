# @bitspv/worker-kit

BitSPV Worker 共用基建。只放「send 和 vault 两份以上都在实现、且实现方式应该一致」的东西：

| 模块 | 子路径 | 内容 |
|---|---|---|
| 限速 | `@bitspv/worker-kit/rate-limit` | in-memory 滑动窗口 + Durable Object 固定窗口，`createRateLimiter` 参数化策略 |
| DO | `@bitspv/worker-kit/rate-limiter-do` | `RateLimiter` Durable Object |
| session | `@bitspv/worker-kit/session` | HMAC cookie session、CSRF、payload 扩展字段 |
| 签名 | `@bitspv/worker-kit/verify` | `sdkVerifier`（BRC-100 `dataTypeFlag=1` 约定） |
| WebCrypto | `@bitspv/worker-kit/crypto` | `sha256` / `hmacSha256` + re-export bytes 工具 |
| 字节 | `@bitspv/worker-kit/bytes` | utf8 / hex / base64url / 恒时比较 |
| HTTP | `@bitspv/worker-kit/http` | `json` / `errorResponse` / `readJson(maxBytes)` |
| i18n | `@bitspv/worker-kit/i18n` | `t(key, params)` + 语言回退机制，**不含任何文案** |
| barrel | `@bitspv/worker-kit` | 以上全部 re-export |

**这里没有业务逻辑**：没有 cookie 名、没有限额数字、没有文案、没有 vaultId / accountId 的语义。
所有产品差异都从参数进来。

## 消费方怎么 import

包发布的是**编译好的 JS + .d.ts**（`dist/`），不是 TS 源码：

```jsonc
// package.json
"dependencies": {
  "@bitspv/worker-kit": "https://raw.githubusercontent.com/cyio/bitspv-platform/worker-kit-v0.1.0/packages/worker-kit/dist/bitspv-worker-kit-0.1.0.tgz"
}
```

```ts
import { json, readJson } from '@bitspv/worker-kit/http'
import { createSessions } from '@bitspv/worker-kit/session'
import { RateLimiter } from '@bitspv/worker-kit/rate-limiter-do'
```

- 子路径导入是推荐写法。Worker 打包时 barrel（`@bitspv/worker-kit`）会把 `@bsv/sdk`
  一起拉进模块图，只用到 HTTP helper 的路由请走子路径。
- 消费方无需 `allowImportingTsExtensions`：`dist/*.d.ts` 里引用的是 `./x.js`，不是 `.ts`。
- 需要 Node ≥ 22 / 现代 runtime（WebCrypto、`Request`/`Response`、`btoa`），消费方 TypeScript ≥ 5.4
  （声明里的 `NoInfer`）。
- `@bsv/sdk` 是本包的 `dependencies`（`^1.8.10`）。应用本来就依赖它，pnpm 会去重；
  如果版本被拆成两份，把应用的 `@bsv/sdk` 固定在同一个 major 即可。

## 用法

### 限速

策略由调用方给。send 按 route 取不同额度，vault 用全局常量：

```ts
import { createRateLimiter } from '@bitspv/worker-kit/rate-limit'

// vault：默认值就是它原本的 20/10s burst + 60/60s minute
const limiter = createRateLimiter()

// send：blob 路由放大，其余走控制面额度
const limiter = createRateLimiter({
  policy: {
    burstWindowMs: RATE_BURST_WINDOW_MS,
    burstMaxFor,
    windowSeconds: RATE_WINDOW_SECONDS,
    minuteMaxFor
  }
})

export const { enforceRateLimit, enforceRateLimitWindow, enforcePrincipalRateLimit } = limiter
```

- 方法都是闭包，解构出来直接用，不依赖 `this`。
- 顺序固定：先 in-memory burst，再 DO minute 窗口。
- **fail-open**：没有客户端 IP、没有 `RATE` 绑定、DO 抛错 → 放行。
- `enforceRateLimitWindow(env, route, request, max, seconds)` 处理「每小时 10 次」这类不规则窗口
  （不经过内存层）；`enforcePrincipalRateLimit` 按 deviceId 而不是 IP 计。

Durable Object 侧：

```ts
export { RateLimiter } from '@bitspv/worker-kit/rate-limiter-do'
// wrangler: durable_objects.bindings: [{ name: 'RATE', class_name: 'RateLimiter' }]
```

DO 的限额随请求体传入（`{ max, windowSeconds }`），所以一个 DO 类服务所有 route。
时钟可用 `__setNow` / `__resetNow` 注入（测试用）。

### session

```ts
import { createSessions } from '@bitspv/worker-kit/session'

// send
const sessions = createSessions({
  cookieName: 'bitspv_send_session',
  secret: (env) => sessionSecret(env as Env),
  ttlSeconds: 7 * 24 * 60 * 60
})

// vault：payload 多一个 vid
const sessions = createSessions<{ vid: string }>({
  cookieName: 'bitspv_session',
  secret: (env) => sessionSecret(env as Env)
})

const { cookie } = await sessions.issue(env, { accountId, identityHash, extra: { vid } })
const session = await sessions.read(env, request)      // null = 缺失/过期/被改/伪造
sessions.csrfOk(request, session)                      // 写操作再查一次
sessions.clearCookie(env)
await sessions.identityHashOf(appIdentity)             // sha256 前 32 hex
```

- 签名算法与两仓原实现一致：`base64url(JSON) . hex(HMAC-SHA256)`，恒时比较。
- `extra` 会被拒绝，如果它与 `sub/ikh/csrf/iat/exp/jti` 冲突。
- `secret` 缺失时 `issue`/`read` **抛错**，不会静默把所有用户判成未登录。
- `Secure` 默认只在 `env.ENVIRONMENT === 'production'` 时加（localhost 用明文 http 也能登录）。

### ECDSA 校验

```ts
import { sdkVerifier, type SignatureVerifier } from '@bitspv/worker-kit/verify'

sdkVerifier.verify(publicKeyHex, preimage, signatureDer) // { ok, ms, reason? }
```

`@bsv/sdk` 的 `PublicKey.verify(msg, sig)` 内部做 SHA-256，正好对应 BRC-100
`createSignature` 的 `dataTypeFlag = 1`：钱包先哈希再签。**传原始数据**，不要传哈希字符串。
测试里用固定密钥钉死了这个约定（`test/verify.test.ts`）。

### HTTP

```ts
import { json, errorResponse, readJson, isResponse } from '@bitspv/worker-kit/http'

readJson<T>(request, 1024 * 1024)        // vault：1 MiB
readJson<T>(request, 2 * 1024 * 1024)    // send：2 MiB
```

`readJson` 返回 `T | Response`，用 `isResponse()` 区分；超限 413 `ERR_BODY_TOO_LARGE`，
非法 JSON 400 `ERR_BAD_JSON`。

### i18n

只抽机制，文案表由调用方注入：

```ts
import { createI18n } from '@bitspv/worker-kit/i18n'

const i18n = createI18n({
  messages: { zh, en },          // 两个产品的字典各自留在自己仓里
  defaultLang: 'en',
  storageKey: 'bitspv.send.lang' // 可选；不传就不读写 localStorage
})

i18n.t('shares.item', { id })    // 当前语言 → fallback → defaultLang → 返回 key
i18n.setLang('zh')
```

语言检测顺序：`?lang=` → localStorage → `navigator.language`（`zh-CN` → `zh`）→ `defaultLang`。
所有探测都有 try/catch，在纯 Node / CLI 里 import 安全。

## 开发

```bash
pnpm -C packages/worker-kit run typecheck   # tsc --noEmit
pnpm -C packages/worker-kit run test        # vitest
pnpm -C packages/worker-kit run build       # src/*.ts → dist/*.js + dist/*.d.ts
pnpm release:worker-kit [--publish]         # 仓根：打包 tarball 进 dist/ 并（可选）提交打 tag
```

- 源码内部 import 带 `.ts` 后缀（与各产品仓一致）。`tsc` 的
  `rewriteRelativeImportExtensions` 把它改写成 `.js`；`scripts/fix-declarations.mjs`
  再修 `.d.ts` 里的同类引用（TS 5.9 不改声明文件）。
- `dist/*.js` / `dist/*.d.ts` 与 `dist/*.tgz` 一样提交进仓库，发布 tag 因此自包含。
- **不要**把业务常量（cookie 名、额度、文案、时长）加回包里。产品差异走参数，
  见 `bitspv-workspace/docs/shared-infra.md` 的「不搬业务逻辑」。

## 测试覆盖

| 文件 | 覆盖 |
|---|---|
| `test/rate-limit.test.ts` | 滑窗滚动 / 按 route 分桶 / IPv6 /64 / fail-open / DO 固定窗口滚动与时钟回拨 |
| `test/session.test.ts` | 签发/读取 / 篡改 payload / 伪造签名 / 换 secret / 过期 / CSRF / `vid` 扩展 |
| `test/verify.test.ts` | 固定密钥 golden vector / 改数据 / 换公钥 / 坏 DER / dataTypeFlag=1 约定 |
| `test/http.test.ts` | 封包 / 超限（声明长度与流式两种）/ 非法 JSON / 边界值 |
| `test/i18n.test.ts` | 回退链 / 插值 / setLang / 检测顺序 / 无 DOM 环境 |
| `test/bytes-crypto.test.ts` | hex / base64url / SHA-256 / HMAC 已知向量 |
