/**
 * The projection type table entries this plugin contributes.
 *
 * Both maps are empty merge-extensible interfaces declared by
 * `@deepseek-ai/dsh-session-projection`, so a key becomes addressable on the
 * host fold side and on the client hook side only by declaration-merging here.
 * The two merges are deliberately in one module: a program that names either
 * face loads both, which is what keeps the host unit and the client reader from
 * drifting apart.
 *
 * The key is client-visible (`SessionProjectionMap`), so the registry requires a
 * `wire` block on the definition — the type alone does not enforce that, which
 * is why the host half asserts the field at runtime.
 *
 * @module dsh-better-ui-ux/projection-types
 */

import type { SessionId } from '@deepseek-ai/dsh-session'

/**
 * The delegating tool name of every child Session this Session spawned.
 *
 * Keyed by **child** Session id, valued by the raw delegating tool name
 * (`agent_analyst`, `subagent`, `subagent_fork`, …). A child with no resolvable
 * delegation is simply absent, and the badge renders nothing for it.
 */
export type SubagentTypeBySession = Readonly<Record<SessionId, string>>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Child Session id → the raw tool name that delegated to it. */
    subagentType: SubagentTypeBySession
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /**
     * Parent-owned fold state for the delegation anchors.
     *
     * Declared structurally here rather than imported from `./projection.ts` so
     * the client program (which must not pull the zod fold in) merges the same
     * key without dragging the host unit along. `projection.ts` asserts the
     * agreement of the two declarations through its `ProjectionDefinition`
     * `satisfies` clause.
     */
    subagentType: {
      /** Exact fork-inherited prefix length; events before it belong to the parent. */
      readonly inheritedEventCount: number
      /** Turn of the most recent `tool/call` / `tool/result` fold. */
      readonly turn: number
      /** Admitted delegating calls not yet bound to a child. */
      readonly calls: readonly {
        readonly seq: number
        readonly callId: string
        readonly turn: number
        readonly name: string
        readonly description: string | null
        /** Whether this call's own `tool/result` reported an error. */
        readonly errored: boolean
      }[]
      /** Catalogs not yet bound to a call. */
      readonly pending: readonly {
        readonly seq: number
        readonly childId: SessionId
        readonly label: string | null
        readonly turn: number
      }[]
      /** Child Session id → the raw tool name that delegated to it. */
      readonly resolved: SubagentTypeBySession
    }
  }
}
