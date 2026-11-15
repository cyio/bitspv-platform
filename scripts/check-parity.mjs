#!/usr/bin/env node
/**
 * 一致性检查。
 *
 *   node scripts/check-parity.mjs            # dist/tokens.css 是否与 tokens.json 同步
 *   node scripts/check-parity.mjs <path>     # 再比对另一个应用的 tokens.css（忽略文件头）
 *
 * 主站的 tokens.css 由旧脚本生成，文件头 4 行注释不同、正文必须逐字节一致。
 * 这一步是 P2 迁移的安全带：证明「换生成器 = 零视觉变化」。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCss } from '../packages/tokens/src/build.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = path.join(ROOT, 'packages/tokens')
const tokens = JSON.parse(fs.readFileSync(path.join(PKG, 'tokens.json'), 'utf8'))
const expected = buildCss(tokens)

let failed = false

const distPath = path.join(PKG, 'dist/tokens.css')
if (!fs.existsSync(distPath)) {
  console.error(`✗ 缺少 ${path.relative(ROOT, distPath)}，先跑 pnpm build`)
  process.exit(1)
}
if (fs.readFileSync(distPath, 'utf8') !== expected) {
  console.error('✗ dist/tokens.css 与 tokens.json 不同步，跑 pnpm build')
  failed = true
} else {
  console.log('✓ dist/tokens.css 与 tokens.json 同步')
}

const target = process.argv[2] ?? path.join(os.homedir(), 'Projects/Personal/bitspv/src/styles/tokens.css')
if (fs.existsSync(target)) {
  const bodyOf = (css) => css.split('\n').slice(4).join('\n')
  const same = bodyOf(fs.readFileSync(target, 'utf8')) === bodyOf(expected)
  if (same) {
    console.log(`✓ 正文与 ${target.replace(os.homedir(), '~')} 逐字节一致（仅文件头不同）`)
  } else {
    console.error(`✗ 正文与 ${target} 不一致`)
    failed = true
  }
} else {
  console.log(`· 跳过 ${target}（不存在）`)
}

if (failed) process.exit(1)
