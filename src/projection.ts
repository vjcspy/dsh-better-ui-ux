/**
 * Host half: the parent-owned fold that correlates a delegating `tool/call` with
 * the child Session it produced.
 *
 * **Why the fold lives on the parent.** A registration's `apply` sees only its own
 * Session's events, and the delegating tool name exists in exactly one durable
 * place: the **parent's** `tool/call.name`, where `arguments` is the raw JSON
 * string the model produced. The child's own log carries no type at all — its
 * `subagent/descriptor` has `mode`, the transport `provider` and a
 * model-authored `label`, none of which names the tool.
 *
 * **How a child is anchored.** `subagent/catalog` is the only event that names a
 * child, and it is appended to the parent — but it carries **no `callId`**. So
 * every binding is inferred, in two tiers, in `event.seq` order:
 *
 * 1. **exact key** — a continuable delegation's `tool/result` reads
 *    `started subagent <childId>`, which names both the call (`message.toolCallId`)
 *    and the child, so it binds them outright. It is emitted **after** its own
 *    catalog (the catalog is committed inside the child start, before the tool
 *    returns), so it must also be able to override a provisional label binding.
 * 2. **label match** — otherwise the catalog's `label` (the model-authored
 *    delegation `description`) is matched against the parsed
 *    `arguments.description` of every unclaimed, non-errored admitted call that
 *    precedes it.
 *    This resolves only when **exactly one** candidate remains; anything
 *    ambiguous stays unresolved, because a wrong tool name is worse than no badge.
 *
 * **Why "open vs closed" is not a tier.** The background arm returns
 * `{ kind: 'background', jobId }` *before* its child starts, so its `tool/call`
 * closes before its catalog arrives, while the foreground arm closes after. A
 * rule that preferred still-open candidates would bind a background child to a
 * foreground sibling's tool name and then bind the foreground child to the
 * background call — swapping two same-label siblings instead of hiding them.
 * Both collapsed into the single label tier, which hides the pair.
 *
 * Pure by construction: state is a function of the parent's own event stream,
 * every ordering decision is expressed in `event.seq` (an array index is not
 * stable across a cold checkpoint restore), and the fold ignores the
 * fork-inherited prefix so a fork child never re-folds its parent's delegations
 * into its own value.
 *
 * @module dsh-better-ui-ux/projection
 */

