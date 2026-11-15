# bitspv-platform

BitSPV 七个产品共用的基建。**这里不放业务代码**，只放「两个以上产品都在实现、且实现方式应该一致」的东西。

> 为什么不是把所有仓合成一个 monorepo：见 `bitspv-workspace/docs/decisions.md` W-001。
> 这里只回答一个问题：**哪些代码值得抽出来共用。**

## 包

| 包 | 状态 | 说明 |
|---|---|---|
| `@bitspv/tokens` | ✅ 0.1.0 | 颜色 / 字体 / 间距 / 圆角 / 动效的唯一来源；产出 CSS 变量 + Tailwind preset + 贴近度审计 |
| `@bitspv/worker-kit` | ⬜ 计划（P3） | 限速、Durable Object 基类、session、ECDSA 校验、i18n 运行时 |
| `@bitspv/brc100` | ⬜ 计划（P4） | wallet-access、relay 客户端、配对/授权流程 |

## 命令

```bash
pnpm build          # 生成 dist/tokens.css 与 tailwind preset
pnpm check          # dist 是否与 tokens.json 同步；正文是否与主站现有产物逐字节一致
pnpm audit <dirs>   # 各应用离品牌 token 有多远（只读）
```

## 分发方式

GitHub Release tarball。发版：

```bash
pnpm release            # 干跑
pnpm release --publish  # 构建 + 校验 + 打包 + tag + release + 上传
```

应用里写：

```json
"@bitspv/tokens": "https://raw.githubusercontent.com/cyio/bitspv-platform/v0.1.2/packages/tokens/dist/bitspv-tokens-0.1.2.tgz"
```

不需要 registry、不需要 token，Vercel / Workers 构建机零凭证。为什么不用 npm：见 `bitspv-workspace/docs/decisions.md` W-005。

已接入：`web`（0.1.1，零视觉变化）。其余应用的状态见 `bitspv-workspace/docs/shared-infra.md`。

## 当前基线

`docs/token-conformance.md` —— 六个应用各有多少硬编码色、多少已经是品牌色、多少圆角越界。
先看这张表再决定改哪个应用，不要凭印象。
