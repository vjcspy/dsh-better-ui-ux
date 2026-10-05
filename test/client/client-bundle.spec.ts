/**
 * Built-artifact contract for the browser half.
 *
 * `lib/client.js` must exist, hand its factory to the shell's module loader with
 * the package id, export only what cordis loading needs, request nothing outside
 * the shell's baseline module table, and — when that `apply` runs — register the
 * badge's dictionary, its stylesheet, and the header action that renders the
 * Session's model route.
 *
 * The spec reads the BUILT bundle, so `build:client` must have run first; the
 * package's `test` script builds it before invoking vitest.
 */
import type { Context } from '@deepseek-ai/cordis'

import { existsSync, readFileSync, statSync } from 'node:fs'

import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  HEADER_ACTIONS_SLOT,
  HEADER_ACTION_ORDER,
  LOCALE_NAMESPACE,
  PLUGIN_ID,
  SUBAGENT_TYPE_ACTION_ID,
  SUBAGENT_TYPE_ACTION_ORDER,
  SUBAGENT_TYPE_LOCALE_NAMESPACE,
} from '../../src/constants.ts'

const BUNDLE_PATH = 'lib/client.js'
const HOST_ENTRY_PATH = 'lib/index.js'

/**
 * The client baseline: specifiers the shell seeds once and answers from its
 * module table. `PLATFORM_MODULES` in `packages/client/web/src/platform.ts` is
 * the authority; these are the rows this plugin can reach.
 */
const BASELINE_SPECIFIERS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

/** One slot entry as the seat receives it. */
interface RegisteredEntry {
  options: { name: string; id?: string; order?: number; locale?: string; inject?: () => unknown }
  component: unknown
}

/** One locale registration as the locale service receives it. */
interface RegisteredDictionary {
  ns: string
  locale: string
  dict: Readonly<Record<string, string>>
}

