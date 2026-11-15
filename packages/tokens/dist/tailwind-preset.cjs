/**
 * BitSPV 品牌 Tailwind preset。
 *
 * 只做一件事：把 `dist/tokens.css` 里的 CSS 变量映射成类名
 * （`bg-paper` / `text-ink` / `border-rule` / `text-accent` …）。
 * **不要在这里加字面色值** —— 值和主题切换都在 tokens.css 里。
 *
 * 用法（Vue / React 通用）：
 *   // tailwind.config.js
 *   import preset from '@bitspv/tokens/tailwind-preset.cjs'
 *   export default { presets: [preset], content: ['./src/**\/*.{vue,ts,tsx}'] }
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        rule: 'var(--rule)',
        'rule-strong': 'var(--rule-strong)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        'on-accent': 'var(--on-accent)',
        seal: 'var(--seal)',
        'seal-text': 'var(--seal-text)',
        'seal-soft': 'var(--seal-soft)',
        'seal-border': 'var(--seal-border)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        'warn-soft': 'var(--warn-soft)',
        'warn-border': 'var(--warn-border)',
        bitcoin: 'var(--bitcoin)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
    },
  },
}
