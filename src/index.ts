/**
 * Host half.
 *
 * The plugin renders in the browser, but it is no longer a stub: the subagent
 * type is not client-visible in DSH at all, so the plugin owns the session
 * projection that derives it on the **parent** Session (see `./projection.ts`)
 * and the client reads the value back out of the parent's row. The client bundle
 * is still served only for a loader entry with a live Host fiber, which is a
 * second reason this half must exist.
 *
 * v1 carries no configuration, which is why there is no `Config` export here and
 * no `config:` block in the bundle's patch row.
 */
import type { Context } from '@deepseek-ai/cordis'

import { PLUGIN_ID, SUBAGENT_TYPE_PROJECTION_KEY } from './constants.ts'
import { subagentTypeProjectionDefinition } from './projection.ts'
// Type-only and load-bearing: this module's declaration merges are what make the
// projection key addressable on both the host fold table and the client hook
// table, and importing it here keeps both in one program.
import type {} from './projection-types.ts'

/** Cordis function-plugin name; equals the package name and the patch row id. */
export const name = PLUGIN_ID

/**
 * Activate the Host half.
 *
 * The `wire` block is optional in the projection type, so a definition that
 * silently dropped it would still type-check while publishing nothing to the
 * browser — the failure mode this feature is most likely to hit and the hardest
 * to see. The assertion below turns it into a loud boot error instead.
 *
 * Registration goes through `ctx.inject(['sessionProjections'], …)` rather than a
 * hard `inject: ['sessionProjections']` declaration: the registry documents that
 * form as the way a contributor *preserves optional registration*, and the
 * in-tree registrant uses exactly it. The returned disposer is intentionally
 * dropped — it rides the injecting fiber, so unloading this plugin removes the
 * key cleanly and clients read it as capability absence.
 * @param ctx - Host context.
 */
export function apply(ctx: Context): void {
  if (subagentTypeProjectionDefinition.wire === undefined) {
    throw new Error(`${PLUGIN_ID}: session projection ${SUBAGENT_TYPE_PROJECTION_KEY} has no wire view, so the badge would publish nothing`)
  }
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register(subagentTypeProjectionDefinition)
  })
  ctx.logger.debug(`${PLUGIN_ID}: host half active; the subagent-type projection is registered`)
}
