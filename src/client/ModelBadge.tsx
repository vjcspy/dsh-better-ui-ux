/**
 * The session header's effective-model badge.
 *
 * Read-only by construction. A Session's model is switched in the composer, and
 * the header's job is to report what is actually running, which is the one fact
 * the composer's own control cannot show: it renders the SELECTION for the next
 * request, so immediately after a switch the two surfaces disagree on purpose.
 *
 * The badge reads the Session's `modelSelection` projection through the standard
 * session seat, so it needs no store, no request, and no service: every listed
 * Session — the main one, a continuable child, a one-shot child, an Agent Team
 * teammate — is seeded with its projection values and kept live by the control
 * frames.
 *
 * A thin session that never sent a request renders nothing, because a route it
 * never used is not a fact worth showing.
 *
 * Side channel: every render reports its effective provider to the mobile
 * subscription-visibility gate (`reportEffectiveProvider`), so the Codex usage
 * pill stays hidden on mobile unless this Session runs a `codex` route. The call
 * is a no-op without a DOM (SSR, unit tests) and never changes what the badge
 * itself renders.
 */

import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the session standard seats (`sessionId`, `useProjection`) and
// the projection key table into this program.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the ui-conversation SlotMap merge (the header actions seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

import { reportEffectiveProvider } from './codexUsageVisibility.ts'
import { MODEL_BADGE_CLASS, MODEL_BADGE_MARKER_CLASS } from './styles.ts'

/** Registration-side business face: this badge needs no injected value. */
export interface ModelBadgeInjected {
  /** Marker: the badge reads only the standard session seats. */
  readonly none?: never
}

/** Full component props. */
export type ModelBadgeProps =
  PropsRuntime<'conversation.session.header.actions'>
  & SessionStandardProps
  & PropsLocale<'modelBadge'>

/**
 * Render the model route this Session is running.
 * @param props - composed slot props, including the session projection seat.
 * @returns the badge, or nothing while the Session records no route.
 */
export function ModelBadge({ useProjection, t }: ModelBadgeProps): ReactNode {
  const projection = useProjection('modelSelection')
  if (projection === undefined) {
    reportEffectiveProvider(undefined)
    return null
  }

  // `next` is the host's `pending ?? lastUsed`, so a non-null `lastUsed` is the
  // route already consumed by a request: that is what "running" means here, and
  // it wins over a later selection that no request has used yet.
  const running = projection.lastUsed
  const model = running ?? projection.next
  if (model === null) {
    reportEffectiveProvider(null)
    return null
  }

  reportEffectiveProvider(model.provider)
  const route = `${model.provider}/${model.model}`
  const next = running === null
  return (
    <span
      className={MODEL_BADGE_CLASS}
      title={route}
      aria-label={next ? t('aria.next', { model: route }) : t('aria.current', { model: route })}
    >
      {route}
      {next ? <span className={MODEL_BADGE_MARKER_CLASS}>{t('marker.next')}</span> : null}
    </span>
  )
}
