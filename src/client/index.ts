/**
 * Browser half: register the effective-model badge on the session header.
 *
 * One registrant covers every Session the main view can show — the main Session,
 * a continuable or one-shot subagent child opened in the main view, and an Agent
 * Team teammate — because the seat is declared `scope: 'session'` and the shell
 * renders it once per shown Session with that Session's own projection seat.
 *
 * The inject face carries no value: the badge reads only the standard session
 * seats, so this half contributes a component and its copy, nothing else. No store
 * is declared, because the badge owns no viewing state to share.
 *
 * This half also owns the mobile visibility gate for the subscription usage
 * pill: the stylesheet hides that pill while `<html>` carries
 * `data-dsh-codex-usage="hidden"`, the badge render keeps that attribute in sync
 * with the shown Session's provider, and a viewport listener below keeps it
 * correct across resizes and orientation changes. Desktop removes the attribute,
 * so the desktop layout is untouched.
 *
 * The stylesheet installed below also carries the compact-picker
 * `_standardControls` anchor for `@linxin666/dsh-remote-web-ui`'s compact
 * mode, moved here from the `vjcspy/dsh-web` fork -- see `compactPickerControls.ts`
 * and `styles.ts` for the rule text and its coupling. This half contributes no
 * additional code for that responsibility: `installModelBadgeStyles` already
 * installs the whole sheet.
 *
 * @module dsh-better-ui-ux/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: declares the `locale` member this half reads.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: declares the `slots` member this half registers into.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: declares the header actions seat this half registers into.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

import {
  HEADER_ACTIONS_SLOT,
  HEADER_ACTION_ORDER,
  LOCALE_NAMESPACE,
  PLUGIN_ID,
  SUBAGENT_TYPE_ACTION_ID,
  SUBAGENT_TYPE_ACTION_ORDER,
  SUBAGENT_TYPE_LOCALE_NAMESPACE,
} from '../constants.ts'
import { installCodexUsageViewportSync } from './codexUsageVisibility.ts'
import { ModelBadge, type ModelBadgeInjected, type ModelBadgeProps } from './ModelBadge.tsx'
import { SubagentTypeBadge, type SubagentTypeBadgeInjected, type SubagentTypeBadgeProps } from './SubagentTypeBadge.tsx'
import { en, enSubagentType } from './locales.ts'
import { installModelBadgeStyles } from './styles.ts'

export type { ModelBadgeInjected, ModelBadgeProps } from './ModelBadge.tsx'
export type { SubagentTypeBadgeInjected, SubagentTypeBadgeProps } from './SubagentTypeBadge.tsx'

/** Services this half reads; both are shell-provided. */
export const inject = ['slots', 'locale']

/**
 * Register both badges' dictionaries, the stylesheet, and the header actions.
 * @param ctx - browser-side plugin context owning the locale and slot registries.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, 'en', en), `${PLUGIN_ID}: dictionaries`)
  ctx.effect(
    () => ctx.locale.register(SUBAGENT_TYPE_LOCALE_NAMESPACE, 'en', enSubagentType),
    `${PLUGIN_ID}: subagent type dictionary`,
  )
  installModelBadgeStyles(document)
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    return installCodexUsageViewportSync(document, window)
  }, `${PLUGIN_ID}: codex usage visibility`)
  // `inject` waits on the seat's own declaration and removes the contribution
  // when that declaration collapses, so this needs no ordering assumption
  // against the conversation plugin's activation.
  ctx.effect(() => ctx.slots.inject(HEADER_ACTIONS_SLOT, () => ctx.slots.register({
    name: HEADER_ACTIONS_SLOT,
    id: PLUGIN_ID,
    order: HEADER_ACTION_ORDER,
    locale: LOCALE_NAMESPACE,
    inject: (): ModelBadgeInjected => ({}),
  }, ModelBadge)), `${PLUGIN_ID}: model badge`)
  // A second, independent registration on the same seat. Its negative order puts
  // it immediately before the model badge, which keeps `order: 0` for the badge
  // that already shipped rather than renumbering it.
  ctx.effect(() => ctx.slots.inject(HEADER_ACTIONS_SLOT, () => ctx.slots.register({
    name: HEADER_ACTIONS_SLOT,
    id: SUBAGENT_TYPE_ACTION_ID,
    order: SUBAGENT_TYPE_ACTION_ORDER,
    locale: SUBAGENT_TYPE_LOCALE_NAMESPACE,
    inject: (): SubagentTypeBadgeInjected => ({}),
  }, SubagentTypeBadge)), `${PLUGIN_ID}: subagent type badge`)
}
