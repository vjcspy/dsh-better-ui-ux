/**
 * Parent resolution shared by the two header badges.
 *
 * Both badges ask the same question about the Session currently shown — "is it a
 * child, and which Session delegated to it?" — and they must answer it the same
 * way: the model badge uses the answer to decide whether it survives a phone
 * title row (see `styles.ts`), and the subagent-type badge uses it to find the
 * delegating tool name on the parent's row. Two copies of the rule would be two
 * chances to classify one Session differently.
 *
 * The Session's own subagent address is tried first — it is the child's
 * authoritative record of the pair it belongs to — and the list row's `parentId`
 * is the fallback, because the address is only present for a child that still
 * knows its parent link.
 *
 * The two callers reach the address differently, which is why `parentSessionId`
 * accepts an explicit `undefined`: `SubagentTypeBadge` hands its `useSession`
 * value straight in, while `ModelBadge` selects the bare `parentSessionId` string
 * — a primitive, so neither store's churn can re-render the header — and wraps it
 * here. `SubagentAddress` stays assignable either way.
 *
 * @module dsh-better-ui-ux/client/parentSession
 */

import type { SessionId } from '@deepseek-ai/dsh-session'

/**
 * Resolve the parent Session of the Session currently shown.
 * @param address - the shown Session's subagent address, or a bare
 * `{ parentSessionId }` built from one seat read; absent when there is no link.
 * @param rowParentId - the shown Session's list-row parent, if any.
 * @returns the parent Session id, or `undefined` when the Session is not a child.
 */
export function resolveParentId(
  address: { readonly parentSessionId?: SessionId | undefined } | undefined,
  rowParentId: SessionId | undefined,
): SessionId | undefined {
  return address?.parentSessionId ?? rowParentId
}
