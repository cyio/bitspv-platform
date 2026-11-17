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
export type Lang = string;
export type MessageTable = Record<string, string>;
export interface I18nOptions<TLang extends string = string> {
    /** language → key → copy. Insertion order is the order of `langs`, and its keys are the source of `TLang`. */
    messages: Record<TLang, MessageTable>;
    /** Used by detection and as the last per-key fallback. Must be in `messages`. */
    defaultLang: NoInfer<TLang>;
    /** Explicit starting language; skipped when absent (detection runs instead). */
    initialLang?: NoInfer<TLang>;
    /** Per-key fallback order after the active language. `defaultLang` is always last. */
    fallback?: readonly NoInfer<TLang>[];
    /** Where the chosen language is remembered. Omit to never touch storage. */
    storageKey?: string;
    /** Query parameter honoured on detection. Default `lang`; pass `null` to ignore the URL. */
    urlParam?: string | null;
    /** Called after `setLang`, e.g. to re-render. */
    onLangChange?: (lang: TLang) => void;
    /** `<html lang>` value; defaults to `zh` → `zh-CN`, otherwise the tag itself. */
    documentLang?: (lang: NoInfer<TLang>) => string;
}
export interface I18n<TLang extends string = string> {
    readonly langs: readonly TLang[];
    readonly defaultLang: TLang;
    getLang: () => TLang;
    setLang: (lang: TLang) => void;
    /** Active language → fallback chain → the key itself. */
    t: (key: string, params?: Record<string, string | number>) => string;
    /** True when any language defines the key. */
    has: (key: string) => boolean;
}
export declare function createI18n<TLang extends string>(options: I18nOptions<TLang>): I18n<TLang>;
/** Replace `{name}` placeholders; numbers are stringified. */
export declare function interpolate(template: string, params?: Record<string, string | number>): string;
/**
 * Resolution order: `?lang=` → saved choice → browser language → `null` (caller
 * falls back to `defaultLang`). Every probe is guarded so importing this from a test
 * or a CLI under plain Node is safe.
 */
export declare function detectLang<TLang extends string>(langs: readonly TLang[], options: Pick<I18nOptions<TLang>, 'storageKey' | 'urlParam'>): TLang | null;
