/**
 * Unit tests for the parent-owned delegation-anchor projection.
 *
 * The fold is driven with synthetic events rather than a live Session: the
 * contract under test is a pure `(state, event) → state` transition plus a wire
 * value, and the cases that matter (a background call closing before its catalog,
 * two same-label siblings, a continuable result arriving after its catalog) are
 * exactly the orderings a hand-built event stream expresses most precisely.
 *
 * Every case that would otherwise be tempting to resolve by guessing asserts
 * *hidden* (`undefined`), because a wrong tool name is worse than no badge.
 */

import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionHeader, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { ToolResultMessage } from '@deepseek-ai/dsh-llm'
import type { SubagentTypeBySession } from '../../src/projection-types.ts'

import { describe, expect, it } from 'vitest'

import { subagentTypeProjectionDefinition, type SubagentTypeState } from '../../src/projection.ts'

const KEY = 'subagentType'

/** Build a `tool/call` event. */
function callEvent(seq: number, turn: number, callId: string, toolName: string, args: unknown): SessionEvent {
  const raw = typeof args === 'string' ? args : JSON.stringify(args)
  return {
    type: 'tool/call',
    seq,
    time: seq,
    data: { turn, step: 0, callId, name: toolName, arguments: raw },
  } as unknown as SessionEvent
}

/** Build a `tool/result` event whose message carries one text block. */
function resultEvent(seq: number, turn: number, callId: string, text: string, isError = false): SessionEvent {
  const message = {
    id: `m-${callId}`,
    role: 'tool',
    source: { kind: 'tool' },
    toolCallId: callId,
    isError,
    content: [{ type: 'text', text }],
  } as unknown as ToolResultMessage
  return { type: 'tool/result', seq, time: seq, data: { turn, step: 0, message } } as unknown as SessionEvent
}

/** Build a `subagent/catalog` event. */
function catalogEvent(seq: number, childId: string, label: string | undefined): SessionEvent {
  return {
    type: 'subagent/catalog',
    seq,
    time: seq,
    data: { version: 0, mode: 'one-shot', childId, childCreatedAt: seq, ...label === undefined ? {} : { label } },
  } as unknown as SessionEvent
}

/** A `subagent/catalog` payload with no label at all (the unknown-mode arm). */
function unlabeledCatalogEvent(seq: number, childId: string): SessionEvent {
  return {
    type: 'subagent/catalog',
    seq,
    time: seq,
    data: { version: 1, mode: 'unknown', childId, childCreatedAt: seq },
  } as unknown as SessionEvent
}

/** Fold a whole event stream from `init`, the way a late build does. */
function fold(events: readonly SessionEvent[], inheritedEventCount = 0): SubagentTypeState {
  const header = {} as SessionHeader
  let state = subagentTypeProjectionDefinition.init(header, inheritedEventCount as SessionLogOffset)
  for (const event of events) {
    state = subagentTypeProjectionDefinition.apply(state, event)
  }
  return state
}

/** Fold and read the wire value, which is what the badge ultimately renders. */
function wireOf(events: readonly SessionEvent[], inheritedEventCount = 0): SubagentTypeBySession {
  const definition = subagentTypeProjectionDefinition
  if (definition.wire === undefined) throw new Error('the projection must publish a wire view')
  return definition.wire.view(fold(events, inheritedEventCount))
}

/** Index a wire value by a plain string; the real keys are branded Session ids. */
function at(wire: SubagentTypeBySession, childId: string): string | undefined {
  return (wire as Record<string, string | undefined>)[childId]
}

/** The badge's own read: the value for one child, or `undefined` when hidden. */
function typeOf(events: readonly SessionEvent[], childId: string): string | undefined {
  return at(wireOf(events), childId)
}

describe('subagent type projection — admission', () => {
  it('admits the generic, fork and teammate tool names plus every agent_* role tool', () => {
    for (const name of ['subagent', 'subagent_fork', 'spawn_teammate', 'agent_analyst', 'agent_scout']) {
      const events = [
        callEvent(0, 0, 'c1', name, { description: 'work', prompt: 'go' }),
        catalogEvent(1, 'child-1', 'work'),
      ]
      expect(typeOf(events, 'child-1')).toBe(name)
    }
  })

  it('admits nothing for a non-delegating tool, even one with a description argument', () => {
    // `bash` also declares a required `description`, which is why admission has to
    // be by tool name rather than by argument shape.
    const events = [
      callEvent(0, 0, 'c1', 'bash', { description: 'work', command: 'ls' }),
      catalogEvent(1, 'child-1', 'work'),
    ]
    expect(typeOf(events, 'child-1')).toBeUndefined()
  })

  it('bounds state when a session never delegates', () => {
    const events = Array.from({ length: 200 }, (_, index) =>
      callEvent(index, index, `c${index}`, 'read', { file_path: '/tmp/x' }))
    const state = fold(events)
    expect(state.calls).toHaveLength(0)
    expect(state.pending).toHaveLength(0)
  })
})

