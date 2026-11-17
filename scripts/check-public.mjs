#!/usr/bin/env node
/**
 * 公开边界检查：机制层包不得含 secret 或专有算法。
 *
 * 背景：platform 仓为 tokens 的 raw tarball 分发而公开；worker-kit / brc100
 * 同仓而自动公开。这两个包里没有任何秘密——secret 全在消费方的 env 里，
 * 公开的是安全机制本身（HMAC session、CSRF、ECDSA 校验、BRC-100 客户端）。
 *
 * 风险不在今天，而在明天：同仓意味着未来有人往机制层塞入真实凭据或自研
 * 密码学时，会被静默发布到公开仓，没有一道门拦住。本检查就是那道门。
 *
 * 规则：
 *   1. 运行时依赖白名单（当前仅 @bsv/sdk）。新增依赖必须显式改白名单。
 *   2. 硬编码 secret：PEM / WIF / 64 位 hex 私钥 / 高熵字符串 / 密钥名 + 高熵值。
 *   3. 专有算法：非白名单加密库导入、node:crypto、硬编码密码学常数表。
 *
 * 用法：node scripts/check-public.mjs   （已并入 pnpm check 与 pnpm release）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGES = ['worker-kit', 'brc100']

/** 机制层包唯一允许的运行时/peer 依赖。 */
const ALLOWED_DEPS = new Set(['@bsv/sdk'])

/** 白名单之外，命中这些包名即视为引入外部密码学实现。 */
const CRYPTO_PACKAGE = /(?:^|\/)(crypto|@noble\/|elliptic|bip39|bip32|secp256k1|tweetnacl|libsodium|sodium|crypto-js|js-sha256|asmcrypto|ethers|web3)(?:\/|$)/i

const PEM_PRIVATE_KEY = /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/
const WIF_PRIVATE_KEY = /\b[5KL][1-9A-HJ-NP-Za-km-z]{50,51}\b/
const HEX64 = /\b[0-9a-fA-F]{64}\b/
const SECRET_NAME = /\b(secret|password|passwd|private[_-]?key|mnemonic|seed[_-]?phrase|api[_-]?key|access[_-]?token|credential|passphrase|wif)\b\s*[:=]\s*['"]([^'"]{6,})['"]/gi
const PLACEHOLDER = /(example|placeholder|your[-_]|todo|xxx|dummy|fake|test|sample|changeme|fill[-_]?me)/i
const ENGLISH_CONST = /^[A-Z][A-Z0-9_]+$/ // 错误码 / 常量名，不是秘密

const findings = []

function shannon (text) {
  const freq = new Map()
  for (const ch of text) freq.set(ch, (freq.get(ch) ?? 0) + 1)
  let entropy = 0
  for (const count of freq.values()) {
    const p = count / text.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

function looksLikeSecret (value) {
  if (PLACEHOLDER.test(value)) return false
  if (WIF_PRIVATE_KEY.test(value) || HEX64.test(value)) return true
  // 高熵判断只针对 ASCII：中文文案字符多、熵天然高，但不是秘密。
  // 真实 secret（base64 / hex / WIF）都是 ASCII 且无空白。
  if (value.length >= 16 && /^[\x20-\x7e]+$/.test(value) && !/\s/.test(value)) {
    return shannon(value) >= 4.2
  }
  return false
}

function walk (dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|js|mjs|cjs)$/.test(entry.name)) out.push(full)
  }
  return out
}

// 规则 1: 依赖白名单
for (const name of PACKAGES) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', name, 'package.json'), 'utf8'))
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (!ALLOWED_DEPS.has(dep)) {
        findings.push(`${name}/package.json: ${field}.${dep} 不在白名单（机制层依赖须显式审批）`)
      }
    }
  }
}

// 规则 2 + 3: 源码
for (const name of PACKAGES) {
  const srcDir = path.join(ROOT, 'packages', name, 'src')
  for (const file of walk(srcDir)) {
    const rel = path.relative(ROOT, file)
    const text = fs.readFileSync(file, 'utf8')
    text.split('\n').forEach((line, index) => {
      const at = `${rel}:${index + 1}`
      const code = line.split('//')[0] // 忽略行尾注释

      if (PEM_PRIVATE_KEY.test(code)) findings.push(`${at} PEM 私钥`)
      if (WIF_PRIVATE_KEY.test(code)) findings.push(`${at} WIF 私钥`)
      if (HEX64.test(code) && /[:=]/.test(code)) findings.push(`${at} 64 位 hex 疑似私钥`)

      for (const match of code.matchAll(/['"]([^'"]{16,})['"]/g)) {
        const value = match[1]
        if (ENGLISH_CONST.test(value)) continue
        if (value.includes('/') || value.includes('\\')) continue // 导入路径 / URL
        if (looksLikeSecret(value)) findings.push(`${at} 高熵字符串（${value.length} 字符）`)
      }
      for (const match of code.matchAll(SECRET_NAME)) {
        if (looksLikeSecret(match[2])) findings.push(`${at} 硬编码 ${match[1]}`)
      }
      for (const match of code.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
        const spec = match[1]
        if (spec.startsWith('.')) continue // 相对导入
        // node:crypto 走 Node 内置密码学，机制层应统一用 WebCrypto。
        const isNodeCrypto = /^(node:)?crypto$/.test(spec)
        if ((isNodeCrypto || CRYPTO_PACKAGE.test(spec)) && !ALLOWED_DEPS.has(spec.split('/')[0])) {
          findings.push(`${at} 非白名单加密导入 ${spec}`)
        }
      }
    })

    const hexConstants = (text.match(/0x[0-9a-fA-F]{8,}/g) ?? []).length
    if (hexConstants >= 16) {
      findings.push(`${rel} 含 ${hexConstants} 个长 hex 常数，疑似自研密码学常数表`)
    }
  }
}

if (findings.length) {
  console.error(`✗ 公开边界检查失败：${findings.length} 项`)
  for (const item of findings) console.error(`  · ${item}`)
  process.exit(1)
}

console.log(`✓ 公开边界检查通过（${PACKAGES.join(' / ')}：无硬编码 secret、无专有算法、依赖在白名单）`)
