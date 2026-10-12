/**
 * Mobile composer Enter-to-send: the guard matrix, the caret shapes Lexical and
 * the engines produce, the send-button resolution, and the sheet override.
 *
 * The vitest environment here is plain `node` (see `vitest.config.ts`): there is
 * no `document` global, and the repo carries no DOM library (`jsdom` /
 * `happy-dom` / `linkedom`) as a dependency. Every fixture below is therefore a
 * hand-rolled node tree driven straight through the module's decisions — the
 * same approach `compactPickerControls.spec.ts` takes for its selector coverage —
 * and the two structural filters the module relies on (`[class$="_primary"]:not(
 * [disabled])`, and `closest` on an event target) are modelled in the stubs for
 * the same reason: no real `Element.matches()` is available in this environment,
 * so the stubs exercise the selector *logic* this plugin depends on.
 *
 * The caret fixtures are the load-bearing ones: nothing else can check them, and
 * the rule they pin ("the draft already ends with a linebreak") is the one that
 * failed review twice in its naive forms — `textContent` never ends with `\n`
 * because the mobile newline is a `<br>` carrying no text, and
 * `focusOffset === childNodes.length` is never true because Lexical parks its
 * managed placeholder after the real children and puts the caret before it.
 */
import { describe, expect, it } from 'vitest'

import { MOBILE_MAX_WIDTH } from '../../src/client/codexUsageVisibility.ts'
import {
  draftEndsWithLineBreak,
  installMobileComposerEnter,
  isMobileComposerViewport,
  resolveComposerEnterAction,
  resolvePrimarySendButton,
  type ComposerEnterAction,
  type ComposerEnterInput,
  type ComposerSendButton,
} from '../../src/client/mobileComposerEnter.ts'
import { installModelBadgeStyles } from '../../src/client/styles.ts'

/** Element node type. */
const ELEMENT_NODE = 1

/** Text node type. */
const TEXT_NODE = 3

/** Lexical's placeholder attribute on the linebreak the engine appends itself. */
const MANAGED_ATTR = 'data-lexical-managed-linebreak'

/** One node of a hand-rolled DOM stand-in: only the members this module reads. */
interface StubNode {
  nodeType: number
  nodeName: string
  nodeValue: string | null
  parentElement: StubNode | null
  childNodes: StubNode[]
  attrs: Record<string, string>
  hasAttribute: (name: string) => boolean
  closest?: (selector: string) => StubNode | null
  querySelector?: (selector: string) => StubNode | null
  querySelectorAll?: (selector: string) => StubNode[]
  click?: () => void
  ownerDocument?: { getSelection: () => StubSelection | null }
}

/** A selection stand-in: the three members the caret rule reads. */
interface StubSelection {
  isCollapsed: boolean
  focusNode: StubNode | null
  focusOffset: number
}

/**
 * Give a node its children.
 * @param parent - node receiving the children.
 * @param children - the children, whose `parentElement` becomes `parent`.
 */
function adopt(parent: StubNode, children: StubNode[]): void {
  for (const child of children) {
    child.parentElement = parent
    parent.childNodes.push(child)
  }
}

/**
 * Build one element stand-in.
 * @param nodeName - tag name as the DOM reports it.
 * @param children - child nodes.
 * @param attrs - attributes by name.
 * @returns the node.
 */
function stubElement(nodeName: string, children: StubNode[] = [], attrs: Record<string, string> = {}): StubNode {
  const node: StubNode = {
    nodeType: ELEMENT_NODE,
    nodeName,
    nodeValue: null,
    parentElement: null,
    childNodes: [],
    attrs,
    hasAttribute: name => attrs[name] !== undefined,
  }
  adopt(node, children)
  return node
}

/**
 * Build one text node stand-in.
 * @param value - the text it holds.
 * @returns the node.
 */
function stubText(value: string): StubNode {
  return {
    nodeType: TEXT_NODE,
    nodeName: '#text',
    nodeValue: value,
    parentElement: null,
    childNodes: [],
    attrs: {},
    hasAttribute: () => false,
  }
}

/**
 * The real Lexical linebreak node the mobile newline becomes: a `<br>` with no
 * managed attribute.
 * @returns the node.
 */