describe('subagent type projection — Tier 2 label match', () => {
  it('resolves a single candidate by exact label', () => {
    const events = [
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 'investigate', prompt: 'go' }),
      catalogEvent(1, 'child-1', 'investigate'),
    ]
    expect(typeOf(events, 'child-1')).toBe('agent_analyst')
  })

  it('trims the catalog label before matching', () => {
    const events = [
      callEvent(0, 0, 'c1', 'agent_scout', { description: 'look' }),
      catalogEvent(1, 'child-1', '  look  '),
    ]
    expect(typeOf(events, 'child-1')).toBe('agent_scout')
  })

  it('hides a catalog with no label', () => {
    const events = [
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 'work' }),
      unlabeledCatalogEvent(1, 'child-1'),
    ]
    expect(typeOf(events, 'child-1')).toBeUndefined()
  })

  it('hides two same-label siblings even when one is background and one is foreground', () => {
    // The swap hazard: the background arm closes its tool/call before its child
    // starts, the foreground arm closes after. Preferring "still open" candidates
    // would bind each catalog to the other sibling's tool name.
    const events = [
      callEvent(0, 0, 'bg', 'agent_scout', { description: 'same', run_in_background: true }),
      callEvent(1, 0, 'fg', 'agent_analyst', { description: 'same' }),
      // background returns first, before its own child exists
      resultEvent(2, 0, 'bg', 'started background subagent job job-1'),
      catalogEvent(3, 'child-bg', 'same'),
      catalogEvent(4, 'child-fg', 'same'),
      resultEvent(5, 0, 'fg', 'foreground result text'),
    ]
    const wire = wireOf(events)
    expect(at(wire, 'child-bg')).toBeUndefined()
    expect(at(wire, 'child-fg')).toBeUndefined()
  })

  it('hides two same-label foreground siblings whose catalogs both precede the results', () => {
    // Both catalogs are folded while both calls are still unclaimed, so neither
    // can tell the two apart. This is the documented residual: a wrong tool name
    // is not an option, so the pair renders nothing.
    const events = [
      callEvent(0, 0, 'a', 'agent_analyst', { description: 'same' }),
      callEvent(1, 0, 'b', 'agent_scout', { description: 'same' }),
      catalogEvent(2, 'child-a', 'same'),
      catalogEvent(3, 'child-b', 'same'),
      resultEvent(4, 0, 'a', 'first done'),
      resultEvent(5, 0, 'b', 'second done'),
    ]
    const wire = wireOf(events)
    expect(at(wire, 'child-a')).toBeUndefined()
    expect(at(wire, 'child-b')).toBeUndefined()
  })

  it('resolves a same-label sibling once the other call has already been claimed', () => {
    // The decidable ordering: the second catalog arrives after the first call was
    // claimed by its exact key, so exactly one candidate remains for it.
    const events = [
      callEvent(0, 0, 'a', 'agent_analyst', { description: 'same' }),
      callEvent(1, 0, 'b', 'agent_scout', { description: 'same' }),
      catalogEvent(2, 'child-a', 'same'),
      resultEvent(3, 0, 'a', 'started subagent child-a'),
      catalogEvent(4, 'child-b', 'same'),
    ]
    const wire = wireOf(events)
    expect(at(wire, 'child-a')).toBe('agent_analyst')
    expect(at(wire, 'child-b')).toBe('agent_scout')
  })

  it('hides a catalog whose label matches two unclaimed calls', () => {
    const events = [
      callEvent(0, 0, 'a', 'agent_analyst', { description: 'same' }),
      callEvent(1, 0, 'b', 'agent_scout', { description: 'same' }),
      catalogEvent(2, 'child-1', 'same'),
    ]
    expect(typeOf(events, 'child-1')).toBeUndefined()
  })
})

