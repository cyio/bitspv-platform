# @bitspv/tokens

BitSPV 品牌 token 的唯一来源。颜色、字体、间距、圆角、阴影、动效都在 `tokens.json` 里；CSS 和 Tailwind preset 都是它的产物，**不要手改产物**。

## 用在一个 Tailwind **v3** 应用里

```js
// tailwind.config.js
import preset from '@bitspv/tokens/tailwind-preset.cjs'

export default {
  presets: [preset],
  content: ['./src/**/*.{vue,ts,tsx}'],
}
```

## 用在一个 Tailwind **v4** 应用里

```css
/* 入口 CSS，顺序不能反 */
@import '@bitspv/tokens/tokens.css';
@import '@bitspv/tokens/tailwind-v4.css';
```

v4 只映射颜色。fonts 与 radius 在 `tokens.css` 里已经是同名变量，在 `@theme` 里再声明一次会自我递归。

⚠️ **同名撞车**：`tokens.css` 会在 `:root` 定义 `--paper` / `--ink` / `--rule` / `--accent` 等。如果你的应用已经用了同名但不同含义的变量（典型是 shadcn 的 `--accent` 表示弱底色，而品牌 `--accent` 是动作色），**必须先重命名你自己的那个**，否则会被静默覆盖。

本机实测：BitSPV Post 有 17 个同名变量，其中 11 个值与品牌**逐字节一致**（明暗两套都对），只有 `--accent` 语义冲突。

```css
/* 入口 CSS，放在 tailwind 指令之前 */
@import '@bitspv/tokens/tokens.css';
```

之后只写类名：`bg-paper` / `text-ink` / `border-rule` / `text-accent` / `bg-seal-soft`。

## 用在一个非 Tailwind 的应用里

直接引 `tokens.css`，用 CSS 变量：

```css
body { background: var(--paper); color: var(--ink); }
```

## 生成

```bash
pnpm -C packages/tokens run build     # tokens.json → dist/tokens.css + dist/tailwind-preset.cjs
node scripts/check-parity.mjs         # 校验产物同步，并与主站现有 tokens.css 逐字节比对
```

`check-parity` 的意义：主站现在的 `src/styles/tokens.css` 由旧脚本生成，本包的生成器是它的移植。
**正文必须逐字节一致**——这条测试保证「换生成器 = 零视觉变化」，不然迁移就是拿线上页面赌。

## 契约（改 token 前先读）

1. **圆角上限 3px。** 这是品牌规则，不是建议。审计里「越界圆角」就是违反这一条。
2. **动作色只有一种**（绿）。橙色只给标志与 BSV 属性。
3. **不要新增十六进制**。要新颜色就先在 `tokens.json` 加 token、给 usage 说明，再生成。
4. **没有阴影、没有渐变。** 分隔用 1px `--rule`。
5. 主题切换靠 `prefers-color-scheme` + `html.dark` / `html.light`，不要在组件里做条件配色。

## 审计

```bash
node bin/cli.mjs audit web=~/Projects/Personal/bitspv ['pay=...' ...] [--json]
```

只读扫描，给每个应用一个 0–100 的贴近度，并列出：

- 多少硬编码色**值已经是品牌色**（换成 `var(--x)` 即可，零视觉变化）
- 多少色值品牌里没有（要么加 token，要么删）
- 多少圆角越界

贴近度 = 颜色密度 50% + 品牌变量占比 30% + 圆角合规 20%。颜色用**密度**（每文件硬编码色数）而不是比例，否则「70 个文件 30 处」会和「17 个文件 155 处」得分接近。

扫描口径：跳过 `dist/`、`design/`（设计提案页，故意硬编码示例色）、`tokens.css`（token 定义本身）。

已知局限：不解析 Tailwind 类名（`rounded-lg`、`bg-[#fff]`），只认 CSS 声明与内联 style。结果是**下限**。
