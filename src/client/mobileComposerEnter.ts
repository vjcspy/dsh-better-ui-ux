/**
 * Mobile composer: a second Enter sends the draft.
 *
 * On a portrait touch viewport narrower than {@link MOBILE_MAX_WIDTH},
 * `@linxin666/dsh-remote-web-ui`'s mobile layer captures every modifier-free
 * Enter inside the composer at `document` level in the capture phase, calls
 * `preventDefault()` + `stopPropagation()` and inserts `'\n'` itself (installed
 * 0.4.5, `mobile-adapt.ts`: `onKeydownCapture`, registered as
 * `document.addEventListener('keydown', …, true)`), with the comment "Enter only
 * inserts a newline on mobile (send goes through the send button)". Core's own
 * Enter-to-send keymap never sees the event, so the send button is the phone's
 * only send path. This module restores the desktop gesture on that layer: Enter
 * pressed while the draft already ends with a linebreak sends the message
 * through the rendered send button, and every other Enter keeps today's newline.
 *
 * The listener goes on `window`, not on `document`: the capture path starts at
 * `window`, so a `window` capture listener is decided before any `document`
 * capture listener on the same path whatever the mount order. `preventDefault()`
 * + `stopPropagation()` on that event then suppresses both the newline remote
 * would have inserted and the browser's own insertion.
 *
 * Coupling — this module keys on private tokens of two other packages and on no
 * published contract:
 *
 * - `[class$="_composerSeat"]`, `[class$="_trailing"]` and `[class$="_primary"]`
 *   are core CSS-module suffixes (`packages/client/ui-conversation/src/client/
 *   skeleton/InputBar.tsx` + `InputBar.module.css`). Core renders ONE `_primary`
 *   button for two roles — Send, or Stop while a turn runs — and a continuable
 *   child renders the Stop variant *first*, so a single `querySelector` would
 *   resolve to Stop and silently disable this feature during such a turn. The
 *   roles differ in markup only by the svg shape the button draws (`path` =
 *   send, `rect` = stop).
 * - `[data-composer-input]` is core's contenteditable hook
 *   (`ComposerContentEditable.tsx`) — the same hook remote scopes its Enter
 *   rewrite to — and it is the ONLY draft this module accepts: a picker search
 *   field inside the same composer seat must never send the message.
 * - `data-lexical-managed-linebreak` is Lexical's placeholder attribute. The
 *   engine appends those placeholders *after* the real children and parks the
 *   caret before them, and the mobile newline itself is a linebreak node — a
 *   real `<br>` carrying no text — so neither `textContent` (never ends with
 *   `\n`) nor `focusOffset === childNodes.length` (never true) can express "the
 *   draft ends with a linebreak". See {@link draftEndsWithLineBreak}.
 *
 * Re-measure all three on a core, Lexical or `@linxin666/dsh-remote-web-ui`
 * bump — see this plugin's README "Known limitations" entry. The viewport gate
 * is deliberately a media query rather than remote's own active-state class
 * (0.4.5 renamed that class to `dsh-remote-portrait`, and it is on `<body>`
 * only while remote's layer is enabled): reproducing the conditions survives
 * the rename, and remote's two off-switches (the per-session force-desktop
 * `sessionStorage` flag, the plugin's own settings switch) leave this module
 * inert against core's desktop behavior instead of regressing it.
 */

import { MOBILE_MAX_WIDTH } from './codexUsageVisibility.ts'

/** Core's contenteditable hook: the composer draft, and no other field in the seat. */
const COMPOSER_INPUT_SELECTOR = '[data-composer-input]'

/** The composer card holding a draft (core CSS-module suffix). */
const COMPOSER_SEAT_SELECTOR = '[class$="_composerSeat"]'

/**
 * Every *enabled* core button carrying the shared send/stop class, in document
 * order: the stop variant of a continuable child comes before the send variant.
 */
const ENABLED_PRIMARY_SELECTOR = '[class$="_primary"]:not([disabled])'

/** Lexical's placeholder attribute on the linebreak the engine appends itself. */
const MANAGED_LINEBREAK_ATTR = 'data-lexical-managed-linebreak'

/** Element node type, spelled without a DOM global so the decisions stay pure. */
const ELEMENT_NODE = 1

/** Text node type, spelled without a DOM global so the decisions stay pure. */
const TEXT_NODE = 3

/** `keyCode` of the Enter that confirms an IME composition (the Safari case). */
const IME_CONFIRM_KEYCODE = 229

