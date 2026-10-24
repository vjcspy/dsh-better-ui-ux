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
 * The mobile layer is also where a plain Enter can only break the line, because
 * `@linxin666/dsh-remote-web-ui` captures Enter at `document` level in the
 * capture phase and inserts the newline itself. The second effect below owns the
 * counterpart gesture: on the same portrait coarse-pointer viewport, an Enter
 * that arrives while the draft already ends with a linebreak sends the message
 * through the rendered send button, and one Enter keeps that layer's newline. It
 * listens on `window` in the capture phase -- ahead of remote's `document`
 * capture handler whatever the mount order -- and contributes no state: the
 * viewport and the caret are both read per event (`mobileComposerEnter.ts`).
 *
 * The stylesheet installed below also carries the compact-picker
 * `_standardControls` anchor for `@linxin666/dsh-remote-web-ui`'s compact
 * mode, moved here from the `vjcspy/dsh-web` fork -- see `compactPickerControls.ts`
 * and `styles.ts` for the rule text and its coupling. This half contributes no
 * additional code for that responsibility: `installModelBadgeStyles` already
 * installs the whole sheet, together with the mobile composer's `box-sizing`
 * override.
 *
 * A third contribution gives a new Session the Files panel as its right
 * column's default (see `DefaultSidebarTab.tsx`). It rides a composer seat, not
 * the header seat above, because the header is suppressed for exactly the blank
 * Session it targets, and it is registered from a scoped `ctx.inject` child
 * context -- the plugin-level `inject` list below stays unchanged, so this
 * optional dependency can never hold the badges or the stylesheet pending.
 *
 *
 * A fourth contribution renames every local-build brand surface. The shell's
 * fallback copy lives in one `common` key, `brand.localBuild`, read by both the
 * sidebar title line and `AppFrame`'s browser-title projection, so wrapping
 * `ctx.locale.bind` (and publishing one locale revision) renames both from a
 * single source; see `brandTitle.ts`. The whale mark itself is removed in the
 * stylesheet below, which also restores the collapsed rail's panel icon that the
 * mark was standing in for.
 * @module dsh-better-ui-ux/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: declares the `locale` member this half reads.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: declares the `slots` member this half registers into.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: declares the header actions seat this half registers into.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: declares the `sidebarRight` member the scoped child context below resolves.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

import {
  COMPOSER_OVERLAY_SLOT,
  DEFAULT_TAB_ID,
  HEADER_ACTIONS_SLOT,
  HEADER_ACTION_ORDER,
  LOCALE_NAMESPACE,
  PLUGIN_ID,
  SUBAGENT_TYPE_ACTION_ID,
  SUBAGENT_TYPE_ACTION_ORDER,
  SUBAGENT_TYPE_LOCALE_NAMESPACE,
} from '../constants.ts'
import { installBrandTitleOverride } from './brandTitle.ts'
import { installCodexUsageViewportSync } from './codexUsageVisibility.ts'
import { installMobileComposerEnter } from './mobileComposerEnter.ts'
import {
  DefaultSidebarTab,
  createOpenFilesByDefault,
  type DefaultSidebarTabInjected,
  type DefaultSidebarTabProps,
} from './DefaultSidebarTab.tsx'
import { ModelBadge, type ModelBadgeInjected, type ModelBadgeProps } from './ModelBadge.tsx'
import { SubagentTypeBadge, type SubagentTypeBadgeInjected, type SubagentTypeBadgeProps } from './SubagentTypeBadge.tsx'
import { en, enSubagentType } from './locales.ts'
import { installModelBadgeStyles } from './styles.ts'

export type { DefaultSidebarTabInjected, DefaultSidebarTabProps } from './DefaultSidebarTab.tsx'
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
  // The deployment's own brand title, applied over the shell's local-build copy.
  // Installed after the dictionaries so the first render already resolves it, and
  // published through one locale revision so an already-mounted page follows.
  ctx.effect(() => installBrandTitleOverride(ctx.locale), `${PLUGIN_ID}: brand title`)
  installModelBadgeStyles(document)
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    return installCodexUsageViewportSync(document, window)
  }, `${PLUGIN_ID}: codex usage visibility`)
  // The mobile layer's second-Enter send. Same window as the gate above, and one
  // capture listener: the capture path starts at `window`, so this decision runs
  // before remote's `document` capture handler turns the key into a newline.
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    return installMobileComposerEnter(document, window)
  }, `${PLUGIN_ID}: mobile composer enter`)
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
  // The sidebar default is the one contribution that depends on a service this
  // plugin does not own, so its dependency is declared on a CHILD context rather
  // than in the plugin-level `inject` above: a plugin-level dependency holds the
  // whole plugin pending until that service exists and unloads/re-applies it
  // whenever the service changes — which would take both badges and the
  // load-bearing compact-picker stylesheet with it, in a deployment whose
  // sidebar is absent or reloading. The child scope's registration disposes with
  // it, so this contribution simply disappears when there is no sidebar.
  ctx.inject(['sidebarRight'], (scoped) => {
    scoped.effect(() => scoped.slots.inject(COMPOSER_OVERLAY_SLOT, () => scoped.slots.register({
      name: COMPOSER_OVERLAY_SLOT,
      id: DEFAULT_TAB_ID,
      inject: (): DefaultSidebarTabInjected => ({
        resolveFilesOpener: createOpenFilesByDefault(scoped),
      }),
    }, DefaultSidebarTab)), `${PLUGIN_ID}: default sidebar tab`)
  })
}
