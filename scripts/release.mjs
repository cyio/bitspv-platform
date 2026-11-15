#!/usr/bin/env node
/**
 * 发布 @bitspv/tokens。
 *
 *   node scripts/release.mjs              # 干跑
 *   node scripts/release.mjs --publish    # 打包 + 提交 + 打 tag + 推送
 *
 * 产物提交进仓库（packages/tokens/dist/*.tgz），应用用 raw 地址消费：
 *   https://raw.githubusercontent.com/cyio/bitspv-platform/v0.1.2/bitspv-tokens-0.1.2.tgz
 *
 * 为什么不用 GitHub Release：
 *   releases/download/… 会 302 到带签名的资产地址（约一小时过期），pnpm 会把
 *   那个签名地址写进 lockfile，到期后构建全挂。raw.githubusercontent.com
 *   直接 200，不重定向，lockfile 里存的就是稳定地址。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG_DIR = path.join(ROOT, 'packages/tokens')
const DIST = path.join(PKG_DIR, 'dist')

const publish = process.argv.includes('--publish')
const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
const capture = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts }).trim()

const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'))
const tag = `v${pkg.version}`
const tgzName = `bitspv-tokens-${pkg.version}.tgz`
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const repo = rootPkg.repository.url
  .replace(/^git@github\.com:/, '')
  .replace(/\.git$/, '')
  .replace(/^https?:\/\/github\.com\//, '')

const url = `https://raw.githubusercontent.com/${repo}/${tag}/packages/tokens/dist/${tgzName}`

try {
  capture(`git rev-parse -q --verify refs/tags/${tag}`)
  console.error(`✗ tag ${tag} 已存在，先改版本号`)
  process.exit(1)
} catch {
  /* 不存在 */
}

if (publish && capture('git status --porcelain')) {
  console.error('✗ 工作区有未提交改动，先提交再发布')
  process.exit(1)
}

const steps = [
  ['构建产物', 'pnpm build'],
  ['校验产物与源同步', 'node scripts/check-parity.mjs'],
  [
    '打包进 dist/（提交进仓库）',
    `npm pack --pack-destination ${JSON.stringify(DIST)}`,
    { cwd: PKG_DIR },
  ],
  ['提交 tarball', `git add packages/tokens/dist/${tgzName} && git commit -m "release(tokens): ${pkg.version}"`],
  ['打 tag', `git tag -a ${tag} -m "@bitspv/tokens ${pkg.version}"`],
  ['推送', `git push origin HEAD ${tag}`],
]

console.log(`\n发布 ${pkg.name}@${pkg.version} → ${repo}\n`)
if (!publish) {
  for (const [label, cmd] of steps) console.log(`  · ${label}: ${cmd}`)
  console.log(`\n应用里的依赖写法：\n  "${url}"`)
  console.log('\n加 --publish 真正执行。')
  process.exit(0)
}

for (const [label, cmd, opts] of steps) {
  console.log(`\n▶ ${label}`)
  run(cmd, opts ?? {})
}

console.log(`\n✓ 已发布 ${tag}`)
console.log(`  依赖：${url}`)
