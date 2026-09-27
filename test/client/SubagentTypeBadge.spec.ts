/**
 * Behaviour of the subagent-type badge for the Session currently shown.
 *
 * The badge has exactly one job: walk one hop upwards — shown child → parent →
 * the parent's `subagentType` map → this child's entry — and print the raw tool
 * name, or nothing at all. Each case here is one shape the client store can hand
 * it: no parent link (the main Session), a parent resolved from the child's own
 * subagent address, a parent resolved only from the list row, a value found
 * through `projectionsBySession`, a value found through the row's retained
 * `projectionValues`, and a parent row that is absent entirely.
 *
 * The component renders through React rather than being called as a function, so
 * the rendered output is what a reader actually sees.
 */
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { enSubagentType } from '../../src/client/locales.ts'
import { SubagentTypeBadge, type SubagentTypeBadgeProps } from '../../src/client/SubagentTypeBadge.tsx'

/**
 * A stand-in for the bound translate seat, resolving against the badge's REAL
 * English dictionary so a key no dictionary defines surfaces as the key itself.
 * @param key - dictionary key.
 * @param params - interpolation values.
 * @returns the resolved text.
 */
const translate = (key: string, params?: Record<string, string>): string =>
  (enSubagentType[key as keyof typeof enSubagentType] ?? key)
    .replace(/\{(\w+)\}/g, (_match, name: string) => params?.[name] ?? '')

/** Everything one case supplies to build a store state. */
interface StoreInput {
  /** The shown Session id. */
  readonly sessionId: string
  /** The parent id on the shown Session's own list row. */
  readonly rowParentId?: string
  /** `useSession(s => s.subagent?.address)`. */
  readonly address?: { childSessionId: string; parentSessionId: string }
  /** `state.projectionsBySession[parent].values`. */
  readonly parentValues?: Record<string, unknown>
  /** `state.byId[parent].projectionValues`. */
  readonly parentRowValues?: Record<string, unknown>
}

/** The props the shell composes, plus the selector the badge handed the hook. */
interface Harness {
  readonly props: SubagentTypeBadgeProps
  readonly state: SessionListState
  selector: ((value: SessionListState) => unknown) | undefined
}

/**
 * Build the props the shell composes for this seat, capturing the selector the
 * badge passes to `useSessions` so its return shape can be asserted directly.
 * @param input - the store shape under test.
 * @returns the composed props plus the state they read.
 */
function harnessFor(input: StoreInput): Harness {
  const parentRow = input.parentRowValues === undefined
    ? {}
    : { 'parent-1': { id: 'parent-1', projectionValues: input.parentRowValues } }
  const state = {
    ids: [],
    byId: { [input.sessionId]: { id: input.sessionId, parentId: input.rowParentId }, ...parentRow },
    phase: 'ready',
    projectionsBySession: input.parentValues === undefined
      ? {}
      : { 'parent-1': { values: input.parentValues, state: 'ready', error: null } },
  } as unknown as SessionListState

  const harness = { selector: undefined } as unknown as Harness
  const useSession = ((selector: (snapshot: unknown) => unknown) =>
    selector({ subagent: { address: input.address } })) as unknown as SubagentTypeBadgeProps['useSession']
  const useSessions = ((selector: (value: SessionListState) => unknown) => {
    harness.selector = selector
    return selector(state)
  }) as unknown as SubagentTypeBadgeProps['useSessions']

  ;(harness as { props: SubagentTypeBadgeProps }).props = {
    sessionId: input.sessionId as SessionId,
    useSession,
    useSessions,
    t: translate,
  } as unknown as SubagentTypeBadgeProps
  ;(harness as { state: SessionListState }).state = state
  return harness
}

/**
 * Render the badge for one store shape.
 * @param input - the store shape under test.
 * @returns the rendered HTML.
 */
function render(input: StoreInput): string {
  return renderToStaticMarkup(SubagentTypeBadge(harnessFor(input).props))
}

describe('header subagent-type badge', () => {
  it('renders the raw delegating tool name for a child Session', () => {
    const html = render({
      sessionId: 'child-1',
      address: { childSessionId: 'child-1', parentSessionId: 'parent-1' },
      parentValues: { subagentType: { 'child-1': 'agent_analyst' } },
    })
    expect(html).toContain('agent_analyst')
  })

  it('falls back to the parent id on the list row when there is no subagent address', () => {
    const html = render({
      sessionId: 'child-1',
      rowParentId: 'parent-1',
      parentValues: { subagentType: { 'child-1': 'subagent_fork' } },
    })
    expect(html).toContain('subagent_fork')
  })

  it('falls back to the parent row retained projection values', () => {
    const html = render({
      sessionId: 'child-1',
      rowParentId: 'parent-1',
      parentRowValues: { subagentType: { 'child-1': 'agent_scout' } },
    })
    expect(html).toContain('agent_scout')
  })

  it('renders nothing for the main Session, which has no parent link', () => {
    expect(render({ sessionId: 'main-1' })).toBe('')
  })

  it('renders nothing when the parent carries no entry for this child', () => {
    const html = render({
      sessionId: 'child-1',
      rowParentId: 'parent-1',
      parentValues: { subagentType: { 'other-child': 'agent_analyst' } },
    })
    expect(html).toBe('')
  })

  it('renders nothing when the parent row is absent from the store entirely', () => {
    const html = render({
      sessionId: 'child-1',
      address: { childSessionId: 'child-1', parentSessionId: 'missing-parent' },
    })
    expect(html).toBe('')
  })

  it('renders nothing when the key is absent or not a string', () => {
    for (const values of [{}, { subagentType: null }, { subagentType: { 'child-1': 42 } }]) {
      expect(render({ sessionId: 'child-1', rowParentId: 'parent-1', parentValues: values })).toBe('')
    }
  })

  it('gives the badge an accessible name built from the tool name', () => {
    const html = render({
      sessionId: 'child-1',
      rowParentId: 'parent-1',
      parentValues: { subagentType: { 'child-1': 'agent_implementer' } },
    })
    expect(html).toContain('aria-label="Subagent type: agent_implementer"')
  })

  it('selects a primitive, so unrelated list churn cannot re-render the header', () => {
    const harness = harnessFor({
      sessionId: 'child-1',
      rowParentId: 'parent-1',
      parentValues: { subagentType: { 'child-1': 'agent_analyst' } },
    })
    // Rendering is what invokes the hook, so the selector is captured only after.
    renderToStaticMarkup(SubagentTypeBadge(harness.props))
    expect(harness.selector).toBeDefined()
    const first = harness.selector?.(harness.state)
    const second = harness.selector?.(harness.state)
    expect(typeof first).toBe('string')
    expect(first).toBe('agent_analyst')
    // A primitive compares by value, which is what keeps the hook from cascading.
    expect(second).toBe(first)
  })
})
