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

## 分发方式：**未定**

`pnpm` 在当前机器上还没登录 npm（`npm whoami` → E401），所以包还只在本地。

三个选项，等决策后再接线：

| 方案 | 优点 | 代价 |
|---|---|---|
| 发布到 npm（公开） | 标准，Vercel / Workers 直接可用，无需额外 token | token 是公开的（本来就在公开 CSS 里） |
| `github:cyio/bitspv-tokens#v0.1.0` | 不用 registry、不用 token（仓库公开即可） | 安装时走 git，稍慢；每个包一个仓库 |
| 各应用 vendor 一份生成的 CSS | 构建零网络依赖 | 会出现副本，需要 `sync` + check 防漂移 |

**在这三个里选一个之前，不要改任何应用的引入方式。** 半接线的状态比现在更难收拾。

## 当前基线

`docs/token-conformance.md` —— 六个应用各有多少硬编码色、多少已经是品牌色、多少圆角越界。
先看这张表再决定改哪个应用，不要凭印象。