/**
 * The mobile gate, mirroring remote's `isMobilePortrait()` conditions as one
 * media query. `pointer: coarse` in CSS matches the JS `matchMedia('(pointer:
 * coarse)')` remote uses, so both layers agree on the same devices, and the
 * `1099.98px` bound reproduces remote's `innerWidth < 1100` for a viewport
 * measured in whole CSS pixels.
 */
const MOBILE_COMPOSER_QUERY = `(orientation: portrait) and (pointer: coarse) and (max-width: ${MOBILE_MAX_WIDTH - 0.02}px)`

/**
 * A resolved composer send button. It is not a bare {@link Element}: the send
 * path is a programmatic `click()`, which the DOM declares on `HTMLElement` and
 * not on `Element` — and a runtime `instanceof` narrowing would be a stronger
 * claim than this module can make about a stub-driven decision.
 */
export type ComposerSendButton = Element & { click: () => void }

/** The event facts {@link resolveComposerEnterAction} decides from. */
export interface ComposerEnterInput {
  /** `KeyboardEvent.key`. */
  key: string
  /** `KeyboardEvent.shiftKey`. */
  shiftKey: boolean
  /** `KeyboardEvent.ctrlKey`. */
  ctrlKey: boolean
  /** `KeyboardEvent.altKey`. */
  altKey: boolean
  /** `KeyboardEvent.metaKey`. */
  metaKey: boolean
  /** `KeyboardEvent.keyCode`; 229 marks the Enter that confirms an IME composition. */
  keyCode: number
  /** `KeyboardEvent.isComposing` — a composing IME owns the key. */
  isComposing: boolean
  /** `KeyboardEvent.repeat` — a held key is never a deliberate second Enter. */
  repeat: boolean
  /** Whether the event target sits inside the composer's `[data-composer-input]`. */
  insideDraft: boolean
  /** Whether the caret already trails the linebreak the first Enter created. */
  draftEndsWithLineBreak: boolean
  /** The resolved enabled send-variant button, or null when none is rendered. */
  sendButton: ComposerSendButton | null
}

/** What the listener does with a plain Enter inside the composer. */
export type ComposerEnterAction = 'send' | 'ignore'

/** The `closest` lookup an event target is read through. */
type ClosestLookup = (selector: string) => Element | null

/**
 * Whether any Enter modifier is held: those stay the desktop gestures.
 * @param input - the event facts.
 * @returns true when at least one modifier is down.
 */
function hasModifier(input: ComposerEnterInput): boolean {
  return input.shiftKey || input.ctrlKey || input.altKey || input.metaKey
}

/**
 * Whether this viewport is the mobile layer's own cohort. Re-evaluated per
 * event, so rotation and a resized window need no state.
 * @param win - window to measure.
 * @returns true for portrait coarse-pointer viewports narrower than the breakpoint.
 */
export function isMobileComposerViewport(win: Window): boolean {
  try {
    if (typeof win.matchMedia !== 'function') return false
    return win.matchMedia(MOBILE_COMPOSER_QUERY).matches === true
  } catch {
    return false
  }
}

/**
 * Resolve the composer's send button, never its stop button.
 *
 * The two roles share one class, so the send variant is identified by the shape
 * it draws and the stop variant is skipped rather than clicked: a programmatic
 * click on Stop would kill a running turn.
 * @param seat - the composer seat holding the buttons.
 * @returns the first enabled send-variant button, or null when none is rendered.
 */
export function resolvePrimarySendButton(seat: Element): ComposerSendButton | null {
  const candidates = seat.querySelectorAll(ENABLED_PRIMARY_SELECTOR)
  for (const candidate of candidates) {
    if (candidate.querySelector('svg path') !== null && candidate.querySelector('svg rect') === null) {
      // A rendered `<button>`, whose own `onPrimary` handler keeps every host
      // gate (`primaryDisabled`, `empty`, `machineBusy`, `uploadsPending`) in
      // force — this module never submits on its own.
      return candidate as ComposerSendButton
    }
  }
  return null
}

/**
 * Decide what one composer Enter means on the mobile layer.
 * @param input - the pressed key's facts, the draft's caret state, and the resolved button.
 * @returns `'send'` only for a plain, non-repeating, non-composing Enter over a
 * draft that already ends with a linebreak and with an enabled send button;
 * `'ignore'` leaves the event to the mobile layer's own newline.
 */
