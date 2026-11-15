#!/usr/bin/env node
/**
 * @bitspv/tokens CLI
 *
 *   bitspv-tokens build  [--out dist/tokens.css] [--input tokens.json]
 *   bitspv-tokens preset [--out tailwind-preset.cjs]
 *   bitspv-tokens audit  <app-dir...> [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCss } from '../src/build.mjs'
import { auditApp, formatReport, conformance } from '../src/audit.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else flags[key] = true
    } else positional.push(argv[i])
  }
  return { flags, positional }
}

const readTokens = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))

function cmdBuild({ flags }) {
  const input = path.resolve(flags.input ?? path.join(PKG, 'tokens.json'))
  const out = path.resolve(flags.out ?? path.join(PKG, 'dist/tokens.css'))
  const css = buildCss(readTokens(input))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, css)
  console.log(`tokens.css → ${path.relative(process.cwd(), out) || out} (${css.split('\n').length} 行)`)
}

function cmdPreset({ flags }) {
  const src = path.join(PKG, 'tailwind-preset.cjs')
  const out = path.resolve(flags.out ?? path.join(PKG, 'dist/tailwind-preset.cjs'))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.copyFileSync(src, out)
  console.log(`tailwind preset → ${path.relative(process.cwd(), out) || out}`)
}

function cmdAudit({ flags, positional }) {
  if (!positional.length) {
    console.error('用法: bitspv-tokens audit <[label=]app-dir...> [--json]')
    process.exit(1)
  }
  const tokens = readTokens(path.join(PKG, 'tokens.json'))
  const results = positional.map((arg) => {
    // 支持 `post=~/Projects/bsv-apps/bitspv-post/frontend`
    const eq = arg.indexOf('=')
    const [label, dir] = eq > 0 ? [arg.slice(0, eq), arg.slice(eq + 1)] : [undefined, arg]
    const abs = dir.startsWith('~')
      ? path.join(process.env.HOME ?? '', dir.slice(1))
      : path.resolve(dir)
    return auditApp(abs, tokens, label)
  })
  if (flags.json) {
    console.log(JSON.stringify(results.map((r) => ({ ...r, conformance: conformance(r) })), null, 2))
  } else {
    console.log(formatReport(results))
  }
}

const [cmd, ...rest] = process.argv.slice(2)
const args = parseArgs(rest)
switch (cmd) {
  case 'build':
    cmdBuild(args)
    break
  case 'preset':
    cmdPreset(args)
    break
  case 'audit':
    cmdAudit(args)
    break
  default:
    console.log('bitspv-tokens build | preset | audit <dir...> [--json]')
    if (cmd) process.exit(1)
}