describe('subagent type projection — Tier 1 exact key', () => {
  it('binds a continuable child from its result text', () => {
    const events = [
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 'work' }),
      catalogEvent(1, 'child-1', 'work'),
      resultEvent(2, 0, 'c1', 'started subagent child-1'),
    ]
    expect(typeOf(events, 'child-1')).toBe('agent_analyst')
  })

  it('rebinds a child a provisional label match had claimed', () => {
    // The catalog is committed inside the child start, before the tool returns,
    // so a label match can land first and the exact key must outrank it.
    const events = [
      callEvent(0, 0, 'wrong', 'agent_scout', { description: 'work' }),
      callEvent(1, 0, 'right', 'agent_analyst', { description: 'other' }),
      catalogEvent(2, 'child-1', 'work'),
      resultEvent(3, 0, 'right', 'started subagent child-1'),
    ]
    expect(typeOf(events, 'child-1')).toBe('agent_analyst')
  })

  it('resolves two same-label continuable siblings, both of them', () => {
    const events = [
      callEvent(0, 0, 'a', 'agent_analyst', { description: 'same' }),
      callEvent(1, 0, 'b', 'agent_scout', { description: 'same' }),
      catalogEvent(2, 'child-a', 'same'),
      catalogEvent(3, 'child-b', 'same'),
      resultEvent(4, 0, 'a', 'started subagent child-a'),
      resultEvent(5, 0, 'b', 'started subagent child-b'),
    ]
    const wire = wireOf(events)
    expect(at(wire, 'child-a')).toBe('agent_analyst')
    expect(at(wire, 'child-b')).toBe('agent_scout')
  })

  it('does not bind a background job id as if it were a child session', () => {
    // `started background subagent job <jobId>` mentions a job, not a Session.
    const events = [
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 'work', run_in_background: true }),
      catalogEvent(1, 'child-1', undefined),
      resultEvent(2, 0, 'c1', 'started background subagent job job-1'),
    ]
    expect(typeOf(events, 'child-1')).toBeUndefined()
  })

  it('ignores the exact key of an errored result', () => {
    const events = [
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 'work' }),
      catalogEvent(1, 'child-1', undefined),
      resultEvent(2, 0, 'c1', 'started subagent child-1', true),
    ]
    expect(typeOf(events, 'child-1')).toBeUndefined()
  })
})

describe('subagent type projection — malformed arguments', () => {
  it('treats unparseable JSON as no description, so the catalog stays hidden', () => {
    const events = [
      callEvent(0, 0, 'c1', 'agent_analyst', '{"description": "work"'),
      catalogEvent(1, 'child-1', 'work'),
    ]
    expect(typeOf(events, 'child-1')).toBeUndefined()
  })

  it('treats a non-object payload as no description', () => {
    for (const raw of ['"just a string"', '[]', 'null', '42']) {
      const events = [
        callEvent(0, 0, 'c1', 'agent_analyst', raw),
        catalogEvent(1, 'child-1', 'work'),
      ]
      expect(typeOf(events, 'child-1')).toBeUndefined()
    }
  })

  it('treats a non-string description as no description', () => {
    const events = [
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 42 }),
      catalogEvent(1, 'child-1', '42'),
    ]
    expect(typeOf(events, 'child-1')).toBeUndefined()
  })
})

describe('subagent type projection — fork-inherited prefix', () => {
  it('ignores inherited events so a fork child does not adopt its parent delegations', () => {
    const inherited = [
      callEvent(0, 0, 'parent-call', 'agent_scout', { description: 'parent work' }),
      catalogEvent(1, 'parent-child', 'parent work'),
    ]
    const own = [
      callEvent(2, 0, 'own-call', 'agent_analyst', { description: 'own work' }),
      catalogEvent(3, 'own-child', 'own work'),
    ]
    const wire = wireOf([...inherited, ...own], 2)
    expect(at(wire, 'parent-child')).toBeUndefined()
    expect(at(wire, 'own-child')).toBe('agent_analyst')
  })
})