export function resolveComposerEnterAction(input: ComposerEnterInput): ComposerEnterAction {
  if (input.key !== 'Enter') return 'ignore'
  if (hasModifier(input)) return 'ignore'
  if (input.isComposing || input.keyCode === IME_CONFIRM_KEYCODE) return 'ignore'
  if (input.repeat) return 'ignore'
  if (!input.insideDraft) return 'ignore'
  if (input.sendButton === null) return 'ignore'
  return input.draftEndsWithLineBreak ? 'send' : 'ignore'
}

/**
 * Whether a node is one of Lexical's managed linebreak placeholders.
 * @param node - node to test.
 * @returns true for the `<br>` (and WebKit's `<img>`) the engine appends itself.
 */
function isManagedPlaceholder(node: Node): boolean {
  return node.nodeType === ELEMENT_NODE && (node as Element).hasAttribute(MANAGED_LINEBREAK_ATTR)
}

/**
 * Whether a node contributes no draft text.
 * @param node - node to test.
 * @returns true for an empty text node.
 */
function isEmptyText(node: Node): boolean {
  return node.nodeType === TEXT_NODE && (node.nodeValue ?? '') === ''
}

/**
 * Whether the caret's own node still holds real draft text after the caret.
 * @param focus - the selection's focus node.
 * @param offset - the selection's focus offset.
 * @returns true when characters follow the caret inside a text node.
 */
function hasTextAfterCaret(focus: Node, offset: number): boolean {
  if (focus.nodeType !== TEXT_NODE) return false
  return offset < (focus.nodeValue ?? '').length
}

/**
 * Whether a node sits in the editable's subtree, the editable itself included.
 * @param editor - the `[data-composer-input]` element.
 * @param node - node to test.
 * @returns true when walking up from the node reaches the editable.
 */
function isInside(editor: Element, node: Node): boolean {
  let cursor: Node | null = node
  while (cursor !== null) {
    if (cursor === editor) return true
    cursor = cursor.parentElement
  }
  return false
}

/**
 * Position of a node among its parent's children.
 * @param parent - the parent node.
 * @param child - one of its children.
 * @returns the 0-based index, or -1 when the node is not a child of the parent.
 */
function indexOfChild(parent: Node, child: Node): number {
  const children = parent.childNodes
  for (let index = 0; index < children.length; index += 1) {
    if (children[index] === child) return index
  }
  return -1
}

/**
 * The selection of the editable's own document.
 * @param editor - the `[data-composer-input]` element.
 * @returns the live selection, or null when the document has none.
 */
function selectionOf(editor: Element): Selection | null {
  const doc = editor.ownerDocument
  if (doc === null || typeof doc.getSelection !== 'function') return null
  return doc.getSelection()
}

/**
 * The block level element holding the caret: the nearest ancestor that is a
 * direct child of the editable.
 * @param editor - the `[data-composer-input]` element.
 * @param focus - the selection's focus node.
 * @returns the block, or null when the node is not inside the editable.
 */
function focusBlock(editor: Element, focus: Node): Node | null {
  let cursor: Node = focus
  while (cursor !== editor) {
    const parent = cursor.parentElement
    if (parent === null) return null
    if (parent === editor) return cursor
    cursor = parent
  }
  // A caret on the editable itself ends the editable, which is then its block.
  return editor
}

/**
 * Whether the last real child of a block is a Lexical linebreak `<br>`.
 * Managed placeholders are skipped: the engine appends them after the real
 * children, so they carry no draft content.
 * @param block - the block holding the caret.
 * @returns true when the last child that is not a placeholder is a `<br>`.
 */
function blockEndsWithLineBreak(block: Node): boolean {
  const children = block.childNodes
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index]
    if (child === undefined || isManagedPlaceholder(child)) continue
    return child.nodeType === ELEMENT_NODE && child.nodeName === 'BR'
  }
  return false
}

/**
 * Whether every node after the caret, in document order up to the end of the
 * editable, is a managed placeholder or an empty text node. This is what "at the
 * end" means here: the placeholder Lexical parks after the real children is the
 * last DOM child, so an offset test against `childNodes.length` never fires.
 * @param editor - the `[data-composer-input]` element.
 * @param focus - the selection's focus node.
 * @param offset - the selection's focus offset.
 * @returns true when nothing real follows the caret.
 */
function onlyManagedAfterCaret(editor: Element, focus: Node, offset: number): boolean {
  let cursor: Node = focus
  while (cursor !== editor) {
    const parent = cursor.parentElement
    if (parent === null) return false
    // The caret's own level reads the caret offset; every level above it reads
    // the position of the node we climbed out of, which is a child of `parent`
    // by construction.
    const start = cursor === focus && focus.nodeType !== TEXT_NODE
      ? offset
      : indexOfChild(parent, cursor) + 1
    const siblings = parent.childNodes
    for (let index = start; index < siblings.length; index += 1) {
      const sibling = siblings[index]
      if (sibling === undefined) continue
      if (!isManagedPlaceholder(sibling) && !isEmptyText(sibling)) return false
    }
    cursor = parent
  }
  return true
}

