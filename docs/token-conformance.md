# Token 贴近度基线（2026-11-15）

> 由 `bitspv-tokens audit` 只读扫描生成，不改代码。数字会随代码变化，**当基线看，别当承诺**。
> 口径：跳过 `dist/`、`design/`（提案页）、`tokens.css`（token 定义本身）。

```

应用            贴近度  文件  硬编码色  已是品牌色  品牌变量  越界圆角
post            78%     97    64        53          56/115    0
web             67%     70    30        2           42/60     3
send            53%     122   127       21          109/242   30
vault           48%     68    102       17          165/376   23
pay             39%     61    71        7           9/340     3
video           10%     17    155       31          112/328   22

── post (78%)  /Users/gongyi01/Projects/bsv-apps/bitspv-post/frontend
   值已是品牌色、只差换成变量：
     #ffffff → paper  ×8
     #04231a → on-accent  ×4
     #067a52 → accent  ×3
     #1f1f1f → paper  ×3
     #45e0a0 → accent  ×3
     #f3f3f3 → paper-2  ×2
     #616161 → ink-2  ×2
     #cecece → rule-strong  ×2
   品牌里没有的色值（要新 token 或删掉）：
     #888888  ×2
     #646cff  ×1
     #61dafb  ×1
     #0e9f6e  ×1
     #8a8a8a  ×1
     #181818  ×1
     #252526  ×1
     #666666  ×1
   非品牌变量（各自一套命名）：
     --copper×14  --font-mono×5  --popover×2  --popover-foreground×2  --border×2  --radix-select-trigger-height×1  --radix-select-trigger-width×1  --radius×1  --background×1  --foreground×1  --card×1  --card-foreground×1

── web (67%)  /Users/gongyi01/Projects/Personal/bitspv
   值已是品牌色、只差换成变量：
     #067a52 → accent  ×1
     #ffffff → paper  ×1
   品牌里没有的色值（要新 token 或删掉）：
     #1a1a1a  ×3
     #eeeeee  ×2
     #9ca3af  ×2
     #666666  ×2
     #1d1d1d  ×1
     #6b7280  ×1
     #e5e7eb  ×1
     #60a5fa  ×1
   非品牌变量（各自一套命名）：
     --font-sans×3  --font-mono×2  --white×2  --gray-800×2  --gray-750×2  --main-surface×1  --gray-100×1  --gray-400×1  --gray-500×1  --gray-600×1  --gray-700×1  --gray-900×1
   圆角超 3px：
     src/components/WalletGuide.vue: border-radius: 16px
     src/components/WalletGuide.vue: border-radius: 12px
     src/pages/index/App.vue: border-radius: 6px

── send (53%)  /Users/gongyi01/Projects/bsv-apps/bitspv-send
   值已是品牌色、只差换成变量：
     #ffffff → paper  ×13
     #45e0a0 → accent  ×4
     #04231a → on-accent  ×2
     #5fe8ad → accent-hover  ×2
   品牌里没有的色值（要新 token 或删掉）：
     #16181d  ×4
     #93a6bc  ×4
     #6b7f96  ×4
     #0a0e14  ×3
     #1d5fbf  ×3
     #e6edf7  ×3
     #6ea8ff  ×3
     #e8eff8  ×3
   非品牌变量（各自一套命名）：
     --text-muted×29  --border×20  --surface-2×11  --text×11  --radius×8  --mono×7  --line×6  --surface-3×6  --bg×5  --surface×5  --text-faint×4  --radius-full×4
   圆角超 3px：
     public/agent-pair.html: border-radius: 12px
     public/agent-pair.html: border-radius: 8px
     public/agent.html: border-radius: 8px
     public/agent.html: border-radius: 10px
     public/agent.html: border-radius: 6px
     public/agent.html: border-radius: 0 8px 8px 0

── vault (48%)  /Users/gongyi01/Projects/bsv-apps/bitspv-vault
   值已是品牌色、只差换成变量：
     #ffffff → paper  ×10
     #45e0a0 → accent  ×3
     #5fe8ad → accent-hover  ×2
     #04231a → on-accent  ×2
   品牌里没有的色值（要新 token 或删掉）：
     #0a0e14  ×6
     #0a754f  ×5
     #e8eff8  ×4
     #f5f7fb  ×4
     #f2f5fa  ×4
     #e9eef7  ×4
     #eef2f9  ×4
     #e1e7f0  ×4
   非品牌变量（各自一套命名）：
     --text-muted×48  --border×39  --mono×20  --text×19  --surface-2×16  --surface-3×12  --radius-full×10  --border-strong×9  --text-faint×7  --radius×7  --surface×5  --bg×4
   圆角超 3px：
     public/bitspv-vault-recover.html: --radius-sm: 9px
     public/bitspv-vault-recover.html: --radius: 12px
     public/bitspv-vault-recover.html: --radius-lg: 16px
     public/bitspv-vault-recover.html: --radius-full: 999px
     public/bitspv-vault-recover.html: border-radius:6px
     public/bitspv-vault-recover.html: border-radius:8px

── pay (39%)  /Users/gongyi01/Projects/Personal/bitspv-pay-react
   值已是品牌色、只差换成变量：
     #ffffff → paper  ×7
   品牌里没有的色值（要新 token 或删掉）：
     #0000  ×23
     #646cff  ×3
     #116600  ×2
     #116699  ×2
     #117744  ×2
     #8230  ×2
     #9ca3af  ×2
     #242424  ×2
   非品牌变量（各自一套命名）：
     --tw-text-opacity×45  --tw-bg-opacity×28  --tw-border-opacity×12  --radius×11  --tw-space-y-reverse×10  --tw-shadow-color×10  --tw-ring-offset-shadow×9  --tw-ring-shadow×9  --tw-shadow×9  --tw-translate-x×8  --tw-translate-y×8  --tw-rotate×8
   圆角超 3px：
     dist-offline/bitspv-pay-offline-v1.6.0-7aa0662.html: border-radius:9999px
     dist-offline/bitspv-pay-offline-v1.6.0-7aa0662.html: border-radius:calc(var(--radius) - 4px)
     src/style.css: border-radius: 8px

── video (10%)  /Users/gongyi01/Projects/Personal/bitspv-video
   值已是品牌色、只差换成变量：
     #ffffff → paper  ×21
     #e5e5e5 → rule  ×3
     #45e0a0 → accent  ×3
     #262626 → paper-2  ×2
     #5fe8ad → accent-hover  ×1
     #04231a → on-accent  ×1
   品牌里没有的色值（要新 token 或删掉）：
     #0f0f0f  ×21
     #ff6600  ×11
     #000000  ×7
     #f7f7f7  ×6
     #fe2c55  ×4
     #606060  ×3
     #8a8a8a  ×3
     #f5f7fb  ×3
   非品牌变量（各自一套命名）：
     --border×31  --text-faint×31  --text-muted×30  --text×23  --surface-2×15  --surface-3×14  --mono×13  --radius-full×9  --faint×8  --radius×8  --line×7  --border-strong×7
   圆角超 3px：
     brand/board.html: border-radius: 6px
     brand/board.html: border-radius: 8px
     brand/board.html: border-radius: 999px
     brand/board.html: border-radius: 4px
     brand/board.html: border-radius: 5px
     src/client/style.css: --radius-sm: 4px
```

