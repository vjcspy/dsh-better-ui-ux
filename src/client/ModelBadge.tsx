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
 * The route renders as an inner text element with the provider and the model as
 * two separate inline elements, so a width cap ellipsizes the model id instead of
 * hard-clipping the route (`styles.ts` carries the rules and the rationale).
 * `title` and `aria-label` keep the full `provider/model` string in every tier.
 *
 * The badge also reports which Session KIND it is looking at: `data-dsh-child` is
 * set on our own element only when the shown Session is a child, which is the whole
 * signal the phone tier uses to keep a compact model-only badge. That case needs it,
 * because an addressed child's composer renders no model control at all
 * (`ui-model-selection`: `available = sessions.subagentAddress(sessionId) ===
 * undefined`, and `ModelSelect` returns null without it), so this badge is the only
 * place the child's route is visible. The parent link comes from the shared
 * `resolveParentId` helper — the same one the subagent-type badge uses — so the two
 * badges can never disagree about a Session's kind. Both seat reads behind the
 * marker return a primitive, a Session id and a boolean, so churn in either store
 * cannot re-render the header for a value that did not change.
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
import { resolveParentId } from './parentSession.ts'
import { MODEL_BADGE_CLASS, MODEL_BADGE_MARKER_CLASS, MODEL_BADGE_PROVIDER_CLASS, MODEL_BADGE_TEXT_CLASS } from './styles.ts'

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
export function ModelBadge({ useSession, useSessions, sessionId, useProjection, t }: ModelBadgeProps): ReactNode {
  // Both selectors return a primitive, so a snapshot or list update that did not
  // change this Session's kind cannot re-render the header.
  const addressParentId = useSession(session => session.subagent?.address?.parentSessionId)
  const child = useSessions(
    state => resolveParentId({ parentSessionId: addressParentId }, state.byId[sessionId]?.parentId) !== undefined,
  )

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
      data-dsh-child={child ? '' : undefined}
      title={route}
      aria-label={next ? t('aria.next', { model: route }) : t('aria.current', { model: route })}
    >
      <span className={MODEL_BADGE_TEXT_CLASS}>
        <span className={MODEL_BADGE_PROVIDER_CLASS}>{model.provider}/</span>
        {model.model}
      </span>
      {next ? <span className={MODEL_BADGE_MARKER_CLASS}>{t('marker.next')}</span> : null}
    </span>
  )
}
