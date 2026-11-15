# Token 贴近度基线（2026-11-15）

> 由 `bitspv-tokens audit` 生成，只读扫描，不改代码。
> 重新生成：见文末命令。**数字会随代码变化，别把它当承诺，当基线。**

```

应用            贴近度  文件  硬编码色  已是品牌色  品牌变量  越界圆角
post            76%     97    64        53          56/115    0
web             56%     72    155       114         178/273   3
send            22%     122   127       21          109/242   30
vault           21%     68    102       17          165/376   23
video           20%     17    155       31          112/328   22
pay             6%      61    71        7           9/340     3

── post (76%)  /Users/gongyi01/Projects/bsv-apps/bitspv-post/frontend
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

── web (56%)  /Users/gongyi01/Projects/Personal/bitspv
   值已是品牌色、只差换成变量：
     #ffffff → paper  ×7
     #067a52 → accent  ×7
     #f7931a → bitcoin  ×6
     #cccccc → ink  ×6
     #45e0a0 → accent  ×6
     #1f1f1f → paper  ×5
     #3b3b3b → ink  ×4
     #1a7f37 → seal  ×4
   品牌里没有的色值（要新 token 或删掉）：
     #646cff  ×3
     #2563eb  ×3
     #1a1a1a  ×3
     #0a0e14  ×2
     #eeeeee  ×2
     #9ca3af  ×2
     #666666  ×2
     #fbeceb  ×1
   非品牌变量（各自一套命名）：
     --sans×31  --mono×27  --radius×19  --font-sans×3  --font-mono×2  --white×2  --gray-800×2  --gray-750×2  --main-surface×1  --gray-100×1  --gray-400×1  --gray-500×1
   圆角超 3px：
     src/components/WalletGuide.vue: border-radius: 16px
     src/components/WalletGuide.vue: border-radius: 12px
     src/pages/index/App.vue: border-radius: 6px

── send (22%)  /Users/gongyi01/Projects/bsv-apps/bitspv-send
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

── vault (21%)  /Users/gongyi01/Projects/bsv-apps/bitspv-vault
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

── video (20%)  /Users/gongyi01/Projects/Personal/bitspv-video
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

── pay (6%)  /Users/gongyi01/Projects/Personal/bitspv-pay-react
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
```

## 怎么读这张表

| 列 | 含义 |
|---|---|
| 硬编码色 | 源码里写死的 `#rrggbb` 数量 |
| 已是品牌色 | 其中值**已经等于**某个品牌 token 的数量 —— 只需换成 `var(--x)`，零视觉变化 |
| 品牌变量 | 引用了品牌 token 名的 `var(--…)` / 总 `var()` 引用 |
| 越界圆角 | `border-radius` 或 `--radius*` 超过品牌契约 3px 的声明数 |

## 结论

- **post** 是唯一接近收敛的应用：53/64 个硬编码色已经是品牌色，圆角全部合规。收敛 = 纯机械替换，无设计争议。
- **web** 是 token 的源，但自己还有 114 处「值对、没走变量」的硬编码，其中混进了 6 次 `#45e0a0`（vault 的薄荷绿）和 2 次 `#0a0e14`（vault 的底色）—— 说明有片段被从 vault 拷过来。
- **vault / video / send** 各有 22–30 处越界圆角，且调色板与品牌无关（vault 是深色薄荷、video 与 send 各有一套）。**这不是替换变量能解决的，是重新设计。**需要单独决策，不要在 P2 里顺手改。
- **pay** 6%：它有一套完整的 shadcn 变量体系（340 处 `var()`，只有 9 处是品牌名），换 token 等于重画主题。

```bash
node packages/tokens/bin/cli.mjs audit web=~/Projects/Personal/bitspv \
  pay=~/Projects/Personal/bitspv-pay-react \
  video=~/Projects/Personal/bitspv-video \
  send=~/Projects/bsv-apps/bitspv-send \
  vault=~/Projects/bsv-apps/bitspv-vault \
  post=~/Projects/bsv-apps/bitspv-post/frontend
```
