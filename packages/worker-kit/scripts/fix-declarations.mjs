#!/usr/bin/env node
/**
 * Post-process `tsc` declaration output.
 *
 * The source imports carry the `.ts` suffix (same convention as the products, and
 * what `node --experimental-strip-types` / vitest resolve). `tsc`'s
 * `rewriteRelativeImportExtensions` rewrites those specifiers in the emitted `.js`,
 * but — as of TypeScript 5.9 — leaves them `.ts` inside `.d.ts`. A published `.d.ts`
 * that points at `./bytes.ts` would not resolve in a consumer (only `bytes.d.ts`
 * ships), so rewrite there too and fail the build if anything is left behind.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'dist')
const RELATIVE_TS = /(\bfrom\s*['"])(\.{1,2}\/[^'"]*?)\.ts(['"])/g
const ANY_RELATIVE_TS = /\bfrom\s*['"]\.{1,2}\/[^'"]*\.ts['"]/

let rewritten = 0
for (const entry of readdirSync(dist)) {
  if (!entry.endsWith('.d.ts')) continue
  const file = path.join(dist, entry)
  const before = readFileSync(file, 'utf8')
  const after = before.replace(RELATIVE_TS, '$1$2.js$3')
  if (after !== before) {
    writeFileSync(file, after)
    rewritten++
  }
  if (ANY_RELATIVE_TS.test(after)) {
    console.error(`✗ ${entry} still imports a relative .ts path`)
    process.exit(1)
  }
}

for (const entry of readdirSync(dist)) {
  if (!entry.endsWith('.js')) continue
  const text = readFileSync(path.join(dist, entry), 'utf8')
  if (ANY_RELATIVE_TS.test(text)) {
    console.error(`✗ ${entry} still imports a relative .ts path`)
    process.exit(1)
  }
}

console.log(`✓ declarations rewritten: ${rewritten} file(s)`)
