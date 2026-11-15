#!/usr/bin/env node
/**
 * 发布 @bitspv/tokens 到 GitHub Release（tarball 依赖方式）。
 *
 *   node scripts/release.mjs              # 干跑：只打印将要执行的步骤
 *   node scripts/release.mjs --publish    # 真的打 tag + 建 release + 传 tgz
 *
 * 产物 URL 形如：
 *   https://github.com/cyio/bitspv-platform/releases/download/v0.1.0/bitspv-tokens-0.1.0.tgz
 * 应用里直接把它写成依赖版本即可，不需要 registry、不需要 token。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_DIR = path.join(ROOT, 'packages/tokens')
const OUT_DIR = path.join(ROOT, '.release')

const publish = process.argv.includes('--publish')
const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
const capture = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts }).trim()

const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'))
const tag = `v${pkg.version}`
const tgzName = `bitspv-tokens-${pkg.version}.tgz`
const repo = (() => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  return rootPkg.repository?.url?.replace(/^git@github\.com:/, '').replace(/\.git$/, '').replace(/^https?:\/\/github\.com\//, '') ?? null
})()

if (!repo) {
  console.error('✗ 根 package.json 缺少 repository.url，无法确定发布目标')
  process.exit(1)
}

const steps = [
  ['构建产物', 'pnpm build'],
  ['校验产物与源同步', 'node scripts/check-parity.mjs'],
  ['打包', `npm pack --pack-destination ${JSON.stringify(OUT_DIR)}`, { cwd: PKG_DIR }],
  ['打 tag', `git tag -a ${tag} -m "@bitspv/tokens ${pkg.version}"`],
  ['推 tag', `git push origin ${tag}`],
  ['建 release 并上传', `gh release create ${tag} --repo ${repo} --title "@bitspv/tokens ${pkg.version}" --notes-file ${JSON.stringify(path.join(OUT_DIR, 'notes.md'))} ${JSON.stringify(path.join(OUT_DIR, tgzName))}`],
]

// tag 已存在就没必要重来
try {
  capture(`git rev-parse -q --verify refs/tags/${tag}`)
  console.error(`✗ tag ${tag} 已存在。改版本号再发，或先删 tag。`)
  process.exit(1)
} catch {
  /* 不存在，继续 */
}

// 工作区必须干净，否则发出去的 tgz 与 tag 对不上
if (capture('git status --porcelain')) {
  console.error('✗ 工作区有未提交改动，先提交再发布')
  process.exit(1)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(
  path.join(OUT_DIR, 'notes.md'),
  `## @bitspv/tokens ${pkg.version}

BitSPV 品牌 token 的唯一来源：颜色、字体、间距、圆角、动效。

安装（不需要 registry、不需要 token）：

\`\`\`json
"@bitspv/tokens": "https://github.com/${repo}/releases/download/${tag}/${tgzName}"
\`\`\`

使用：

\`\`\`js
// tailwind.config.js
import preset from '@bitspv/tokens/tailwind-preset.cjs'
export default { presets: [preset] }
\`\`\`

\`\`\`css
@import '@bitspv/tokens/tokens.css';
\`\`\`

校验：\`node scripts/check-parity.mjs\`（产物必须与 tokens.json 同步）
`
)

console.log(`\n发布 ${pkg.name}@${pkg.version} → ${repo}\n`)
if (!publish) {
  console.log('干跑模式，将执行：')
  for (const [label, cmd] of steps) console.log(`  · ${label}: ${cmd}`)
  console.log(`\n依赖写法：`)
  console.log(`  "https://github.com/${repo}/releases/download/${tag}/${tgzName}"`)
  console.log('\n加 --publish 真正执行。')
  process.exit(0)
}

for (const [label, cmd, opts] of steps) {
  console.log(`\n▶ ${label}`)
  run(cmd, opts ?? {})
}

console.log(`\n✓ 已发布 https://github.com/${repo}/releases/tag/${tag}`)
console.log(`  依赖：https://github.com/${repo}/releases/download/${tag}/${tgzName}`)
