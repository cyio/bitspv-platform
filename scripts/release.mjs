#!/usr/bin/env node
/**
 * 发布 platform 下的共享包（tokens / worker-kit / brc100）。
 *
 *   node scripts/release.mjs tokens             # 干跑
 *   node scripts/release.mjs worker-kit --publish
 *   node scripts/release.mjs brc100 --publish   # 打包 + 提交 + 打 tag + 推送
 *
 * 产物提交进仓库（packages/<pkg>/dist/*.tgz），应用用 raw 地址消费：
 *   https://raw.githubusercontent.com/cyio/bitspv-platform/<tag>/packages/<pkg>/dist/<tgz>
 *
 * tag 规则：tokens 沿用历史的 v<version>；其余包用 <pkg>-v<version>，
 * 避免三个包各自的版本号互相抢占同一个 vX.Y.Z tag。
 *
 * 为什么不用 GitHub Release：
 *   releases/download/… 会 302 到带签名的资产地址（约一小时过期），pnpm 会把
 *   那个签名地址写进 lockfile，到期后构建全挂。raw.githubusercontent.com
 *   直接 200，不重定向，lockfile 里存的就是稳定地址（W-005）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARGS = process.argv.slice(2)
const publish = ARGS.includes('--publish')
const pkgName = ARGS.find((arg) => !arg.startsWith('--')) ?? 'tokens'
const PKG_DIR = path.join(ROOT, 'packages', pkgName)

if (!fs.existsSync(path.join(PKG_DIR, 'package.json'))) {
  console.error(`✗ 找不到 packages/${pkgName}/package.json`)
  process.exit(1)
}

const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
const capture = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts }).trim()

const pkg = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'))
const tag = pkgName === 'tokens' ? `v${pkg.version}` : `${pkgName}-v${pkg.version}`
const tgzName = `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`
const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const repo = rootPkg.repository.url
  .replace(/^git@github\.com:/, '')
  .replace(/\.git$/, '')
  .replace(/^https?:\/\/github\.com\//, '')

const url = `https://raw.githubusercontent.com/${repo}/${tag}/packages/${pkgName}/dist/${tgzName}`

if (publish) {
  try {
    capture(`git rev-parse -q --verify refs/tags/${tag}`)
    console.error(`✗ tag ${tag} 已存在，先改版本号`)
    process.exit(1)
  } catch {
    /* 不存在 */
  }
}

if (publish && capture('git status --porcelain')) {
  console.error('✗ 工作区有未提交改动，先提交再发布')
  process.exit(1)
}

const hasScript = (name) => Boolean(pkg.scripts?.[name])
const distRel = `packages/${pkgName}/dist`

const steps = []
if (hasScript('build')) {
  steps.push(['构建产物', `pnpm -C packages/${pkgName} run build`])
}
if (pkgName === 'tokens' && hasScript('preset')) {
  steps.push(['生成 Tailwind preset', `pnpm -C packages/tokens run preset`])
}
if (pkgName === 'tokens') {
  steps.push(['校验产物与源同步', 'node scripts/check-parity.mjs'])
}
steps.push(['检查公开边界（无 secret / 专有算法）', 'node scripts/check-public.mjs'])
steps.push([
  '打包进 dist/（提交进仓库）',
  `npm pack --pack-destination ${JSON.stringify(path.join(PKG_DIR, 'dist'))}`,
  { cwd: PKG_DIR },
])
steps.push(['提交 tarball', `git add ${distRel}/${tgzName} && git commit -m "release(${pkgName}): ${pkg.version}"`])
steps.push(['打 tag', `git tag -a ${tag} -m "@bitspv/${pkgName} ${pkg.version}"`])
steps.push(['推送', `git push origin HEAD ${tag}`])

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
