/**
 * Host half.
 *
 * The plugin renders entirely in the browser, so this fiber does nothing at run
 * time. It exists because a client bundle is served only for a loader entry with
 * a live Host fiber: dropping this half would remove the plugin from the page
 * rather than ship a client-only plugin.
 *
 * v1 carries no configuration, which is why there is no `Config` export here and
 * no `config:` block in the bundle's patch row.
 */
import type { Context } from '@deepseek-ai/cordis'

import { PLUGIN_ID } from './constants.ts'

/** Cordis function-plugin name; equals the package name and the patch row id. */
export const name = PLUGIN_ID

/**
 * Activate the Host half.
 * @param ctx - Host context. No service is read, so nothing is declared.
 */
export function apply(ctx: Context): void {
  ctx.logger.debug(`${PLUGIN_ID}: host half active; the badge renders in the browser half`)
}
