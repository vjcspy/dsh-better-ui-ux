/**
 * Compact-picker `_standardControls` anchor — rule text, sheet membership, and
 * the selector shapes it must (and must not) match.
 *
 * The rule text is ported verbatim from the fork's own assertions
 * (`vjcspy/dsh-web` `develop`,
 * `packages/dsh-remote-web-ui/tests/mobile-adapt.spec.ts:325-328`), so a
 * passing spec here is the same behavioural guarantee the fork carried.
 *
 * The vitest environment here is plain `node` (see `vitest.config.ts`): no
 * `document` global, and the repo has no DOM library (`jsdom` / `happy-dom` /
 * `linkedom`) as a dependency. Per this plan's own guardrail ("do not add a
 * new dependency without checking what the repo already uses"), the
 * DOM-fixture selector coverage below is a small hand-rolled structural
 * matcher instead of a real `Element.matches()` call: it models exactly the
 * combinators the two rules use (`[class$=]` suffix match, `>` direct child,
 * `:has()` direct-child-with-descendant), against a plain object tree that
 * mirrors `_composerSeat > _trailing > _standardControls`. It is not a
 * browser engine's `:has()` implementation, so it does not exercise engine
 * `:has()` support — it exercises the selector *logic* this plugin depends
 * on, which is the coverage available without adding a dependency.
 */
import { describe, expect, it } from 'vitest'

import { COMPACT_PICKER_CONTROLS_SHEET } from '../../src/client/compactPickerControls.ts'
import { installModelBadgeStyles } from '../../src/client/styles.ts'

describe('COMPACT_PICKER_CONTROLS_SHEET', () => {
  it('carries the 48px anchor rule verbatim', () => {
    expect(COMPACT_PICKER_CONTROLS_SHEET).toContain(
      'body.dsh-remote-compact-picker [class$="_composerSeat"] [class$="_trailing"] > [class$="_standardControls"]{position:absolute;right:48px;top:50%;transform:translateY(-50%)}',
    )
  })

  it('carries the 80px ring-in-trailing rule verbatim', () => {
    expect(COMPACT_PICKER_CONTROLS_SHEET).toContain(
      'body.dsh-remote-compact-picker [class$="_composerSeat"] [class$="_trailing"]:has(> [class$="_root"]:has([class$="_track"])) > [class$="_standardControls"]{right:80px}',
    )
  })

  it('prefixes every rule with the compact-picker body class (inertness guarantee)', () => {
    const rules = COMPACT_PICKER_CONTROLS_SHEET
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) {
      expect(rule.startsWith('body.dsh-remote-compact-picker')).toBe(true)
    }
  })

  it('sets no rule with !important', () => {
    expect(COMPACT_PICKER_CONTROLS_SHEET).not.toContain('!important')
  })
})

/** Minimal `<style>` stand-in, matching the pattern `client-bundle.spec.ts` uses for `doc.head`. */
function stubDocument(): { doc: Document; getText: () => string | undefined } {
  let installed: { id: string; textContent: string } | undefined
  const doc = {
    getElementById: (id: string) => (installed?.id === id ? installed : null),
    createElement: () => {
      const element = { id: '', textContent: '', setAttribute: () => {} }
      return element
    },
    head: {
      append: (element: { id: string; textContent: string }) => {
        installed = element
      },
    },
  }
  return { doc: doc as unknown as Document, getText: () => installed?.textContent }
}

describe('installModelBadgeStyles — compact-picker anchor membership', () => {
  it('includes both compact-picker rules in the installed sheet', () => {
    const { doc, getText } = stubDocument()
    installModelBadgeStyles(doc)
    const text = getText()
    expect(text).toContain('right:48px')
    expect(text).toContain('right:80px')
  })
})

/**
 * Hand-rolled selector-shape coverage (see file header for why this is not a
 * real `Element.matches()` call).
 */
describe('compact-picker selector shapes (structural fixture)', () => {
  interface FixtureNode {
    classSuffix: string
    children: FixtureNode[]
  }

  function hasDescendantSuffix(node: FixtureNode, suffix: string): boolean {
    return node.children.some(child => child.classSuffix === suffix || hasDescendantSuffix(child, suffix))
  }

  /** `[class$="_trailing"] > [class$="_standardControls"]` — plus the compact-picker body class. */
  function matches48(bodyCompact: boolean, trailing: FixtureNode): boolean {
    if (!bodyCompact) return false
    return trailing.children.some(child => child.classSuffix === '_standardControls')
  }

  /** Same, plus `:has(> [class$="_root"]:has([class$="_track"]))` on `_trailing`. */
  function matches80(bodyCompact: boolean, trailing: FixtureNode): boolean {
    if (!matches48(bodyCompact, trailing)) return false
    return trailing.children.some(
      child => child.classSuffix === '_root' && hasDescendantSuffix(child, '_track'),
    )
  }

  function buildTrailing(options: { ringInTrailing: boolean }): FixtureNode {
    const controls: FixtureNode = { classSuffix: '_standardControls', children: [] }
    const children: FixtureNode[] = []
    if (options.ringInTrailing) {
      children.push({
        classSuffix: '_root',
        children: [{ classSuffix: '_track', children: [] }],
      })
    }
    children.push(controls)
    return { classSuffix: '_trailing', children }
  }

  it('matches the 48px selector on the current host shape (no ring in trailing)', () => {
    const trailing = buildTrailing({ ringInTrailing: false })
    expect(matches48(true, trailing)).toBe(true)
  })

  it('does not match the 80px selector on the current host shape (no ring in trailing)', () => {
    const trailing = buildTrailing({ ringInTrailing: false })
    expect(matches80(true, trailing)).toBe(false)
  })

  it('matches the 80px selector once a ring sits directly under _trailing (hypothetical shape)', () => {
    const trailing = buildTrailing({ ringInTrailing: true })
    expect(matches80(true, trailing)).toBe(true)
  })

  it('matches neither selector without the compact-picker body class', () => {
    const trailing = buildTrailing({ ringInTrailing: true })
    expect(matches48(false, trailing)).toBe(false)
    expect(matches80(false, trailing)).toBe(false)
  })
})
