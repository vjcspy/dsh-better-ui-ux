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

/**
 * Sort position of the subagent-type badge inside the same header actions band.
 *
 * Negative, so it sorts before the model badge at `HEADER_ACTION_ORDER` without
 * touching that registration: the type is the coarser fact and reads first.
 */
export const SUBAGENT_TYPE_ACTION_ORDER = -10

/**
 * Slot `id` of the subagent-type badge.
 *
 * Distinct from `PLUGIN_ID`, which already identifies the model badge on the
 * same seat; two registrations in one band must not share an id.
 */
export const SUBAGENT_TYPE_ACTION_ID = `${PLUGIN_ID}-subagent-type`

/** Locale namespace owning the subagent-type badge's copy. */
export const SUBAGENT_TYPE_LOCALE_NAMESPACE = 'subagentTypeBadge'

/**
 * Projection key of the parent-owned map from child Session id to tool name.
 *
 * The delegating tool name exists only in the parent's own log, and a
 * projection's `apply` sees only its own Session's events, so the fold lives on
 * the parent and the badge navigates to it.
 */
export const SUBAGENT_TYPE_PROJECTION_KEY = 'subagentType'

/**
 * Tool names whose `tool/call` may become a delegation anchor.
 *
 * Admission is by tool **name**, not by argument shape: `bash` also declares a
 * required `description`, so a description-presence filter would not bound the
 * fold state.
 */
export const ADMITTED_DELEGATION_TOOL_NAMES: readonly string[] = [
  'subagent',
  'subagent_fork',
  'spawn_teammate',
]

/** Prefix of a project-scoped role-agent tool name (`dsh-project-context`). */
export const AGENT_TOOL_NAME_PREFIX = 'agent_'
