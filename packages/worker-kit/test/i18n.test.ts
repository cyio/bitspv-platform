/**
 * i18n runtime: language switching, the per-key fallback chain, `{param}`
 * interpolation, and detection order. No copy from either product is involved.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createI18n, detectLang, interpolate } from '../src/i18n.ts'

const MESSAGES = {
  en: {
    'brand': 'Brand',
    'greet': 'Hi {name}, {n} items',
    'only.en': 'English only',
    'empty.params': 'no params here'
  },
  zh: {
    'brand': '品牌',
    'greet': '你好 {name}，共 {n} 个',
    'only.zh': '只有中文'
  },
  ja: {
    'brand': 'ブランド'
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('t', () => {
  it('looks up the active language and interpolates params', () => {
    const i18n = createI18n({ messages: MESSAGES, defaultLang: 'en', initialLang: 'zh' })
    expect(i18n.t('brand')).toBe('品牌')
    expect(i18n.t('greet', { name: 'Ann', n: 3 })).toBe('你好 Ann，共 3 个')
  })

  it('falls back to defaultLang when the active language lacks the key', () => {
    const i18n = createI18n({ messages: MESSAGES, defaultLang: 'en', initialLang: 'zh' })
    expect(i18n.t('only.en')).toBe('English only')
  })

  it('uses an explicit fallback chain before defaultLang', () => {
    const i18n = createI18n({
      messages: MESSAGES,
      defaultLang: 'en',
      initialLang: 'ja',
      fallback: ['zh']
    })
    expect(i18n.t('brand')).toBe('ブランド')
    expect(i18n.t('only.zh')).toBe('只有中文') // ja → zh
    expect(i18n.t('only.en')).toBe('English only') // ja → zh → en
  })

  it('renders the key itself when no language has it (a typo is visible, never blank)', () => {
    const i18n = createI18n({ messages: MESSAGES, defaultLang: 'en', initialLang: 'zh' })
    expect(i18n.t('nope.missing')).toBe('nope.missing')
    expect(i18n.has('nope.missing')).toBe(false)
    expect(i18n.has('only.en')).toBe(true)
  })

  it('leaves unknown placeholders alone', () => {
    const i18n = createI18n({ messages: MESSAGES, defaultLang: 'en', initialLang: 'en' })
    expect(i18n.t('greet', { name: 'Ann' })).toBe('Hi Ann, {n} items')
  })
})

describe('interpolate', () => {
  it('replaces every occurrence of a placeholder', () => {
    expect(interpolate('{a}/{a}/{b}', { a: 1, b: 'x' })).toBe('1/1/x')
  })

  it('returns the template untouched without params', () => {
    expect(interpolate('{a}')).toBe('{a}')
  })
})

describe('setLang / getLang', () => {
  it('switches language, reports it, and notifies', () => {
    const seen: string[] = []
    const i18n = createI18n({
      messages: MESSAGES,
      defaultLang: 'en',
      initialLang: 'en',
      onLangChange: (lang) => seen.push(lang)
    })

    expect(i18n.getLang()).toBe('en')
    i18n.setLang('zh')
    expect(i18n.getLang()).toBe('zh')
    expect(i18n.t('brand')).toBe('品牌')
    expect(seen).toEqual(['zh'])
    expect(i18n.langs).toEqual(['en', 'zh', 'ja'])
  })

  it('rejects a language it does not have', () => {
    const i18n = createI18n({ messages: MESSAGES, defaultLang: 'en', initialLang: 'en' })
    // @ts-expect-error — runtime guard for plain-JS callers
    expect(() => i18n.setLang('fr')).toThrow(/unknown language/)
  })

  it('persists to storage and sets <html lang> when the environment provides them', () => {
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value) }
    })
    vi.stubGlobal('document', { documentElement: { lang: '' } })

    const i18n = createI18n({ messages: MESSAGES, defaultLang: 'en', storageKey: 'bitspv.test.lang' })
    i18n.setLang('zh')
    expect(stored.get('bitspv.test.lang')).toBe('zh')
    expect((globalThis as unknown as { document: { documentElement: { lang: string } } }).document.documentElement.lang)
      .toBe('zh-CN')
  })

  it('works without storage or DOM (plain Node / a CLI)', () => {
    const i18n = createI18n({ messages: MESSAGES, defaultLang: 'en', initialLang: 'zh' })
    expect(() => i18n.setLang('en')).not.toThrow()
    expect(i18n.getLang()).toBe('en')
  })
})

describe('detection', () => {
  it('prefers ?lang= over the saved choice, and the saved choice over the browser', () => {
    vi.stubGlobal('location', { search: '?lang=zh' })
    vi.stubGlobal('localStorage', {
      getItem: () => 'ja',
      setItem: () => {}
    })
    vi.stubGlobal('navigator', { language: 'en-US' })

    const i18n = createI18n({ messages: MESSAGES, defaultLang: 'en', storageKey: 'k' })
    expect(i18n.getLang()).toBe('zh')
  })

  it('uses the saved choice when the URL is silent', () => {
    vi.stubGlobal('location', { search: '?other=1' })
    vi.stubGlobal('localStorage', { getItem: () => 'ja', setItem: () => {} })

    expect(createI18n({ messages: MESSAGES, defaultLang: 'en', storageKey: 'k' }).getLang()).toBe('ja')
  })

  it('matches a BCP-47 browser language by prefix', () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    expect(createI18n({ messages: MESSAGES, defaultLang: 'en' }).getLang()).toBe('zh')
  })

  it('falls back to defaultLang when nothing matches', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    expect(createI18n({ messages: MESSAGES, defaultLang: 'en' }).getLang()).toBe('en')
    expect(detectLang(['en', 'zh'], { urlParam: null })).toBeNull()
  })

  it('can ignore the URL entirely', () => {
    vi.stubGlobal('location', { search: '?lang=zh' })
    vi.stubGlobal('navigator', { language: 'en-US' })
    const i18n = createI18n({ messages: MESSAGES, defaultLang: 'en', urlParam: null })
    expect(i18n.getLang()).toBe('en')
  })
})

describe('createI18n validation', () => {
  it('rejects an empty dictionary and a missing default language', () => {
    expect(() => createI18n({ messages: {} as Record<string, Record<string, string>>, defaultLang: 'en' }))
      .toThrow(/messages is empty/)
    expect(() => createI18n({ messages: { en: { a: 'a' } }, defaultLang: 'zh' as 'en' }))
      .toThrow(/defaultLang/)
  })
})