import { z } from 'zod'
import type { SessionEvent, SessionHeader, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { ToolResultMessage } from '@deepseek-ai/dsh-llm'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
// Type-only: the subagent package owns the `subagent/catalog` member of
// `SessionEventMap`. Without this import the event is not in the union at all and
// the fold's catalog arm narrows to `never`.
import type {} from '@deepseek-ai/dsh-subagent'

import { ADMITTED_DELEGATION_TOOL_NAMES, AGENT_TOOL_NAME_PREFIX, SUBAGENT_TYPE_PROJECTION_KEY } from './constants.ts'
import type { SubagentTypeBySession } from './projection-types.ts'

/** Cap on catalogs retained while unresolvable, oldest dropped first. */
export const MAX_PENDING_CATALOGS = 64

/** The continuable delegation's stable result text: `started subagent <childId>`. */
const STARTED_SUBAGENT_PATTERN = /^started subagent (\S+)$/

/**
 * One admitted delegating `tool/call`.
 *
 * `description` is `null` — never `undefined` — when the raw `arguments` string
 * did not parse, was not an object, or carried no string `description`, so the
 * persisted state stays JSON-lossless under `exactOptionalPropertyTypes`.
 */
export interface RetainedCall {
  /** Sequence of the `tool/call`, the ordering coordinate. */
  readonly seq: number
  /** Call identity; the join key a `tool/result` answers with. */
  readonly callId: string
  /** Turn the call was raised in; the expiry coordinate. */
  readonly turn: number
  /** Raw delegating tool name, which is also the value the badge renders. */
  readonly name: string
  /** Parsed `arguments.description`, or `null` when it cannot be trusted. */
  readonly description: string | null
  /**
   * Whether this call's own `tool/result` reported an error.
   *
   * An errored call cannot own a catalog — the delegation never produced a
   * child — so it is excluded from the label tier. Leaving it in could make a
   * later, fully decidable delegation ambiguous, which would hide it for good.
   */
  readonly errored: boolean
}

/** One `subagent/catalog` not yet bound to an admitted call. */
export interface PendingCatalog {
  /** Sequence of the catalog, the ordering coordinate. */
  readonly seq: number
  /** The child Session this catalog names. */
  readonly childId: SessionId
  /** Trimmed delegation label; `null` when the payload carried none. */
  readonly label: string | null
  /** Lower bound of the turn this catalog may still be resolved in. */
  readonly turn: number
}

/** Fold state owned by the parent Session. */
export interface SubagentTypeState {
  /** Exact fork-inherited prefix length; events before it belong to the parent. */
  readonly inheritedEventCount: number
  /**
   * Turn of the most recent `tool/call` / `tool/result` fold. Expiry runs **only**
   * on those two kinds — a `subagent/catalog` carries no `turn`, and expiring
   * there could discard the very call its own late background catalog belongs to.
   */
  readonly turn: number
  /** Admitted calls not yet bound to a child. */
  readonly calls: readonly RetainedCall[]
  /** Catalogs not yet bound to a call. */
  readonly pending: readonly PendingCatalog[]
  /** The wire value, replaced copy-on-write so its identity is stable in between. */
  readonly resolved: SubagentTypeBySession
}

const callSchema = z.object({
  seq: z.number().int().nonnegative(),
  callId: z.string(),
  turn: z.number().int().nonnegative(),
  name: z.string(),
  description: z.string().nullable(),
  errored: z.boolean(),
}).strict()

const pendingSchema = z.object({
  seq: z.number().int().nonnegative(),
  childId: z.string() as unknown as z.ZodType<SessionId>,
  label: z.string().nullable(),
  turn: z.number().int().nonnegative(),
}).strict()

const stateSchema: z.ZodType<SubagentTypeState> = z.object({
  inheritedEventCount: z.number().int().nonnegative(),
  turn: z.number().int().nonnegative(),
  calls: z.array(callSchema),
  pending: z.array(pendingSchema),
  resolved: z.record(z.string(), z.string()) as unknown as z.ZodType<SubagentTypeBySession>,
}).strict()

const wireSchema = z.record(z.string(), z.string()) as unknown as z.ZodType<SubagentTypeBySession>

/** Whether a tool name may anchor a delegation. */
function isAdmittedDelegationTool(name: string): boolean {
  return ADMITTED_DELEGATION_TOOL_NAMES.includes(name) || name.startsWith(AGENT_TOOL_NAME_PREFIX)
}

/**
 * Read `description` out of a raw `tool/call.arguments` JSON string.
 *
 * `arguments` is the unparsed string exactly as the model produced it (the tool
 * layer falls back to the raw string on malformed JSON), so the parse is guarded
 * and a non-object result means "no description".
 * @param raw - the raw `arguments` string.
 * @returns the description, or `null` when it cannot be trusted.
 */
function parseCallDescription(raw: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const description = (parsed as { description?: unknown }).description
  return typeof description === 'string' ? description : null
}

/** Concatenate every text block of a tool result message. */
function resultText(message: ToolResultMessage): string {
  const content: unknown = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('')
}

/**
 * Extract the child Session id from a continuable delegation's result text.
 *
 * Anchored: the background arm renders `started background subagent job <jobId>`,
 * whose `jobId` is a job identity, not a Session — an unanchored search would bind
 * a background job to a child that never existed.
 * @param message - the `tool/result` message payload.
 * @returns the child Session id, or `null` when the text is not that shape.
 */
function extractStartedChildId(message: ToolResultMessage): SessionId | null {
  const match = STARTED_SUBAGENT_PATTERN.exec(resultText(message))
  return match?.[1] === undefined ? null : (match[1] as SessionId)
}

/**
 * Advance the expiry coordinate and drop admitted calls left behind by it.
 *
 * A call is admitted only by a `tool/call` fold at `turn >= state.turn`, so
 * `call.turn >= event.turn` is exactly "not from an earlier turn". Everything at
 * the current turn is inert whether its `tool/result` has been folded or not,
 * which keeps the check independent of result-arrival order.
 */
function expireOlderTurns(state: SubagentTypeState, turn: number): SubagentTypeState {
  const now = Math.max(state.turn, turn)
  const calls = state.calls.filter(call => call.turn >= now)
  const pending = state.pending.filter(catalog => catalog.turn >= now)
  if (now === state.turn && calls.length === state.calls.length && pending.length === state.pending.length) {
    return state
  }
  return {
    ...state,
    turn: now,
    calls: calls.length === state.calls.length ? state.calls : calls,
    pending: pending.length === state.pending.length ? state.pending : pending,
  }
}

/** Trim a catalog label, mapping absent or blank to the `null` sentinel. */
function normalizeLabel(label: unknown): string | null {
  if (typeof label !== 'string') return null
  const trimmed = label.trim()
  return trimmed.length === 0 ? null : trimmed
}

/**
 * The admitted call a catalog can own on label evidence, or `null` when ambiguous.
 *
 * The candidate set is *unclaimed, admitted, non-errored* calls preceding the
 * catalog whose description equals its label. An errored call is excluded because
 * a failed delegation left no child to anchor, so it can only ever turn a
 * decidable catalog into an ambiguous one.
 */
function soleClaimant(catalog: PendingCatalog, calls: readonly RetainedCall[]): RetainedCall | null {
  const candidates = calls.filter(call =>
    call.errored === false
    && call.seq < catalog.seq
    && call.description !== null
    && call.description === catalog.label)
  return candidates.length === 1 ? candidates[0] ?? null : null
}

/**
 * One resolution pass over the current candidates.
 *
 * Allocation-free when nothing changes: the returned triple reuses the argument
 * references unless a binding was actually added, so `Object.is` on the wire value
 * stays stable — and therefore the publication gate stays quiet — across
 * internal-only folds.
 * @param calls - admitted, not-yet-bound calls.
 * @param pending - catalogs, not-yet-bound.
 * @param resolved - the binding map carried in from the previous state.
 * @returns the surviving candidates and the (possibly new) binding map.
 */
function resolve(
  calls: readonly RetainedCall[],
  pending: readonly PendingCatalog[],
  resolved: SubagentTypeBySession,
): { calls: readonly RetainedCall[]; pending: readonly PendingCatalog[]; resolved: SubagentTypeBySession } {
  // Earliest catalog claims first, so the single-candidate test never depends on
  // array position. One slot per child: a second catalog naming the same child
  // overwrites the reference, which is the correct last-wins behaviour because
  // only one binding can survive for a child anyway, and the superseded catalog
  // is dropped rather than left to make a later pass ambiguous.
  //
  // Superseding requires replacing the child's earlier *pending* entry too, not
  // only its claim: a stale unresolved entry would keep the candidate count above
  // one on every later pass and permanently hide a fully decidable delegation.
  const claims = new Map<string, RetainedCall>()
  const pendingByChild = new Map<string, PendingCatalog>()
  for (const catalog of pending) {
    const previous = pendingByChild.get(catalog.childId)
    if (previous === undefined || catalog.seq > previous.seq) pendingByChild.set(catalog.childId, catalog)
  }
  for (const catalog of [...pendingByChild.values()].sort((left, right) => left.seq - right.seq)) {
    if (Object.hasOwn(resolved, catalog.childId)) continue
    const claimant = soleClaimant(catalog, calls)
    if (claimant !== null) claims.set(catalog.childId, claimant)
  }

  const bound = new Set<RetainedCall>()
  let nextResolved = resolved
  for (const [childId, call] of claims) {
    if (bound.has(call)) continue
    bound.add(call)
    if (resolved[childId as SessionId] === call.name) continue
    // Copy-on-write: a pass that adds no binding returns the previous reference.
    if (nextResolved === resolved) nextResolved = { ...resolved } as SubagentTypeBySession
    ;(nextResolved as Record<string, string>)[childId] = call.name
  }

  const kept: PendingCatalog[] = []
  for (const catalog of pending) {
    if (claims.has(catalog.childId)) continue
    if (Object.hasOwn(resolved, catalog.childId)) continue
    kept.push(catalog)
  }

  const droppedPending = kept.length !== pending.length
  const droppedCalls = bound.size > 0
  if (!droppedPending && !droppedCalls && nextResolved === resolved) {
    return { calls, pending, resolved }
  }
  return {
    calls: droppedCalls ? calls.filter(call => !bound.has(call)) : calls,
    pending: droppedPending ? kept : pending,
    resolved: nextResolved,
  }
}

/**
 * Bind the exact key when a continuable result names a child and answers an
 * admitted call.
 *
 * The exact key outranks a provisional label binding, which is why it is applied
 * on the result fold and not only when the catalog arrives.
 */
function bindExactKey(state: SubagentTypeState, callId: string, childId: SessionId): SubagentTypeState {
  const call = state.calls.find(candidate => candidate.callId === callId)
  if (call === undefined) return state
  const calls = state.calls.filter(candidate => candidate !== call)
  if (state.resolved[childId] === call.name) return { ...state, calls }
  const resolved = { ...state.resolved, [childId]: call.name } as SubagentTypeBySession
  return { ...state, calls, resolved }
}

/**
 * Stamp the error flag of a result onto the admitted call it answers.
 *
 * Only the flag is carried over: the result's text and identity are consumed in
 * place by the exact-key tier, and the label tier needs nothing else from it.
 * @param state - state after the turn coordinate advanced.
 * @param result - the folded `tool/result` message.
 * @returns the state, with the answered call disqualified when it errored.
 */
function markErrored(state: SubagentTypeState, result: ToolResultMessage): SubagentTypeState {
  if (result.isError !== true) return state
  const index = state.calls.findIndex(call => call.callId === result.toolCallId)
  const call = index < 0 ? undefined : state.calls[index]
  if (call === undefined || call.errored) return state
  const calls = state.calls.slice()
  calls[index] = { ...call, errored: true }
  return { ...state, calls }
}

/** Retain only the most recent unresolvable catalogs, oldest dropped first. */
function capPending(pending: readonly PendingCatalog[]): readonly PendingCatalog[] {
  return pending.length <= MAX_PENDING_CATALOGS ? pending : pending.slice(pending.length - MAX_PENDING_CATALOGS)
}

/**
 * The parent-owned delegation-anchor projection.
 *
 * `stateVersion: 0` — nothing has shipped with this key yet, so no persisted row
 * can be one version behind. Bumping it later re-orphans every cold row until the
 * Session is live again, which is the measured cost recorded in the plan.
 */
export const subagentTypeProjectionDefinition = {
  key: SUBAGENT_TYPE_PROJECTION_KEY,
  stateSchema,
  init: (_header: SessionHeader, inheritedEventCount: SessionLogOffset): SubagentTypeState => ({
    inheritedEventCount,
    turn: 0,
    calls: [],
    pending: [],
    resolved: {},
  }),
  apply: (state, event: SessionEvent): SubagentTypeState => {
    // A fork child's log begins with the parent's completed turns; folding that
    // prefix would re-derive the parent's own delegations inside the child.
    if (event.seq < state.inheritedEventCount) return state

    if (event.type === 'tool/call') {
      const { turn, callId, name, arguments: rawArguments } = event.data
      const advanced = expireOlderTurns(state, turn)
      if (!isAdmittedDelegationTool(name)) return advanced
      const call: RetainedCall = {
        seq: event.seq,
        callId,
        turn,
        name,
        description: parseCallDescription(rawArguments),
        errored: false,
      }
      const next = resolve([...advanced.calls, call], advanced.pending, advanced.resolved)
      return { ...advanced, calls: next.calls, pending: capPending(next.pending), resolved: next.resolved }
    }

    if (event.type === 'tool/result') {
      const { turn, message } = event.data
      const advanced = expireOlderTurns(state, turn)
      const result = message as ToolResultMessage
      const marked = markErrored(advanced, result)
      const childId = result.isError === true ? null : extractStartedChildId(result)
      const bound = childId === null ? marked : bindExactKey(marked, result.toolCallId, childId)
      if (bound.pending.length === 0) return bound
      const next = resolve(bound.calls, bound.pending, bound.resolved)
      if (next.pending === bound.pending && next.calls === bound.calls && next.resolved === bound.resolved) return bound
      return { ...bound, calls: next.calls, pending: capPending(next.pending), resolved: next.resolved }
    }

    if (event.type !== 'subagent/catalog') return state

    const data = event.data as { childId?: unknown; label?: unknown }
    if (typeof data.childId !== 'string' || data.childId.length === 0) return state
    const childId = data.childId as SessionId
    if (Object.hasOwn(state.resolved, childId)) return state
    const catalog: PendingCatalog = {
      seq: event.seq,
      childId,
      label: normalizeLabel(data.label),
      turn: state.turn,
    }
    const next = resolve(state.calls, [...state.pending, catalog], state.resolved)
    if (next.pending === state.pending && next.calls === state.calls && next.resolved === state.resolved) return state
    return { ...state, calls: next.calls, pending: capPending(next.pending), resolved: next.resolved }
  },
  wire: {
    viewSchema: wireSchema,
    // The copy-on-write binding map *is* the wire payload, so the reference is
    // stable by construction and inherently per-Session (state lives per Session).
    view: state => state.resolved,
  },
  stateVersion: 0,
} satisfies ProjectionDefinition<'subagentType', SubagentTypeState>