/**
 * Whether the draft's caret already trails the linebreak the first Enter made.
 *
 * The rule the decision is built on: the selection is collapsed inside the
 * editable, nothing real follows the caret up to the end of the editable, and
 * the caret's block ends with a real `<br>`. The caret condition is what keeps a
 * caret moved back into the draft from sending, and skipping the managed
 * placeholders is what stops an empty draft from looking like a draft that ends
 * with a newline.
 * @param editor - the `[data-composer-input]` element.
 * @returns true when a plain Enter here is the second one in a row.
 */
export function draftEndsWithLineBreak(editor: Element): boolean {
  const selection = selectionOf(editor)
  if (selection === null || selection.isCollapsed !== true) return false
  const focus = selection.focusNode
  if (focus === null || !isInside(editor, focus)) return false
  if (hasTextAfterCaret(focus, selection.focusOffset)) return false
  const block = focusBlock(editor, focus)
  if (block === null || !blockEndsWithLineBreak(block)) return false
  return onlyManagedAfterCaret(editor, focus, selection.focusOffset)
}

/**
 * Read `closest` off a value that carries one.
 * @param value - the event target, or any node.
 * @returns the lookup, or null when the value has no `closest` to call.
 */
function closestLookup(value: EventTarget | Node | null): ClosestLookup | null {
  if (value === null || !('closest' in value)) return null
  const lookup: unknown = value.closest
  return typeof lookup === 'function' ? lookup as ClosestLookup : null
}

/**
 * The composer draft an event came from, resolved through the event target
 * exactly as remote resolves the field it rewrites.
 * @param doc - the document this effect was installed for.
 * @param target - the event target.
 * @returns the `[data-composer-input]` element, or null for any other target.
 */
function draftOf(doc: Document, target: EventTarget | null): Element | null {
  const draft = closestLookup(target)?.(COMPOSER_INPUT_SELECTOR) ?? null
  if (draft === null) return null
  // A draft outside this effect's own document is not this composer.
  return doc.contains(draft) ? draft : null
}

/**
 * Send the draft when a plain Enter arrives on the mobile layer while the draft
 * already ends with a linebreak.
 *
 * The listener runs in the capture phase on `window`, ahead of remote's
 * `document` capture handler, and only an actionable event is suppressed: an
 * ignored Enter is left untouched, so a first Enter still inserts the newline.
 * @param doc - document to read the composer and its selection from.
 * @param win - window to gate the viewport on and to attach the listener to.
 * @returns disposer removing the listener.
 */
export function installMobileComposerEnter(doc: Document, win: Window): () => void {
  const onKeyDown = (event: Event): void => {
    const pressed = event as KeyboardEvent
    try {
      if (!isMobileComposerViewport(win)) return
      const draft = draftOf(doc, event.target)
      const seat = draft === null ? null : draft.closest(COMPOSER_SEAT_SELECTOR)
      const sendButton = seat === null ? null : resolvePrimarySendButton(seat)
      const action = resolveComposerEnterAction({
        key: pressed.key,
        shiftKey: pressed.shiftKey,
        ctrlKey: pressed.ctrlKey,
        altKey: pressed.altKey,
        metaKey: pressed.metaKey,
        keyCode: pressed.keyCode,
        isComposing: pressed.isComposing,
        repeat: pressed.repeat,
        insideDraft: draft !== null,
        draftEndsWithLineBreak: draft === null ? false : draftEndsWithLineBreak(draft),
        sendButton,
      })
      // The decision is `send` only with a resolved button; the second half of
      // the test keeps the click below typed and total.
      if (action !== 'send' || sendButton === null) return
      event.preventDefault()
      event.stopPropagation()
      sendButton.click()
    } catch {
      // A half-rendered composer must never throw into the page: an Enter that
      // cannot be decided stays a newline.
    }
  }
  try {
    win.addEventListener('keydown', onKeyDown, true)
  } catch {
    // A window without events installs nothing, and nothing needs removing.
    return () => {}
  }
  return () => {
    try {
      win.removeEventListener('keydown', onKeyDown, true)
    } catch {
      // Detached from a window that no longer accepts listeners: already gone.
    }
  }
}
