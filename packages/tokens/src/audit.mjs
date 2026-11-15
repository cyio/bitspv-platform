/**
 * 审计：一个应用离品牌 token 有多远。
 *
 * 只读，不改任何文件。回答三个问题：
 *   1. 有多少颜色是**写死的十六进制**，其中多少值其实已经是品牌色（只需换成变量）
 *   2. 用了多少品牌 token 变量
 *   3. 有多少圆角超过品牌契约（≤ 3px）
 *
 * 已知局限：不解析 Tailwind 类名（`rounded-lg` / `bg-[#fff]`），只认 CSS 声明与
 * 内联 style。所以结果是**下限**，不是全部。
 */
import fs from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.vercel',
  '.next',
  'coverage',
  'dev-dist',
  'test-results',
  'design', // 设计提案页，故意硬编码示例色，不是线上代码
])

const SCAN_EXT = new Set(['.css', '.vue', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.html', '.svelte'])

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const VAR_RE = /var\(\s*--([a-z0-9-]+)/g
const RADIUS_RE = /(?:border-radius|--radius[a-z0-9-]*)\s*:\s*([^;}]+)/g

function* walk(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') {
      if (SKIP_DIRS.has(e.name)) continue
    }
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      yield* walk(p)
    } else if (SCAN_EXT.has(path.extname(e.name))) {
      // 生成物不算硬编码：tokens.css 里的十六进制就是 token 本身
      if (e.name === 'stats.html' || e.name === 'tokens.css') continue
      yield p
    }
  }
}

/** 品牌色值 → token 名（light 与 dark 都收，同名冲突时保留第一个） */
export function brandColorIndex(tokens) {
  const index = new Map()
  for (const token of tokens.color.tokens) {
    for (const theme of tokens.color.themes.map((t) => t.id)) {
      const raw = String(token.value[theme] ?? '').trim().toLowerCase()
      if (!raw.startsWith('#')) continue
      const norm = normalizeHex(raw)
      if (norm && !index.has(norm)) index.set(norm, token.name)
    }
  }
  return index
}

function normalizeHex(hex) {
  let h = hex.toLowerCase()
  if (h.length === 4) h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
  if (h.length === 9) h = h.slice(0, 7) // 丢掉 alpha，按颜色归并
  return h
}

export function brandVarNames(tokens) {
  const names = new Set(tokens.color.tokens.map((t) => t.name))
  for (const family of ['spacing', 'radius', 'shadow', 'motion', 'layout']) {
    for (const t of tokens[family]?.tokens ?? []) names.add(t.name)
  }
  return names
}

/**
 * @param {string} appDir
 * @param {object} tokens  已解析的 tokens.json
 */