## 列的含义

| 列 | 含义 |
|---|---|
| 硬编码色 | 源码里写死的 `#rrggbb` 条数 |
| 已是品牌色 | 其中值**已经等于**某个品牌 token —— 换成 `var(--x)` 即零视觉变化 |
| 品牌变量 | 引用品牌 token 名的 `var()` / 总 `var()` |
| 越界圆角 | `border-radius` / `--radius*` 超过品牌契约 3px 的声明数 |
| 贴近度 | 颜色密度 50% + 品牌变量占比 30% + 圆角合规 20%，公式见 `src/audit.mjs` |

## 结论

1. **post 是唯一可以纯机械收敛的应用**：64 处硬编码里 53 处值就是品牌色，圆角 0 越界。改完视觉不变，只是颜色走变量。
2. **web 状态比看上去好**：70 个文件里只有 30 处硬编码，42/60 个 `var()` 已经是品牌名。剩下的是从 Tailwind 默认色板漏进来的（`#9ca3af`、`#1a1a1a`、`#666666`、`#eeeeee`）—— 该删或该建 token，属于设计取舍。
3. **vault 不是"换变量"能解决的**：它有 102 处硬编码、23 处越界圆角、深色优先的独立调色板。注意它的 `accent: #45e0a0` 恰好等于**品牌暗色 accent**，但它在明暗两种主题下都用这一个值 —— 这是设计选择，不是笔误。
4. **send 与 video 最远**：video 17 个文件里 155 处硬编码（每文件 9 处），send 有 30 处越界圆角。这两个要按「重新设计」立项，不要塞进 token 迁移。
5. **pay 有完整的 shadcn 变量体系**（340 处 `var()`，其中 9 处是品牌名），换 token 等于重画主题。

```bash
# 重新生成
node packages/tokens/bin/cli.mjs audit web=~/Projects/Personal/bitspv \
  pay=~/Projects/Personal/bitspv-pay-react video=~/Projects/Personal/bitspv-video \
  send=~/Projects/bsv-apps/bitspv-send vault=~/Projects/bsv-apps/bitspv-vault \
  post=~/Projects/bsv-apps/bitspv-post/frontend
```