function realLineBreak(): StubNode {
  return stubElement('BR')
}

/**
 * Lexical's own linebreak placeholder, appended after the real children.
 * @returns the node.
 */
function managedLineBreak(): StubNode {
  return stubElement('BR', [], { [MANAGED_ATTR]: '' })
}

/**
 * A collapsed caret selection.
 * @param focusNode - node holding the caret.
 * @param focusOffset - caret offset inside that node.
 * @returns the selection.
 */
function collapsed(focusNode: StubNode, focusOffset: number): StubSelection {
  return { isCollapsed: true, focusNode, focusOffset }
}

/**
 * Present a block tree as the composer's `[data-composer-input]` element, with
 * the two lookups the module reads: its own selector, and the composer seat.
 * @param children - the editable's children.
 * @param selection - the live selection.
 * @param seat - the composer seat the draft sits in, when the case needs one.
 * @returns the draft element stand-in.
 */
function stubDraft(children: StubNode[], selection: StubSelection, seat: StubNode | null = null): StubNode {
  const draft = stubElement('DIV', children, { 'data-composer-input': '' })
  draft.closest = selector => {
    if (selector === '[data-composer-input]') return draft
    if (selector === '[class$="_composerSeat"]') return seat
    return null
  }
  draft.ownerDocument = { getSelection: () => selection }
  return draft
}

/** A `_primary` button stand-in, counting the clicks it receives. */
interface StubButton extends StubNode {
  clicks: number
}

/**
 * Build a `_primary` button stand-in.
 * @param variant - the role the button draws: `path` for send, `rect` for stop.
 * @param disabled - whether it carries the `disabled` attribute.
 * @returns the button.
 */
function stubPrimaryButton(variant: 'send' | 'stop', disabled = false): StubButton {
  const drawn = variant === 'send' ? 'path' : 'rect'
  const button: StubButton = {
    ...stubElement('BUTTON', [], disabled ? { disabled: '' } : {}),
    clicks: 0,
  }
  button.querySelector = selector => (selector === `svg ${drawn}` ? stubElement('PATH') : null)
  button.click = () => {
    button.clicks += 1
  }
  return button
}

/**
 * Build a composer seat holding `_primary` buttons.
 * @param buttons - the buttons the seat renders, in document order.
 * @returns the seat, recording every selector it was queried with.
 */
function stubSeat(buttons: StubButton[]): { seat: StubNode; selectors: string[] } {
  const selectors: string[] = []
  const seat = stubElement('DIV')
  seat.querySelectorAll = selector => {
    selectors.push(selector)
    // The `:not([disabled])` filter the module's selector is expected to carry.
    if (!selector.includes(':not([disabled])')) return buttons
    return buttons.filter(button => !button.hasAttribute('disabled'))
  }
  return { seat, selectors }
}

/**
 * Build a document stand-in that owns the given nodes.
 * @param owned - the nodes its `contains` answers true for.
 * @returns the document.
 */
function stubDocument(owned: StubNode[]): Document {
  return { contains: (node: StubNode) => owned.includes(node) } as unknown as Document
}

/** A keydown stand-in, counting the suppressions it receives. */
interface StubEvent {
  target: StubNode
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
  keyCode: number
  isComposing: boolean
  repeat: boolean
  defaults: number
  stops: number
  preventDefault: () => void
  stopPropagation: () => void
}

/**
 * Build a plain-Enter keydown stand-in.
 * @param target - the event target.
 * @param overrides - guard facts to replace the plain-Enter defaults with.
 * @returns the event.
 */
function stubKeyDown(target: StubNode, overrides: Partial<Omit<StubEvent, 'target' | 'defaults' | 'stops'>> = {}): StubEvent {
  const event: StubEvent = {
    target,
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    keyCode: 13,
    isComposing: false,
    repeat: false,
    ...overrides,
    defaults: 0,
    stops: 0,
    preventDefault: () => {
      event.defaults += 1
    },
    stopPropagation: () => {
      event.stops += 1
    },
  }
  return event
}

/**
 * Build a window stand-in for one viewport shape.
 * @param mobile - whether the media query matches (portrait, coarse, narrow).
 * @returns the window, its recorded registrations, and a press driver.
 */
