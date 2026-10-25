/**
 * Browser install identity: serve the Aweave web-app manifest, its favicons and
 * its app icons from the host's route table.
 *
 * The Web shell links `/manifest.webmanifest` and two media-qualified favicons as
 * static files, and the browser resolves an installed app's name and icon from
 * those URLs at install time. The SPA dist owns that surface, but an exact
 * `webServer` route is matched before the static fallback, so this plugin can
 * replace the served bytes without a core change. The manifest keeps relative
 * members and no `id` so each public mount keeps its own resolved identity.
 *
 * Lifecycle: all seven routes register inside one `webServer` effect on the
 * injecting fiber, so a plugin reload removes them before re-activation. The
 * effect is all-or-nothing: a duplicate `(kind, path)` from a re-mount disposes
 * the partial set and logs, leaving the shell's own bytes serving while the rest
 * of this plugin (projection, badges, title) stays active.
 */
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'

import { PLUGIN_ID } from './constants.ts'

/** One served brand asset: request path, packaged file name, response type. */
interface BrandAsset {
  /** Absolute pathname the browser requests. */
  readonly path: string
  /** File name under `assets/brand/` in this package. */
  readonly file: string
  /** Response `content-type`. */
  readonly contentType: string
}

/** The install-identity surface, one route per file the browser may request. */
const BRAND_ASSETS: readonly BrandAsset[] = [
  { path: '/manifest.webmanifest', file: 'manifest.webmanifest', contentType: 'application/manifest+json' },
  { path: '/favicon.svg', file: 'favicon.svg', contentType: 'image/svg+xml' },
  { path: '/favicon-dark.svg', file: 'favicon-dark.svg', contentType: 'image/svg+xml' },
  { path: '/icons/aweave-icon.svg', file: 'aweave-icon.svg', contentType: 'image/svg+xml' },
  { path: '/icons/aweave-192.png', file: 'aweave-192.png', contentType: 'image/png' },
  { path: '/icons/aweave-512.png', file: 'aweave-512.png', contentType: 'image/png' },
  { path: '/icons/aweave-maskable-512.png', file: 'aweave-maskable-512.png', contentType: 'image/png' },
]

/** Directory holding the packaged brand assets, next to the built `lib/`. */
const ASSET_ROOT = new URL('../assets/brand/', import.meta.url)

/**
 * Read one packaged brand file.
 *
 * A missing file is a packaging defect of this plugin alone, so activation fails
 * loudly instead of serving a half-branded page.
 * @param asset - asset whose packaged body to read.
 * @returns the file bytes.
 */
function readBrandAsset (asset: BrandAsset): Buffer {
  try {
    return readFileSync(new URL(asset.file, ASSET_ROOT))
  } catch (error: unknown) {
    throw new Error(`${PLUGIN_ID}: brand asset "${asset.file}" is not packaged (${String(error)})`)
  }
}

/**
 * Build one route handler that owns the full response lifecycle.
 * @param asset - asset supplying the response content type.
 * @param body - packaged bytes to serve.
 * @returns handler serving `GET`/`HEAD` and rejecting other methods.
 */
function brandHandler (asset: BrandAsset, body: Buffer): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' })
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': asset.contentType, 'cache-control': 'no-cache' })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(body)
  }
}

/**
 * Register the manifest, favicon and app-icon routes on the host webserver.
 *
 * The optional `webServer` injection keeps a profile without the service loading
 * with this capability absent, mirroring `dsh-project-context`. Bytes are read
 * before registration so activation either publishes all seven routes or none.
 * @param ctx - Host context carrying the `webServer` service.
 */
export function installBrandRoutes (ctx: Context): void {
  const routes = BRAND_ASSETS.map((asset) => ({ asset, body: readBrandAsset(asset) }))
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const disposers: Array<() => void> = []
      try {
        for (const { asset, body } of routes) {
          disposers.push(webCtx.webServer.register({
            kind: 'exact',
            path: asset.path,
            handler: brandHandler(asset, body),
          }))
        }
      } catch (error: unknown) {
        // `register` throws on a duplicate (kind, path), which a plugin reload or
        // an HMR re-mount can produce. Soft-fail all-or-nothing: remove the
        // partial set, keep the shell's bytes, and leave the rest of the plugin
        // (projection, badges, title) active.
        for (const dispose of disposers.reverse()) dispose()
        webCtx.logger.error(`${PLUGIN_ID}: registering the install-identity routes failed; the shell's served bytes remain in place: ${String(error)}`)
        return () => {}
      }
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, `${PLUGIN_ID}.installIdentityRoutes()`)
  })
}
