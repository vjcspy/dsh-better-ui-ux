/**
 * Deployment brand title over the shell's local-build label.
 *
 * A local source build renders the shell's own fallback brand copy: `SidebarRoot`
 * writes `t('brand.localBuild')` into the sidebar's title line and `AppFrame`
 * derives the browser tab title from the same key, both resolving it through the
 * shared `common` locale namespace. This module replaces that one string for the
 * whole page without touching core: the locale face's `bind` is wrapped, so every
 * translate function the slot renderer mints resolves `brand.localBuild` to the
 * deployment title and delegates every other key unchanged.
 *
 * The revision bump is load-bearing. `SlotRenderer` caches one translate function
 * per (face, namespace, revision) and re-derives it only when the locale
 * snapshot's revision advances, so wrapping `bind` on an already-rendered page
 * changes nothing until a publication happens. Registering an empty dictionary
 * under this plugin's own namespace publishes exactly that bump, and disposing it
 * publishes the restore bump after the original `bind` is back in place — which is
 * why the disposer restores `bind` BEFORE it disposes the registration.
 *
 * Nothing here writes `document.title`. `AppFrame`/`DocumentTitle` own that
 * projection, including the `<session title> - <product title>` form and its
 * restore-on-unmount, so a second writer would have to re-implement the separator
 * and could clobber a shown Session name.
 *
 * @module dsh-better-ui-ux/client/brandTitle
 */
import { BRAND_LOCALE_NAMESPACE, BRAND_LOCAL_BUILD_KEY, BRAND_TITLE } from '../constants.ts'

/** Translate function returned by a bound locale namespace. */
export type BrandTranslate = (key: string, params?: Record<string, unknown>) => string

/**
 * The locale-face members this override needs.
 *
 * Structural rather than the service class, so this module pulls no runtime
 * dependency on `dsh-client-locale` and a face without `bind` (the bare registry a
 * unit harness stubs) skips the override instead of throwing.
 */
export interface BrandLocaleFace {
  /** Bind one dictionary namespace to a translate function. */
  bind(ns: string): BrandTranslate
  /** Register a dictionary; the returned disposer removes it. */
  register(ns: string, locale: string, dict: Record<string, string>): () => void
}

/**
 * Install the brand-title override on the live locale face.
 * @param locale - the client locale service, or nothing in a composition without one.
 * @returns idempotent disposer restoring the original `bind` and publishing the
 *   revision that makes mounted outlets re-derive `t` from it.
 */
export function installBrandTitleOverride(locale: BrandLocaleFace | undefined): () => void {
  if (locale === undefined || typeof locale.bind !== 'function') return () => {}
  const original = locale.bind
  locale.bind = (ns: string): BrandTranslate => {
    const bound = original.call(locale, ns)
    return (key, params) => (key === BRAND_LOCAL_BUILD_KEY ? BRAND_TITLE : bound(key, params))
  }
  const disposeRevision = locale.register(BRAND_LOCALE_NAMESPACE, 'en', {})
  return () => {
    locale.bind = original
    disposeRevision()
  }
}
