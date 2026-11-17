/**
 * i18n runtime mechanism — the machinery only, never the copy.
 *
 * Both products ship the same behaviour in `src/shared/i18n.ts`: one dictionary per
 * language, `t(key, params)` with `{name}` substitution, a resolution order of
 * `?lang=` → saved choice → browser language → default, and a per-key fallback so a
 * missing translation shows something meaningful instead of a raw key.
 *
 * The dictionaries are injected by the caller; no BitSPV string lives here.
 *
 *   const i18n = createI18n({
 *     messages: { zh, en },
 *     defaultLang: 'en',
 *     storageKey: 'bitspv.send.lang'
 *   })
 *   i18n.t('shares.item', { id }) // → '分享 abc' / 'Share abc'
 */

export type Lang = string

export type MessageTable = Record<string, string>

export interface I18nOptions<TLang extends string = string> {
  /** language → key → copy. Insertion order is the order of `langs`, and its keys are the source of `TLang`. */
  messages: Record<TLang, MessageTable>
  /** Used by detection and as the last per-key fallback. Must be in `messages`. */
  defaultLang: NoInfer<TLang>
  /** Explicit starting language; skipped when absent (detection runs instead). */
  initialLang?: NoInfer<TLang>
  /** Per-key fallback order after the active language. `defaultLang` is always last. */
  fallback?: readonly NoInfer<TLang>[]
  /** Where the chosen language is remembered. Omit to never touch storage. */
  storageKey?: string
  /** Query parameter honoured on detection. Default `lang`; pass `null` to ignore the URL. */
  urlParam?: string | null
  /** Called after `setLang`, e.g. to re-render. */
  onLangChange?: (lang: TLang) => void
  /** `<html lang>` value; defaults to `zh` → `zh-CN`, otherwise the tag itself. */
  documentLang?: (lang: NoInfer<TLang>) => string
}

export interface I18n<TLang extends string = string> {
  readonly langs: readonly TLang[]
  readonly defaultLang: TLang
  getLang: () => TLang
  setLang: (lang: TLang) => void
  /** Active language → fallback chain → the key itself. */
  t: (key: string, params?: Record<string, string | number>) => string
  /** True when any language defines the key. */
  has: (key: string) => boolean
}

export function createI18n<TLang extends string> (options: I18nOptions<TLang>): I18n<TLang> {
  const langs = Object.keys(options.messages) as TLang[]
  if (langs.length === 0) throw new Error('createI18n: messages is empty')
  if (!langs.includes(options.defaultLang)) {
    throw new Error(`createI18n: defaultLang "${options.defaultLang}" is not in messages`)
  }

  const fallback = dedupe([
    ...(options.fallback ?? []).filter((lang) => langs.includes(lang)),
    options.defaultLang
  ])

  const initial = options.initialLang != null && langs.includes(options.initialLang)
    ? options.initialLang
    : null

  let current: TLang = initial ?? detectLang(langs, options) ?? options.defaultLang

  function t (key: string, params?: Record<string, string | number>): string {
    for (const lang of orderedLangs(current, fallback)) {
      const value = options.messages[lang][key]
      if (typeof value === 'string') return interpolate(value, params)
    }
    return key
  }

  function has (key: string): boolean {
    return langs.some((lang) => typeof options.messages[lang][key] === 'string')
  }

  function getLang (): TLang {
    return current
  }

  function setLang (lang: TLang): void {
    if (!langs.includes(lang)) throw new Error(`createI18n: unknown language "${lang}"`)
    current = lang
    try {
      if (options.storageKey != null && typeof localStorage !== 'undefined') {
        localStorage.setItem(options.storageKey, lang)
      }
    } catch { /* storage blocked (private mode, file://): the choice just does not survive a reload */ }
    try {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = options.documentLang?.(lang) ?? defaultDocumentLang(lang)
      }
    } catch { /* no DOM */ }
    options.onLangChange?.(lang)
  }

  return { langs, defaultLang: options.defaultLang, getLang, setLang, t, has }
}

/** Replace `{name}` placeholders; numbers are stringified. */
export function interpolate (template: string, params?: Record<string, string | number>): string {
  if (params == null) return template
  let out = template
  for (const [name, replacement] of Object.entries(params)) {
    out = out.split(`{${name}}`).join(String(replacement))
  }
  return out
}

/**
 * Resolution order: `?lang=` → saved choice → browser language → `null` (caller
 * falls back to `defaultLang`). Every probe is guarded so importing this from a test
 * or a CLI under plain Node is safe.
 */
export function detectLang<TLang extends string> (
  langs: readonly TLang[],
  options: Pick<I18nOptions<TLang>, 'storageKey' | 'urlParam'>
): TLang | null {
  const urlParam = options.urlParam === undefined ? 'lang' : options.urlParam

  if (urlParam != null) {
    try {
      if (typeof location !== 'undefined') {
        const fromUrl = new URLSearchParams(location.search).get(urlParam)
        const matched = matchLang(langs, fromUrl)
        if (matched != null) return matched
      }
    } catch { /* no URL API: fall through */ }
  }

  try {
    if (options.storageKey != null && typeof localStorage !== 'undefined') {
      const matched = matchLang(langs, localStorage.getItem(options.storageKey))
      if (matched != null) return matched
    }
  } catch { /* storage blocked: fall through */ }

  try {
    if (typeof navigator !== 'undefined') {
      const matched = matchLang(langs, navigator.language)
      if (matched != null) return matched
    }
  } catch { /* fall through */ }

  return null
}

/** Exact match first, then a BCP-47 prefix match (`zh-CN` → `zh`). */
function matchLang<TLang extends string> (langs: readonly TLang[], candidate: string | null | undefined): TLang | null {
  if (candidate == null) return null
  const value = candidate.trim().toLowerCase()
  if (value === '') return null
  for (const lang of langs) {
    if (lang.toLowerCase() === value) return lang
  }
  for (const lang of langs) {
    if (value.startsWith(`${lang.toLowerCase()}-`)) return lang
  }
  return null
}

function orderedLangs<TLang extends string> (current: TLang, fallback: readonly TLang[]): TLang[] {
  const out: TLang[] = [current]
  for (const lang of fallback) if (!out.includes(lang)) out.push(lang)
  return out
}

function dedupe<T> (values: readonly T[]): T[] {
  return [...new Set(values)]
}

function defaultDocumentLang (lang: string): string {
  return lang === 'zh' ? 'zh-CN' : lang
}
