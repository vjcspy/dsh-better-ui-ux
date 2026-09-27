/**
 * Copy dictionary for the header model badge.
 *
 * Every product-visible string this plugin renders lives here — the pending
 * marker, and the two accessible names — and reaches the component through the
 * `t` seat its registration declares. The badge's own text is the raw
 * `provider/model` route, which is wire data and stays verbatim.
 *
 * Only English ships. The locale service's lookup chain ends at `en` for every
 * active locale (the built-in `zh` definition declares `en` as its fallback), so a
 * composition running in another language still resolves every key here rather
 * than showing the key itself.
 *
 * The namespace merge lives with its key set, so a module naming
 * `TranslateNS<'modelBadge'>` or `PropsLocale<'modelBadge'>` needs only this file,
 * whichever entry a program loads first.
 */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Header model badge: pending marker and accessible names. */
    modelBadge: ModelBadgeKey
    /** Header subagent-type badge: its accessible name. */
    subagentTypeBadge: SubagentTypeBadgeKey
  }
}

/** English dictionary, and the namespace's key-set source of truth. */
export const en = {
  'state.loading': 'Model: loading…',
  'marker.next': 'next',
  'aria.current': 'Current model route: {model}',
  'aria.next': 'Model route for the next request: {model}',
} satisfies Record<string, string>

/** Every key the badge dictionary defines. */
export type ModelBadgeKey = keyof typeof en

/** The namespace-bound translate seat the badge component receives. */
export type ModelBadgeTranslate = PropsLocale<'modelBadge'>['t']

/**
 * English dictionary for the subagent-type badge.
 *
 * The badge's visible text is the raw delegating tool name, which is wire data
 * and stays verbatim in every locale; only the accessible name is copy.
 */
export const enSubagentType = {
  'aria.type': 'Subagent type: {type}',
} satisfies Record<string, string>

/** Every key the subagent-type dictionary defines. */
export type SubagentTypeBadgeKey = keyof typeof enSubagentType

/** The namespace-bound translate seat the subagent-type badge receives. */
export type SubagentTypeBadgeTranslate = PropsLocale<'subagentTypeBadge'>['t']
