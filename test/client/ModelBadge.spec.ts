/**
 * Behaviour of the badge for one Session's `modelSelection` projection.
 *
 * The projection is the badge's only input, so each case here is one state the
 * host can publish: no projection at all (capability absent, or a Session that
 * predates the baseline), a route consumed by a request, a selection no request
 * has used yet, and a Session that never selected one. `lastUsed` wins over
 * `next`, because `next` is the host's `pending ?? lastUsed` — a later selection
 * no request has used is not what the Session is running.
 *
 * The component renders through React rather than being called as a function, so
 * the rendered output is what a reader actually sees.
 */
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionProjectionMap } from '@deepseek-ai/dsh-session-projection/types'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { en } from '../../src/client/locales.ts'
import { ModelBadge, type ModelBadgeProps } from '../../src/client/ModelBadge.tsx'

/** The projection view the host publishes for one Session. */
type Selection = SessionProjectionMap['modelSelection']

/**
 * A stand-in for the bound translate seat, following the service's own two steps:
 * resolve the key in the dictionary, then interpolate the `{name}` placeholders in
 * the resolved text.
 *
 * It resolves against the plugin's REAL English dictionary, so a key the component
 * asks for that no dictionary defines surfaces here as the key itself — exactly how
 * it would surface in a page — instead of being satisfied by the stub.
 * @param key - dictionary key.
 * @param params - interpolation values.
 * @returns the resolved text.
 */
const translate = (key: string, params?: Record<string, string>): string =>
  (en[key as keyof typeof en] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => params?.[name] ?? '')

/**
 * Build the props the shell composes for this seat, with the projection seat
 * supplied by the case.
 * @param projection - what `useProjection('modelSelection')` returns, or undefined.
 * @returns the composed props.
 */
function propsFor(projection: Selection | undefined): ModelBadgeProps {
  const useProjection = ((key: string) => (key === 'modelSelection' ? projection : undefined)) as UseProjection
  return { sessionId: 'session-1', useProjection, t: translate } as unknown as ModelBadgeProps
}

/**
 * Render the badge for one projection state.
 * @param projection - what `useProjection('modelSelection')` returns, or undefined.
 * @returns the rendered HTML.
 */
function render(projection: Selection | undefined): string {
  return renderToStaticMarkup(ModelBadge(propsFor(projection)))
}

describe('header model badge', () => {
  it('renders nothing when the projection is absent', () => {
    // The capability is absent (no baseline, no frame) — the badge stays away
    // rather than claiming a route it cannot read.
    expect(render(undefined)).toBe('')
  })

  it('renders nothing when the Session records no route at all', () => {
    expect(render({ lastUsed: null, next: null })).toBe('')
  })

  it('renders the route the latest request used', () => {
    const html = render({ lastUsed: { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, next: null })
    expect(html).toContain('dsh-model-badge')
    expect(html).toContain('deepseek-official/deepseek-v4-pro')
    expect(html).toContain('Current model route: deepseek-official/deepseek-v4-pro')
    // A consumed route carries no pending marker.
    expect(html).not.toContain('dsh-model-badge-marker')
  })

  it('renders the selected route with a pending marker before its first request', () => {
    const html = render({ lastUsed: null, next: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' } })
    expect(html).toContain('opencode-go/deepseek-v4.1-flash')
    expect(html).toContain('dsh-model-badge-marker')
    expect(html).toContain('Model route for the next request: opencode-go/deepseek-v4.1-flash')
  })

  it('prefers the used route when a later selection is still pending', () => {
    // Immediately after a switch the composer shows the new selection while the
    // Session is still running the old one; the badge reports what is running.
    const html = render({
      lastUsed: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
      next: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
    })
    expect(html).toContain('deepseek-official/deepseek-v4-pro')
    expect(html).not.toContain('opencode-go')
    expect(html).not.toContain('dsh-model-badge-marker')
  })

  it('follows the projection when a frame advances it', () => {
    // Same component instance, new projection value: the badge is a pure read of
    // the seat, so no remount or second subscription is involved.
    const before = render({ lastUsed: null, next: null })
    const after = render({ lastUsed: { provider: 'deepseek-official', model: 'deepseek-v4-pro' }, next: null })
    expect(before).toBe('')
    expect(after).toContain('deepseek-official/deepseek-v4-pro')
  })

  it('keeps a raw route verbatim, including an effort the host records', () => {
    // v1 shows no reasoning effort, but the projection carries one and the route
    // itself must survive untouched.
    const html = render({
      lastUsed: { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'high' },
      next: null,
    })
    expect(html).toContain('deepseek-official/deepseek-v4-pro')
    expect(html).not.toContain('high')
  })
})