interface Registration {
  id: string
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

/** A `<style>` element the bundle created, with the attributes it set. */
interface StyleElement {
  id: string
  plugin: string
  text: string
}

/** Registrations captured from `window.__ModuleLoader__.load`. */
const registrations: Registration[] = []

/** Bare specifiers the bundle asked the shell's module table for. */
const requestedSpecifiers: string[] = []

/** `<style>` elements the stubbed document received. */
const styleElements: StyleElement[] = []

/**
 * Answer one module request from a stand-in module table.
 * @param specifier - the bare specifier the bundle asked for.
 * @returns the module the table would hand back.
 */
function resolveModule(specifier: string): unknown {
  requestedSpecifiers.push(specifier)
  if (specifier === 'react') return React
  if (specifier === 'react/jsx-runtime' || specifier === 'react/jsx-dev-runtime') return JsxRuntime
  throw new Error(`unexpected require(${specifier}) — not a client baseline module`)
}

/**
 * Evaluate the built bundle once, capturing its loader registration.
 * @returns The captured registration for the plugin bundle.
 */
function captureRegistration(): Registration {
  const source = readFileSync(BUNDLE_PATH, 'utf8')
  const loader = { load: (registration: Registration) => { registrations.push(registration) } }
  ;(globalThis as Record<string, unknown>).window = globalThis
  ;(globalThis as Record<string, unknown>).__ModuleLoader__ = loader
  try {
    // `process` is shadowed with `undefined` so the factory runs under browser
    // semantics. Evaluating this source in plain Node is not a browser test:
    // Node has a global `process`, so a dependency reading `process.env.NODE_ENV`
    // resolves here and the factory never throws — while in a real page it throws
    // `ReferenceError: process is not defined`, fails the whole client half, and
    // takes the page down with "Failed to load plugins". Shadowing it makes that
    // failure reproduce in this spec.
    new Function('process', source)(undefined)
  } finally {
    delete (globalThis as Record<string, unknown>).window
    delete (globalThis as Record<string, unknown>).__ModuleLoader__
  }
  const registration = registrations.at(-1)
  if (registration === undefined) throw new Error(`${BUNDLE_PATH} did not call window.__ModuleLoader__.load`)
  return registration
}

/** Minimal element the bundle's stylesheet install touches. */
interface StubElement {
  id: string
  textContent: string
  setAttribute: (name: string, value: string) => void
}

/**
 * A `document` stand-in recording every element the bundle creates.
 *
 * One stand-in serves the whole spec file, because the guard the bundle installs
 * is per DOCUMENT: two independent stand-ins would each legitimately receive one
 * sheet, and the shared-document case is the one worth asserting.
 * @returns the stand-in, plus the created elements.
 */
function createDocumentStub(): { doc: Document; created: StubElement[] } {
  const created: StubElement[] = []
  const head = {
    append: (element: StubElement) => {
      styleElements.push({
        id: element.id,
        plugin: (element as unknown as { attributes: Record<string, string> }).attributes.dataPlugin ?? '',
        text: element.textContent,
      })
    },
  }
  const doc = {
    head,
    getElementById: (id: string) => created.find(element => element.id === id) ?? null,
    createElement: (): StubElement => {
      const attributes: Record<string, string> = {}
      const element: StubElement = {
        id: '',
        textContent: '',
        setAttribute: (name, value) => { attributes[name === 'data-plugin' ? 'dataPlugin' : name] = value },
      }
      Object.defineProperty(element, 'attributes', { value: attributes, enumerable: false })
      created.push(element)
      return element
    },
  }
  return { doc: doc as unknown as Document, created }
}

/** The stub context the built `apply` runs against. */
interface ApplyHarness {
  entries: RegisteredEntry[]
  dictionaries: RegisteredDictionary[]
  run: () => void
  created: StubElement[]
}

/** The one stand-in document every activation in this spec shares. */
const stub = createDocumentStub()

/**
 * Activate the built bundle against a stub context.
 * @param documentOverride - document to install into, defaulting to the shared stub.
 * @returns The harness holding everything the bundle registered.
 */
function activate(documentOverride?: Document): ApplyHarness {
  const bodies: Array<() => unknown> = []
  const created = stub.created
  const harness: ApplyHarness = { entries: [], dictionaries: [], created, run: () => { for (const body of bodies) body() } }
  const ctx = {
    effect: (body: () => unknown) => {
      bodies.push(body)
      return () => {}
    },
    locale: {
      register: (ns: string, locale: string, dict: Readonly<Record<string, string>>) => {
        harness.dictionaries.push({ ns, locale, dict })
        return () => {}
      },
    },
    slots: {
      inject: (_name: string, install: () => void) => {
        install()
        return () => {}
      },
      register: (options: RegisteredEntry['options'], component: unknown) => {
        harness.entries.push({ options, component })
        return () => {}
      },
    },
    /**
     * The scoped child context the sidebar default is wired through. The shell
     * hands a real child context to the callback; here the same stub stands in
     * for it, so the callback's wiring runs and its registration is captured.
     * Assigned after the literal, because the callback is handed this object.
     */
    inject: (_names: readonly string[], body: (scoped: unknown) => void) => {
      body(ctx)
      return () => {}
    },
  }
  ;(globalThis as Record<string, unknown>).document = documentOverride ?? stub.doc
  try {
    ;(pluginExports.apply as (ctx: Context) => void)(ctx as unknown as Context)
    harness.run()
  } finally {
    delete (globalThis as Record<string, unknown>).document
  }
  return harness
}

let pluginExports: Record<string, unknown>

/** Specifiers the bundle requested while its factory materialized. */
let materializationRequests: string[] = []

beforeAll(() => {
  pluginExports = captureRegistration().factory(resolveModule)
  // The factory materializes once, so the requests it makes are a one-time fact:
  // snapshot them before later activations can add to the same list.
  materializationRequests = [...requestedSpecifiers]
})

afterEach(() => {
  // Both the record and the stand-in document reset, so each case starts on an
  // empty page: the install guard keys off the document, not the record.
  styleElements.length = 0
  stub.created.length = 0
})

describe('built Client bundle', () => {
  it('exists and is non-empty', () => {
    expect(existsSync(BUNDLE_PATH)).toBe(true)
    expect(statSync(BUNDLE_PATH).size).toBeGreaterThan(0)
  })

  it('registers under the package id the loader expects', () => {
    expect(registrations.at(-1)!.id).toBe('dsh-better-ui-ux')
    expect(registrations.at(-1)!.id).toBe(PLUGIN_ID)
  })

  it('exports only what cordis loading needs', () => {
    expect(Object.keys(pluginExports).sort()).toEqual(['apply', 'inject'])
    expect(typeof pluginExports.apply).toBe('function')
    expect(pluginExports.inject).toEqual(['slots', 'locale'])
  })

  it('exposes the Host apply entry as a separate artifact', () => {
    expect(existsSync(HOST_ENTRY_PATH)).toBe(true)
    expect(statSync(HOST_ENTRY_PATH).size).toBeGreaterThan(0)
  })

  it('requests only client baseline modules', () => {
    // A request for a package the shell did not seed is a load-time failure, not a
    // degraded badge — so every request must be a row of the baseline table.
    expect(materializationRequests.filter(specifier => !BASELINE_SPECIFIERS.has(specifier))).toEqual([])
    // And the rows this plugin really uses, so the assertion above cannot pass
    // vacuously: one JSX runtime is the shell's, and React itself is reached
    // through it.
    expect(materializationRequests).toContain('react/jsx-runtime')
    expect(materializationRequests).not.toContain('react')
    // Every other input is either type-only (erased) or the plugin's own source.
    expect(materializationRequests).not.toContain('@deepseek-ai/dsh-client-ui-conversation')
    expect(materializationRequests).not.toContain('@deepseek-ai/dsh-client-ui-session')
    expect(materializationRequests).not.toContain('@deepseek-ai/dsh-client-ui-slots')
  })

  it('carries no Node global that a browser page does not define', () => {
    const source = readFileSync(BUNDLE_PATH, 'utf8')
    expect(source).not.toMatch(/\bprocess\s*\./)
    expect(source).not.toMatch(/\brequire\s*\(\s*["']node:/)
  })
})

describe('built Client apply', () => {
  it('registers its dictionary under the namespace its entry declares', () => {
    const harness = activate()
    const dictionary = harness.dictionaries.find(entry => entry.ns === LOCALE_NAMESPACE)
    expect(dictionary).toBeDefined()
    expect(dictionary!.locale).toBe('en')
    expect(dictionary!.dict['marker.next']).toBe('next')
  })

  it('registers a second dictionary for the subagent-type badge', () => {
    const harness = activate()
    const dictionary = harness.dictionaries.find(entry => entry.ns === SUBAGENT_TYPE_LOCALE_NAMESPACE)
    expect(dictionary).toBeDefined()
    expect(dictionary!.locale).toBe('en')
    expect(dictionary!.dict['aria.type']).toBe('Subagent type: {type}')
  })

  it('registers the badge on the session header actions seat at order 0', () => {
    const harness = activate()
    const badge = harness.entries.find(entry => entry.options.id === PLUGIN_ID)
    expect(badge).toBeDefined()
    expect(badge!.options.name).toBe('conversation.session.header.actions')
    expect(badge!.options.name).toBe(HEADER_ACTIONS_SLOT)
    expect(badge!.options.order).toBe(HEADER_ACTION_ORDER)
    expect(badge!.options.order).toBe(0)
    expect(badge!.options.locale).toBe(LOCALE_NAMESPACE)
    expect(typeof badge!.component).toBe('function')
    // The inject face carries no value: the badge reads only the standard session
    // seats, so nothing is threaded from the apply closure.
    expect(badge!.options.inject!()).toEqual({})
  })

  it('registers the subagent-type badge on the same seat, immediately before it', () => {
    const harness = activate()
    const badge = harness.entries.find(entry => entry.options.id === SUBAGENT_TYPE_ACTION_ID)
    expect(badge).toBeDefined()
    expect(badge!.options.name).toBe(HEADER_ACTIONS_SLOT)
    expect(badge!.options.locale).toBe(SUBAGENT_TYPE_LOCALE_NAMESPACE)
    expect(typeof badge!.component).toBe('function')
    expect(badge!.options.inject!()).toEqual({})
    // The seat sorts ascending, so a negative order renders before the model
    // badge at 0 without renumbering the registration that already shipped.
    expect(badge!.options.order).toBe(SUBAGENT_TYPE_ACTION_ORDER)
    expect(badge!.options.order!).toBeLessThan(HEADER_ACTION_ORDER)
  })

  it('injects its stylesheet once, identifying the owning plugin', () => {
    const harness = activate()
    expect(styleElements).toHaveLength(1)
    expect(styleElements[0]!.id).toBe('dsh-better-ui-ux-styles')
    expect(styleElements[0]!.plugin).toBe(PLUGIN_ID)
    // Tokens, not literal colours: the sheet must resolve against the active palette.
    expect(styleElements[0]!.text).toContain('--dsw-alias-label-tertiary')
    expect(styleElements[0]!.text).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    // The compact-picker `_standardControls` anchor moved from the `dsh-web` fork
    // (commit `5ad72861`) must survive the client build unmodified.
    expect(styleElements[0]!.text).toContain(
      'body.dsh-remote-compact-picker [class$="_composerSeat"] [class$="_trailing"] > [class$="_standardControls"]{position:absolute;right:48px;top:50%;transform:translateY(-50%)}',
    )
    expect(styleElements[0]!.text).toContain(
      'body.dsh-remote-compact-picker [class$="_composerSeat"] [class$="_trailing"]:has(> [class$="_root"]:has([class$="_track"])) > [class$="_standardControls"]{right:80px}',
    )
  })

  it('does not stack a second stylesheet when the same document activates twice', () => {
    const shared = createDocumentStub()
    activate(shared.doc)
    activate(shared.doc)
    expect(styleElements).toHaveLength(1)
  })
})