function stubWindow(mobile: boolean): {
  win: Window
  queries: string[]
  added: Array<{ type: string; capture: boolean }>
  removed: Array<{ type: string; capture: boolean }>
  press: (event: StubEvent) => void
} {
  const listeners: Array<(event: Event) => void> = []
  const queries: string[] = []
  const added: Array<{ type: string; capture: boolean }> = []
  const removed: Array<{ type: string; capture: boolean }> = []
  const win = {
    matchMedia: (query: string) => {
      queries.push(query)
      return { matches: mobile }
    },
    addEventListener: (type: string, listener: (event: Event) => void, capture?: boolean) => {
      added.push({ type, capture: capture === true })
      // Capture-only: an install that forgot the capture phase must not pass the
      // send cases below, because `window` capture is what beats remote's
      // `document` capture handler.
      if (type === 'keydown' && capture === true) listeners.push(listener)
    },
    removeEventListener: (type: string, listener: (event: Event) => void, capture?: boolean) => {
      removed.push({ type, capture: capture === true })
      const at = listeners.indexOf(listener)
      if (at >= 0) listeners.splice(at, 1)
    },
  }
  return {
    win: win as unknown as Window,
    queries,
    added,
    removed,
    press: event => {
      for (const listener of [...listeners]) listener(event as unknown as Event)
    },
  }
}

/**
 * The action a plain Enter produces over one draft.
 * @param draft - the draft element stand-in.
 * @param sendButton - the button the composer renders, defaulting to one send button.
 * @returns the resolved action.
 */
function actionForDraft(draft: StubNode, sendButton: StubButton | null = stubPrimaryButton('send')): ComposerEnterAction {
  return resolveComposerEnterAction({
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    keyCode: 13,
    isComposing: false,
    repeat: false,
    insideDraft: true,
    draftEndsWithLineBreak: draftEndsWithLineBreak(draft as unknown as Element),
    sendButton: sendButton as unknown as ComposerSendButton | null,
  })
}