describe('subagent type projection — expiry', () => {
  it('expires an unclaimed call once a later turn begins', () => {
    // Without expiry, one never-cataloged delegation would make every later
    // same-label delegation ambiguous forever.
    const events = [
      callEvent(0, 0, 'stale', 'agent_scout', { description: 'work', run_in_background: true }),
      resultEvent(1, 0, 'stale', 'started background subagent job job-1'),
      callEvent(2, 1, 'fresh', 'agent_analyst', { description: 'work' }),
      catalogEvent(3, 'child-1', 'work'),
    ]
    expect(typeOf(events, 'child-1')).toBe('agent_analyst')
  })

  it('does not expire on a catalog fold, so a late background catalog still binds', () => {
    // The catalog carries no turn of its own; expiring there could discard the
    // very call its own catalog belongs to.
    const events = [
      callEvent(0, 0, 'bg', 'agent_scout', { description: 'work', run_in_background: true }),
      resultEvent(1, 0, 'bg', 'started background subagent job job-1'),
      catalogEvent(2, 'child-1', 'work'),
    ]
    expect(typeOf(events, 'child-1')).toBe('agent_scout')
  })

  it('leaves a catalog unresolved when its turn has moved on', () => {
    const events = [
      callEvent(0, 0, 'bg', 'agent_scout', { description: 'work', run_in_background: true }),
      catalogEvent(1, 'child-1', undefined),
      callEvent(2, 1, 'next', 'agent_analyst', { description: 'other' }),
      resultEvent(3, 1, 'next', 'started background subagent job job-2'),
    ]
    expect(typeOf(events, 'child-1')).toBeUndefined()
  })
})

describe('subagent type projection — wire view', () => {
  it('returns the same reference across two consecutive view calls', () => {
    const definition = subagentTypeProjectionDefinition
    if (definition.wire === undefined) throw new Error('the projection must publish a wire view')
    const state = fold([
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 'work' }),
      catalogEvent(1, 'child-1', 'work'),
    ])
    expect(definition.wire.view(state)).toBe(definition.wire.view(state))
  })

  it('keeps the same resolved reference when a fold does not add a binding', () => {
    const events = [
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 'work' }),
      catalogEvent(1, 'child-1', 'work'),
    ]
    const bound = fold(events)
    // A further event the unit does not model must not allocate a new binding map.
    const after = subagentTypeProjectionDefinition.apply(bound, {
      type: 'turn/start', seq: 2, time: 2, data: {}, surfaceOp: 'append',
    } as unknown as SessionEvent)
    expect(after).toBe(bound)
  })

  it('parses a whole current value through the wire schema', () => {
    const definition = subagentTypeProjectionDefinition
    if (definition.wire === undefined) throw new Error('the projection must publish a wire view')
    const state = fold([
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 'work' }),
      catalogEvent(1, 'child-1', 'work'),
    ])
    expect(definition.wire.viewSchema.parse(definition.wire.view(state))).toEqual({ 'child-1': 'agent_analyst' })
  })

  it('round-trips its own state through the state schema', () => {
    const state = fold([
      callEvent(0, 0, 'c1', 'agent_analyst', { description: 'work' }),
      catalogEvent(1, 'child-1', 'work'),
      callEvent(2, 0, 'c2', 'agent_scout', JSON.stringify({ description: 'broken' })),
    ])
    expect(subagentTypeProjectionDefinition.stateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('declares stateVersion 0 so pre-existing rows cannot strand one version behind', () => {
    expect(subagentTypeProjectionDefinition.stateVersion).toBe(0)
    expect(subagentTypeProjectionDefinition.key).toBe(KEY)
  })
})

describe('subagent type projection — errored candidates', () => {
  it('excludes an errored call, so a decidable sibling still resolves', () => {
    // A failed delegation leaves no catalog of its own. Had it stayed a candidate,
    // the surviving delegation below would have been ambiguous and stayed hidden.
    const events = [
      callEvent(0, 0, 'failed', 'agent_scout', { description: 'work' }),
      resultEvent(1, 0, 'failed', 'delegation failed', true),
      callEvent(2, 0, 'ok', 'agent_analyst', { description: 'work' }),
      catalogEvent(3, 'child-1', 'work'),
    ]
    expect(typeOf(events, 'child-1')).toBe('agent_analyst')
  })

  it('hides a catalog whose only label match errored', () => {
    const events = [
      callEvent(0, 0, 'failed', 'agent_scout', { description: 'work' }),
      resultEvent(1, 0, 'failed', 'delegation failed', true),
      catalogEvent(2, 'child-1', 'work'),
    ]
    expect(typeOf(events, 'child-1')).toBeUndefined()
  })

  it('does not revoke a binding a catalog already made before the error was folded', () => {
    // The catalog is folded while the call is still unmarked, which is the only
    // reading available at that point. The late error flag then keeps the call out
    // of the candidate set for anything later, without rewriting a settled binding.
    const events = [
      callEvent(0, 0, 'failed', 'agent_scout', { description: 'work' }),
      catalogEvent(1, 'child-1', 'work'),
      resultEvent(2, 0, 'failed', 'delegation failed', true),
    ]
    expect(typeOf(events, 'child-1')).toBe('agent_scout')
  })
})
