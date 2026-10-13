/**
 * The session header's subagent-type badge.
 *
 * Read-only by construction, and deliberately narrow: the delegating tool name is
 * derived on the **parent** Session (see `../projection.ts`), because a
 * projection's fold only ever sees its own Session's events and the child's log
 * carries no type at all. So this component's whole job is to walk one hop
 * upwards — shown child → its parent → the parent's `subagentType` map → the
 * entry for the shown child — and print the raw tool name.
 *
 * The main Session has no parent link, so it renders nothing; a child whose
 * delegation could not be resolved is absent from the map, so it renders nothing
 * too. "No wrong label" is the design rule, which is why an ambiguous correlation
 * is *hidden* rather than guessed.
 *
 * The projection is read through `useSessions` rather than the session kit's
 * `useProjection`, because the value lives on the **parent's** row and
 * `useProjection` addresses only the Session being viewed. The selector returns a
 * primitive string, so unrelated list churn (session titles, running flags,
 * sibling rows) cannot re-render the header.
 *
 * The tool name renders inside a text element of its own, so a width cap ellipsizes
 * it instead of hard-clipping mid-token (`styles.ts`), and the parent hop itself is
 * `resolveParentId` from `parentSession.ts` — the shared helper the model badge also
 * uses, so the two badges can never classify one Session differently.
 */

import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pulls the session standard seats (`sessionId`) into this program.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the ui-conversation SlotMap merge (the header actions seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: declares the `subagentType` key on the client projection table.
import type {} from '../projection-types.ts'

import { resolveParentId } from './parentSession.ts'
import { SUBAGENT_TYPE_BADGE_CLASS, SUBAGENT_TYPE_BADGE_TEXT_CLASS } from './styles.ts'

/** Registration-side business face: this badge needs no injected value. */
export interface SubagentTypeBadgeInjected {
  /** Marker: the badge reads only the standard session seats. */
  readonly none?: never
}

/** Full component props. */
export type SubagentTypeBadgeProps =
  PropsRuntime<'conversation.session.header.actions'>
  & SessionStandardProps
  & PropsLocale<'subagentTypeBadge'>

/** Read the parent's value for the shown child out of one projection-values map. */
function readFrom(values: unknown, childId: SessionId): string | undefined {
  if (typeof values !== 'object' || values === null) return undefined
  const map = (values as Record<string, unknown>).subagentType
  if (typeof map !== 'object' || map === null) return undefined
  const value = (map as Record<string, unknown>)[childId]
  return typeof value === 'string' ? value : undefined
}

/**
 * Render the raw delegating tool name of the Session currently shown.
 * @param props - composed slot props, including the session list selector seat.
 * @returns the badge, or nothing while the delegation is unresolved.
 */
export function SubagentTypeBadge({ useSession, useSessions, sessionId, t }: SubagentTypeBadgeProps): ReactNode {
  const address = useSession(session => session.subagent?.address)
  const toolName = useSessions((state) => {
    const parentId = resolveParentId(address, state.byId[sessionId]?.parentId)
    if (parentId === undefined) return undefined
    return readFrom(state.projectionsBySession[parentId]?.values, sessionId)
      ?? readFrom(state.byId[parentId]?.projectionValues, sessionId)
  })
  if (toolName === undefined) return null
  return (
    <span className={SUBAGENT_TYPE_BADGE_CLASS} title={toolName} aria-label={t('aria.type', { type: toolName })}>
      <span className={SUBAGENT_TYPE_BADGE_TEXT_CLASS}>{toolName}</span>
    </span>
  )
}
