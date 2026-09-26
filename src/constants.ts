/**
 * Identifiers shared by both halves of the plugin.
 *
 * `PLUGIN_ID` is the single name that has to agree in three places: the package
 * name, the `insert` row id in `cordis.patch.yml`, and the `id` the client bundle
 * hands to the shell's module loader. The slot name and locale namespace are read
 * by the browser half only, but they are declared here so the package keeps one
 * register of the vocabulary it contributes to the shell.
 */

/** Package name, bundle row id, and loader registration id. */
export const PLUGIN_ID = 'dsh-better-ui-ux'

/** Session-scoped header actions seat the badge registers into. */
export const HEADER_ACTIONS_SLOT = 'conversation.session.header.actions'

/**
 * Sort position inside the header actions band.
 *
 * The band is ordered ascending, and this seat sits between the preset label and
 * the job list at the deployment's current composition: subagent catalog `-30`,
 * agent team `-20`, agent preset `-10`, this badge `0`, background jobs `+20`.
 */
export const HEADER_ACTION_ORDER = 0

/** Locale namespace owning every product-visible string this plugin renders. */
export const LOCALE_NAMESPACE = 'modelBadge'
