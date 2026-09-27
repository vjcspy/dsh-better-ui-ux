/**
 * Mobile visibility gate for the subscription usage pill.
 *
 * The `dsh-plugin-subscriptions` badge renders its collapsed pill into the
 * host stats row (`[data-composer-stats]`) as a `button[aria-haspopup="dialog"]`
 * with no stable class name, so this plugin cannot key a pure-CSS rule on the
 * provider. Instead it owns a tiny piece of global UI state: a `data-*`
 * attribute on `<html>` driven by the same `modelSelection` projection the
 * header badge already reads, plus a coarse-pointer / narrow-viewport check so
 * the desktop layout never changes.
 *
 * Rule: on mobile viewports the Codex usage pill is hidden by default and shown
 * only while the shown Session runs a `codex` provider route. Desktop removes
 * the attribute entirely, so no rule matches there.
 */

 /** Provider id behind GPT/Codex subscription routes. */
export const CODEX_PROVIDER_ID = 'codex'

/** Global attribute on `<html>` carrying the gate state. */
export const CODEX_USAGE_ATTR = 'data-dsh-codex-usage'

/** Gate states: hidden on mobile unless the route is Codex. */
export type CodexUsageState = 'hidden' | 'shown'

/** Upper width bound for the mobile gate, mirroring the remote-web compact layer. */
export const MOBILE_MAX_WIDTH = 1100

/**
 * Whether the viewport counts as mobile for this gate.
 * @param win - window to measure.
 * @returns true for coarse-pointer narrow viewports.
 */
export function isMobileViewport(win: Window): boolean {
  try {
    const coarse = typeof win.matchMedia === 'function'
      ? win.matchMedia('(pointer: coarse)').matches
      : false
    return coarse && win.innerWidth < MOBILE_MAX_WIDTH
  } catch {
    return false
  }
}

/**
 * Decide the gate state from viewport and route.
 * @param isMobile - mobile viewport flag.
 * @param provider - effective provider id, or null/undefined when unknown.
 * @returns hidden on mobile unless the provider is Codex; shown otherwise on mobile.
 */
export function resolveCodexUsageState(
  isMobile: boolean,
  provider: string | null | undefined,
): CodexUsageState {
  if (!isMobile) return 'shown'
  return provider === CODEX_PROVIDER_ID ? 'shown' : 'hidden'
}

/**
 * Apply the gate state to the document.
 * Desktop removes the attribute so no selector matches there.
 * @param doc - document to mark.
 * @param state - gate state, or null to clear (desktop).
 */
export function applyCodexUsageState(doc: Document, state: CodexUsageState | null): void {
  try {
    const element = doc.documentElement
    if (!element) return
    if (state === null) {
      element.removeAttribute(CODEX_USAGE_ATTR)
      return
    }
    element.setAttribute(CODEX_USAGE_ATTR, state)
  } catch {
    // A stub document in tests may lack setAttribute; never break the badge.
  }
}

/** Last effective provider reported by a badge render; viewport listeners read it. */
let lastProvider: string | null | undefined

/**
 * Remember the effective provider for viewport-driven re-syncs.
 * @param provider - provider id, or null/undefined when the Session records no route.
 */
export function noteEffectiveProvider(provider: string | null | undefined): void {
  lastProvider = provider
}

/**
 * Read the last reported provider.
 * @returns the provider id, or undefined before any badge render.
 */
export function readLastProvider(): string | null | undefined {
  return lastProvider
}

/**
 * Recompute and apply the gate for one document/window pair.
 * @param doc - document to mark.
 * @param win - window to measure.
 * @param provider - effective provider, defaults to the last reported one.
 */
export function syncCodexUsageVisibility(
  doc: Document,
  win: Window,
  provider: string | null | undefined = lastProvider,
): void {
  const mobile = isMobileViewport(win)
  if (!mobile) {
    applyCodexUsageState(doc, null)
    return
  }
  applyCodexUsageState(doc, resolveCodexUsageState(true, provider))
}

/**
 * Report one Session render and sync immediately when a DOM is present.
 * Called during the badge render (no React hook needed, so the client bundle
 * gains no new baseline import); safe under SSR/tests where document is absent.
 * @param provider - effective provider id, or null/undefined for no route.
 */
export function reportEffectiveProvider(provider: string | null | undefined): void {
  noteEffectiveProvider(provider)
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  try {
    syncCodexUsageVisibility(document, window, provider)
  } catch {
    // Visibility is best-effort; the badge text itself must always render.
  }
}

/**
 * Keep the gate live across resizes/orientation changes.
 * @param doc - document to mark.
 * @param win - window to observe.
 * @returns cleanup removing every listener.
 */
export function installCodexUsageViewportSync(doc: Document, win: Window): () => void {
  const cleanups: Array<() => void> = []
  try {
    // Paint the current state once so a cold load on mobile hides immediately.
    syncCodexUsageVisibility(doc, win)
  } catch {
    return () => {}
  }
  const onChange = (): void => {
    try {
      syncCodexUsageVisibility(doc, win)
    } catch {
      // Ignore; next change retries.
    }
  }
  try {
    win.addEventListener('resize', onChange)
    cleanups.push(() => win.removeEventListener('resize', onChange))
  } catch {
    // A stub window without events still keeps the one-shot paint above.
  }
  try {
    const queries = ['(pointer: coarse)', '(orientation: portrait)']
    for (const query of queries) {
      const list = win.matchMedia(query)
      const add = (list as MediaQueryList & { addEventListener?: Function }).addEventListener
      const addLegacy = (list as MediaQueryList & { addListener?: Function }).addListener
      if (typeof add === 'function') {
        ;(list as MediaQueryList).addEventListener('change', onChange)
        cleanups.push(() => (list as MediaQueryList).removeEventListener('change', onChange))
      } else if (typeof addLegacy === 'function') {
        ;(list as unknown as { addListener: (fn: () => void) => void }).addListener(onChange)
        cleanups.push(() => (list as unknown as { removeListener: (fn: () => void) => void }).removeListener(onChange))
      }
    }
  } catch {
    // Media queries unavailable; resize listener alone is enough.
  }
  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup()
      } catch {
        // Ignore cleanup failures.
      }
    }
  }
}
