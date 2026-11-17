# bitspv-platform

BitSPV 七个产品共用的基建。**这里不放业务代码**，只放「两个以上产品都在实现、且实现方式应该一致」的东西。

> 为什么不是把所有仓合成一个 monorepo：见 `bitspv-workspace/docs/decisions.md` W-001。
> 这里只回答一个问题：**哪些代码值得抽出来共用。**

## 包

| 包 | 状态 | 说明 |
|---|---|---|
| `@bitspv/tokens` | ✅ 0.1.3 | 颜色 / 字体 / 间距 / 圆角 / 动效的唯一来源；产出 CSS 变量 + Tailwind preset + 贴近度审计 |
| `@bitspv/worker-kit` | ✅ 0.1.0（已发版，send / vault 已接入） | 限速、Durable Object 基类、session、ECDSA 校验、i18n 运行时；85 个测试 |
| `@bitspv/brc100` | ✅ 0.1.0（已发版，send / vault 已接入） | wallet-access、relay 客户端、配对/授权流程；59 个测试 |

## 命令

```bash
pnpm build          # 三个包的构建产物（tokens.css / preset + worker-kit / brc100 的 dist）
pnpm check          # tokens 逐字节校验 + 两个新包的 typecheck 与测试
pnpm audit <dirs>   # 各应用离品牌 token 有多远（只读）
```

## 分发方式

仓库内 tarball + raw 地址（W-005）。发版：

```bash
pnpm release:tokens          # 干跑
pnpm release:worker-kit      # 干跑
pnpm release:brc100          # 干跑
pnpm release:worker-kit --publish  # 构建 + 校验 + 打包 + 提交 + tag + push
```

token 沿用 `v<version>` tag（历史兼容），新包用 `<pkg>-v<version>`，避免三个包的版本号互相抢占同一 tag。

应用里写：

```json
"@bitspv/tokens": "https://raw.githubusercontent.com/cyio/bitspv-platform/v0.1.3/packages/tokens/dist/bitspv-tokens-0.1.3.tgz",
"@bitspv/worker-kit": "https://raw.githubusercontent.com/cyio/bitspv-platform/worker-kit-v0.1.0/packages/worker-kit/dist/bitspv-worker-kit-0.1.0.tgz"
```

不需要 registry、不需要 token，Vercel / Workers 构建机零凭证。为什么不用 npm 或 GitHub Release 资产：见 `bitspv-workspace/docs/decisions.md` W-005。

已接入：`web`（tokens 0.1.3，零视觉变化）。其余应用的状态见 `bitspv-workspace/docs/shared-infra.md`。

## 当前基线

`docs/token-conformance.md` —— 六个应用各有多少硬编码色、多少已经是品牌色、多少圆角越界。
先看这张表再决定改哪个应用，不要凭印象。