describe('draftEndsWithLineBreak — the caret shapes Lexical and the engines produce', () => {
  it('fixture (a): sends with the caret before the managed placeholder', () => {
    // <p><span>abc</span><br><br data-lexical-managed-linebreak></p>, caret at the
    // index of the managed `<br>` — the shape a first Enter leaves behind.
    const span = stubElement('SPAN', [stubText('abc')])
    const block = stubElement('P', [span, realLineBreak(), managedLineBreak()])
    const draft = stubDraft([block], collapsed(block, 2))
    expect(draftEndsWithLineBreak(draft as unknown as Element)).toBe(true)
    expect(actionForDraft(draft)).toBe('send')
  })

  it('fixture (b): sends for the WebKit placeholder variant', () => {
    // <p>abc<br><img data-lexical-managed-linebreak><br data-lexical-managed-linebreak></p>
    const block = stubElement('P', [
      stubText('abc'),
      realLineBreak(),
      stubElement('IMG', [], { [MANAGED_ATTR]: '' }),
      managedLineBreak(),
    ])
    const draft = stubDraft([block], collapsed(block, 2))
    expect(actionForDraft(draft)).toBe('send')
  })

  it('fixture (c): ignores a caret moved back onto the text', () => {
    // The caret sits at the end of `abc`, so a real `<br>` still follows it: the
    // destructive case the caret condition exists for.
    const text = stubText('abc')
    const block = stubElement('P', [stubElement('SPAN', [text]), realLineBreak(), managedLineBreak()])
    const draft = stubDraft([block], collapsed(text, 3))
    expect(draftEndsWithLineBreak(draft as unknown as Element)).toBe(false)
    expect(actionForDraft(draft)).toBe('ignore')
  })

  it('fixture (d): sends when an engine reports the caret after the placeholder', () => {
    const block = stubElement('P', [stubElement('SPAN', [stubText('abc')]), realLineBreak(), managedLineBreak()])
    const draft = stubDraft([block], collapsed(block, 3))
    expect(actionForDraft(draft)).toBe('send')
  })

  it('fixture (e): ignores a non-collapsed selection at the same position', () => {
    const block = stubElement('P', [stubElement('SPAN', [stubText('abc')]), realLineBreak(), managedLineBreak()])
    const draft = stubDraft([block], { isCollapsed: false, focusNode: block, focusOffset: 2 })
    expect(actionForDraft(draft)).toBe('ignore')
  })

  it('ignores an empty draft holding only the managed placeholder', () => {
    const block = stubElement('P', [managedLineBreak()])
    const draft = stubDraft([block], collapsed(block, 0))
    expect(actionForDraft(draft)).toBe('ignore')
  })

  it('ignores a draft whose last real child is not a linebreak', () => {
    const block = stubElement('P', [stubElement('SPAN', [stubText('abc')]), managedLineBreak()])
    const draft = stubDraft([block], collapsed(block, 1))
    expect(actionForDraft(draft)).toBe('ignore')
  })

  it('ignores a draft ending in a reference chip', () => {
    const chip = stubElement('SPAN', [stubText('@file.ts')], { 'data-lexical-decorator': '1' })
    const block = stubElement('P', [chip, managedLineBreak()])
    const draft = stubDraft([block], collapsed(block, 1))
    expect(actionForDraft(draft)).toBe('ignore')
  })

  it('ignores a caret reported outside the editable', () => {
    const block = stubElement('P', [stubElement('SPAN', [stubText('abc')]), realLineBreak(), managedLineBreak()])
    const draft = stubDraft([block], collapsed(block, 2))
    const outside = stubElement('P', [realLineBreak(), managedLineBreak()])
    const other = stubDraft([outside], collapsed(outside, 0))
    // The same shape, read from a node tree this editable does not contain.
    ;(draft as unknown as { ownerDocument: { getSelection: () => StubSelection } }).ownerDocument = {
      getSelection: () => collapsed(outside, 1),
    }
    expect(draftEndsWithLineBreak(draft as unknown as Element)).toBe(false)
    void other
  })

  it('ignores every Enter when the draft has no live selection', () => {
    const block = stubElement('P', [stubElement('SPAN', [stubText('abc')]), realLineBreak(), managedLineBreak()])
    const draft = stubDraft([block], collapsed(block, 2))
    draft.ownerDocument = { getSelection: () => null }
    expect(actionForDraft(draft)).toBe('ignore')
  })
})

describe('resolvePrimarySendButton — one class, two roles', () => {
  it('picks the send variant that renders behind an enabled stop variant', () => {
    const stop = stubPrimaryButton('stop')
    const send = stubPrimaryButton('send')
    const { seat, selectors } = stubSeat([stop, send])
    expect(resolvePrimarySendButton(seat as unknown as Element)).toBe(send as unknown as ComposerSendButton)
    expect(selectors[0]).toContain('[class$="_primary"]')
    expect(selectors[0]).toContain(':not([disabled])')
  })

  it('resolves nothing when only the stop variant is rendered', () => {
    const { seat } = stubSeat([stubPrimaryButton('stop')])
    expect(resolvePrimarySendButton(seat as unknown as Element)).toBeNull()
  })

  it('resolves nothing when the send variant is disabled', () => {
    const { seat } = stubSeat([stubPrimaryButton('stop'), stubPrimaryButton('send', true)])
    expect(resolvePrimarySendButton(seat as unknown as Element)).toBeNull()
  })

  it('resolves nothing when the seat renders no primary button', () => {
    const { seat } = stubSeat([])
    expect(resolvePrimarySendButton(seat as unknown as Element)).toBeNull()
  })
})

