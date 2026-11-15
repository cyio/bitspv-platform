/**
 * tokens.json → tokens.css
 *
 * 从主站 `Personal/bitspv/scripts/gen-tokens.mjs` 移植而来，逐字节兼容：
 * 除文件头 4 行注释外，产物与主站 `src/styles/tokens.css` 完全一致。
 * 任何对生成逻辑的改动都要跑 `pnpm check:parity` 验证。
 */

const kebab = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()

const cssValue = (value) => String(value).replace(/\s+/g, ' ').trim()

export function buildCss(tokens, { header = defaultHeader() } = {}) {
  const colorLines = (theme, withUsage) =>
    tokens.color.tokens.map((token) => {
      const value = token.value[theme] ?? token.value[tokens.color.themes[0].id]
      const usage = withUsage && token.usage ? ` /* ${token.usage} */` : ''
      return `  --${kebab(token.name)}: ${cssValue(value)};${usage}`
    })

  const typeFamilies = Object.entries(tokens.type.families).map(
    ([name, stack]) => `  --font-${kebab(name)}: ${cssValue(stack)};`
  )

  const typeScale = tokens.type.groups.flatMap((group) =>
    group.styles.flatMap((style) => {
      const base = `--text-${kebab(group.name)}-${kebab(style.name)}`
      const lines = [`  ${base}: ${cssValue(style.fontSize)};`]
      if (style.lineHeight) lines.push(`  ${base}--line-height: ${cssValue(style.lineHeight)};`)
      if (style.fontWeight) lines.push(`  ${base}--weight: ${cssValue(style.fontWeight)};`)
      if (style.letterSpacing) lines.push(`  ${base}--tracking: ${cssValue(style.letterSpacing)};`)
      return lines
    })
  )

  const tokenLines = (family) =>
    (tokens[family]?.tokens ?? []).map((token) => {
      const usage = token.usage ? ` /* ${token.usage} */` : ''
      return `  --${kebab(token.name)}: ${cssValue(token.value)};${usage}`
    })

  const dark = [
    ...colorLines('dark', false),
    ...typeFamilies,
    ...typeScale,
    ...tokenLines('spacing'),
    ...tokenLines('radius'),
    ...tokenLines('shadow'),
    ...tokenLines('motion'),
    ...tokenLines('layout'),
  ]

  return `${header}

:root {
  color-scheme: light;

  /* colour — light */
${colorLines('light', true).join('\n')}

  /* type */
${typeFamilies.join('\n')}

${typeScale.join('\n')}

  /* spacing */
${tokenLines('spacing').join('\n')}

  /* radius */
${tokenLines('radius').join('\n')}

  /* elevation — there is none; separate with 1px rules */
${tokenLines('shadow').join('\n')}

  /* motion */
${tokenLines('motion').join('\n')}

  /* layout */
${tokenLines('layout').join('\n')}
}

/* Follow the OS by default; \`html.dark\` / \`html.light\` override it later. */
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;

${dark.join('\n')}
  }
}

html.dark {
  color-scheme: dark;

${dark.join('\n')}
}

html.light {
  color-scheme: light;
}
`
}

export function defaultHeader() {
  return `/* Generated from tokens.json by @bitspv/tokens. Do not edit by hand.
 * Source of truth: packages/tokens/tokens.json
 * Brand rules: Personal/bitspv/design/brand-system/README.md
 */`
}