export function auditApp(appDir, tokens, label) {
  const brandHex = brandColorIndex(tokens)
  const brandVars = brandVarNames(tokens)

  const result = {
    app: label ?? path.basename(appDir),
    dir: appDir,
    files: 0,
    hex: { total: 0, brand: 0, off: 0, top: [], offValues: [], brandValues: [] },
    vars: { total: 0, brand: 0, foreign: 0, foreignNames: [] },
    radius: { overContract: 0, samples: [] },
  }

  const hexByFile = new Map()
  const brandHexHits = new Map()
  const offHexHits = new Map()
  const foreignVars = new Map()
  const overRadius = new Map()

  for (const file of walk(appDir)) {
    result.files++
    let src
    try {
      src = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const rel = path.relative(appDir, file)

    for (const m of src.matchAll(HEX_RE)) {
      const norm = normalizeHex(m[0])
      if (!norm) continue
      result.hex.total++
      hexByFile.set(rel, (hexByFile.get(rel) ?? 0) + 1)
      const tokenName = brandHex.get(norm)
      if (tokenName) {
        result.hex.brand++
        const key = `${norm} → ${tokenName}`
        brandHexHits.set(key, (brandHexHits.get(key) ?? 0) + 1)
      } else {
        result.hex.off++
        offHexHits.set(norm, (offHexHits.get(norm) ?? 0) + 1)
      }
    }

    for (const m of src.matchAll(VAR_RE)) {
      const name = m[1]
      result.vars.total++
      // 只认「变量名等于品牌 token 名」或「以品牌 token 名为前缀」（如 paper-2）
      const isBrand = [...brandVars].some((n) => name === n || name.startsWith(`${n}-`))
      if (isBrand) result.vars.brand++
      else {
        result.vars.foreign++
        foreignVars.set(name, (foreignVars.get(name) ?? 0) + 1)
      }
    }

    for (const m of src.matchAll(RADIUS_RE)) {
      const decl = m[1]
      for (const px of decl.matchAll(/(\d+(?:\.\d+)?)\s*px/g)) {
        const v = parseFloat(px[1])
        if (v > 3) {
          result.radius.overContract++
          const key = `${rel}: ${m[0].trim()}`
          if (!overRadius.has(key)) overRadius.set(key, v)
        }
      }
    }
  }

  result.hex.top = [...hexByFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  result.hex.brandValues = [...brandHexHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  result.hex.offValues = [...offHexHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  result.vars.foreignNames = [...foreignVars.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  result.radius.samples = [...overRadius.keys()].slice(0, 6)

  return result
}

/**
 * 0–100 的贴近度。故意做成「密度」而不是「比例」，否则 70 个文件里 30 处硬编码
 * 会和 17 个文件里 155 处硬编码得到差不多的分数。
 *
 *   颜色 50%：每文件硬编码色数量，0 处 = 满分，5 处及以上 = 0 分
 *   变量 30%：引用品牌 token 名的 var() 占比
 *   圆角 20%：无越界 = 满分
 */
export function conformance(r) {
  const density = r.files ? r.hex.total / r.files : 0
  const colorScore = Math.max(0, 1 - density / 5)
  const varScore = r.vars.total ? r.vars.brand / r.vars.total : 0
  const radiusScore = r.radius.overContract === 0 ? 1 : 0
  return Math.round((colorScore * 0.5 + varScore * 0.3 + radiusScore * 0.2) * 100)
}

export function formatReport(results) {
  const lines = []
  const rows = results.map((r) => ({ r, score: conformance(r) })).sort((a, b) => b.score - a.score)

  const w = Math.max(14, ...rows.map(({ r }) => displayWidth(r.app))) + 2
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - displayWidth(String(s))))

  lines.push('')
  lines.push(`${pad('应用', w)}${pad('贴近度', 8)}${pad('文件', 6)}${pad('硬编码色', 10)}${pad('已是品牌色', 12)}${pad('品牌变量', 10)}越界圆角`)
  for (const { r, score } of rows) {
    lines.push(
      `${pad(r.app, w)}${pad(`${score}%`, 8)}${pad(r.files, 6)}${pad(r.hex.total, 10)}` +
        `${pad(r.hex.brand, 12)}${pad(`${r.vars.brand}/${r.vars.total}`, 10)}${r.radius.overContract}`
    )
  }

  for (const { r, score } of rows) {
    lines.push('')
    lines.push(`── ${r.app} (${score}%)  ${r.dir}`)
    if (r.hex.brandValues.length) {
      lines.push('   值已是品牌色、只差换成变量：')
      for (const [k, n] of r.hex.brandValues) lines.push(`     ${k}  ×${n}`)
    }
    if (r.hex.offValues.length) {
      lines.push('   品牌里没有的色值（要新 token 或删掉）：')
      for (const [k, n] of r.hex.offValues) lines.push(`     ${k}  ×${n}`)
    }
    if (r.vars.foreignNames.length) {
      lines.push('   非品牌变量（各自一套命名）：')
      lines.push(`     ${r.vars.foreignNames.map(([n, c]) => `--${n}×${c}`).join('  ')}`)
    }
    if (r.radius.samples.length) {
      lines.push('   圆角超 3px：')
      for (const s of r.radius.samples) lines.push(`     ${s}`)
    }
  }
  return lines.join('\n')
}

function displayWidth(s) {
  return [...s].reduce((a, ch) => a + (/[\u4e00-\u9fff]/.test(ch) ? 2 : 1), 0)
}