describe('resolveComposerEnterAction — the guard matrix', () => {
  /** A send-ready input: every guard satisfied but the one a case varies. */
  const sendReady = (overrides: Partial<ComposerEnterInput> = {}): ComposerEnterInput => ({
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    keyCode: 13,
    isComposing: false,
    repeat: false,
    insideDraft: true,
    draftEndsWithLineBreak: true,
    sendButton: stubPrimaryButton('send') as unknown as ComposerSendButton,
    ...overrides,
  })

  it('sends for a plain second Enter', () => {
    expect(resolveComposerEnterAction(sendReady())).toBe('send')
  })

  it('ignores every other key', () => {
    expect(resolveComposerEnterAction(sendReady({ key: 'a' }))).toBe('ignore')
    expect(resolveComposerEnterAction(sendReady({ key: 'Escape' }))).toBe('ignore')
  })

  it('ignores every modifier, so the desktop gestures stay untouched', () => {
    expect(resolveComposerEnterAction(sendReady({ shiftKey: true }))).toBe('ignore')
    expect(resolveComposerEnterAction(sendReady({ ctrlKey: true }))).toBe('ignore')
    expect(resolveComposerEnterAction(sendReady({ altKey: true }))).toBe('ignore')
    expect(resolveComposerEnterAction(sendReady({ metaKey: true }))).toBe('ignore')
  })

  it('ignores an IME-owned Enter', () => {
    expect(resolveComposerEnterAction(sendReady({ isComposing: true }))).toBe('ignore')
    expect(resolveComposerEnterAction(sendReady({ keyCode: 229 }))).toBe('ignore')
  })

  it('ignores a repeated Enter from a held key', () => {
    expect(resolveComposerEnterAction(sendReady({ repeat: true }))).toBe('ignore')
  })

  it('ignores a target outside the composer draft', () => {
    expect(resolveComposerEnterAction(sendReady({ insideDraft: false }))).toBe('ignore')
  })

  it('ignores a draft that does not end with a linebreak', () => {
    expect(resolveComposerEnterAction(sendReady({ draftEndsWithLineBreak: false }))).toBe('ignore')
  })

  it('ignores everything when no send button is resolvable', () => {
    expect(resolveComposerEnterAction(sendReady({ sendButton: null }))).toBe('ignore')
  })
})

describe('isMobileComposerViewport', () => {
  it('matches the mobile layer cohort and asks a query naming its conditions', () => {
    const { win, queries } = stubWindow(true)
    expect(isMobileComposerViewport(win)).toBe(true)
    const query = queries.join(' ')
    expect(query).toContain('(orientation: portrait)')
    expect(query).toContain('(pointer: coarse)')
    expect(query).toContain(`max-width: ${MOBILE_MAX_WIDTH - 0.02}px`)
  })

  it('does not match a desktop viewport', () => {
    const { win } = stubWindow(false)
    expect(isMobileComposerViewport(win)).toBe(false)
  })

  it('does not throw when the window has no media queries', () => {
    expect(isMobileComposerViewport({} as unknown as Window)).toBe(false)
    expect(isMobileComposerViewport({ matchMedia: () => { throw new Error('gone') } } as unknown as Window)).toBe(false)
  })
})

describe('installMobileComposerEnter — the listener', () => {
  /**
   * The composer shape a second Enter is read from, with both primary buttons.
   * @returns the two buttons, the seat, the draft, and the document.
   */
  function composerWithBothRoles(): {
    stop: StubButton
    send: StubButton
    draft: StubNode
    doc: Document
  } {
    const stop = stubPrimaryButton('stop')
    const send = stubPrimaryButton('send')
    const { seat } = stubSeat([stop, send])
    const block = stubElement('P', [stubElement('SPAN', [stubText('abc')]), realLineBreak(), managedLineBreak()])
    const draft = stubDraft([block], collapsed(block, 2), seat)
    return { stop, send, draft, doc: stubDocument([draft]) }
  }

  it('registers one capture keydown listener and removes it on dispose', () => {
    const { draft, doc } = composerWithBothRoles()
    const harness = stubWindow(true)
    const dispose = installMobileComposerEnter(doc, harness.win)
    expect(harness.added).toEqual([{ type: 'keydown', capture: true }])
    dispose()
    expect(harness.removed).toEqual([{ type: 'keydown', capture: true }])
  })

  it('clicks the send variant once and suppresses the event', () => {
    const { stop, send, draft, doc } = composerWithBothRoles()
    const harness = stubWindow(true)
    const dispose = installMobileComposerEnter(doc, harness.win)
    const event = stubKeyDown(draft)
    harness.press(event)
    expect(send.clicks).toBe(1)
    expect(stop.clicks).toBe(0)
    expect(event.defaults).toBe(1)
    expect(event.stops).toBe(1)
    dispose()
  })

  it('stops sending once disposed', () => {
    const { send, draft, doc } = composerWithBothRoles()
    const harness = stubWindow(true)
    const dispose = installMobileComposerEnter(doc, harness.win)
    dispose()
    const event = stubKeyDown(draft)
    harness.press(event)
    expect(send.clicks).toBe(0)
    expect(event.defaults).toBe(0)
    expect(event.stops).toBe(0)
  })

  it('leaves a first Enter to the mobile layer', () => {
    const send = stubPrimaryButton('send')
    const { seat } = stubSeat([send])
    const block = stubElement('P', [stubElement('SPAN', [stubText('abc')]), managedLineBreak()])
    const draft = stubDraft([block], collapsed(block, 1), seat)
    const harness = stubWindow(true)
    installMobileComposerEnter(stubDocument([draft]), harness.win)
    const event = stubKeyDown(draft)
    harness.press(event)
    expect(send.clicks).toBe(0)
    expect(event.defaults).toBe(0)
    expect(event.stops).toBe(0)
  })

  it('ignores every Enter on a non-mobile viewport', () => {
    const { send, draft, doc } = composerWithBothRoles()
    const harness = stubWindow(false)
    installMobileComposerEnter(doc, harness.win)
    const event = stubKeyDown(draft)
    harness.press(event)
    expect(send.clicks).toBe(0)
    expect(event.defaults).toBe(0)
    expect(event.stops).toBe(0)
  })

  it('ignores a target outside the composer draft', () => {
    const { send, doc } = composerWithBothRoles()
    const harness = stubWindow(true)
    installMobileComposerEnter(doc, harness.win)
    const event = stubKeyDown(stubText('outside'))
    harness.press(event)
    expect(send.clicks).toBe(0)
    expect(event.defaults).toBe(0)
  })

  it('ignores a draft that is not in the installed document', () => {
    const { send, draft } = composerWithBothRoles()
    const harness = stubWindow(true)
    installMobileComposerEnter(stubDocument([]), harness.win)
    const event = stubKeyDown(draft)
    harness.press(event)
    expect(send.clicks).toBe(0)
    expect(event.defaults).toBe(0)
  })
})

describe('installed sheet — the mobile composer override', () => {
  /**
   * A `document` stand-in recording the `<style>` element the sheet installs.
   * @returns the document and a reader for the installed sheet text.
   */
  function stubSheetDocument(): { doc: Document; text: () => string } {
    let installed: { id: string; textContent: string } | undefined
    const doc = {
      getElementById: (id: string) => (installed?.id === id ? installed : null),
      createElement: () => ({ id: '', textContent: '', setAttribute: () => {} }),
      head: {
        append: (element: { id: string; textContent: string }) => {
          installed = element
        },
      },
    }
    return { doc: doc as unknown as Document, text: () => installed?.textContent ?? '' }
  }

  it('carries the border-box override, gated and interpolated from MOBILE_MAX_WIDTH', () => {
    const { doc, text } = stubSheetDocument()
    installModelBadgeStyles(doc)
    const rule = `@media (orientation:portrait) and (pointer:coarse) and (max-width:${MOBILE_MAX_WIDTH - 0.02}px){html body [class$="_composerSeat"] [class$="_trailing"]{box-sizing:border-box}}`
    expect(text()).toContain(rule)
    // The declaration is a plain override: the media query carries the gate.
    expect(rule).not.toContain('!important')
  })

  it('gates the sheet on the same bound the keydown gate asks for', () => {
    const { doc, text } = stubSheetDocument()
    installModelBadgeStyles(doc)
    const { win, queries } = stubWindow(true)
    isMobileComposerViewport(win)
    const bound = `${MOBILE_MAX_WIDTH - 0.02}px`
    expect(queries.join(' ')).toContain(bound)
    expect(text()).toContain(`max-width:${bound}`)
  })

  it('keeps the compact-picker anchor rules in the same sheet', () => {
    const { doc, text } = stubSheetDocument()
    installModelBadgeStyles(doc)
    expect(text()).toContain('right:48px')
    expect(text()).toContain('right:80px')
  })
})
