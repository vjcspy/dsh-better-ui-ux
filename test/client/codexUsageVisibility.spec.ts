/**
 * Mobile gate for the subscription usage pill.
 *
 * On mobile the Codex usage pill is hidden by default and shown only while the
 * shown Session runs a `codex` route; desktop clears the marker so nothing
 * changes there. These cases pin the pure decision plus the document marking,
 * using stub documents so no real DOM is needed.
 */
import { describe, expect, it } from 'vitest'

import {
  CODEX_USAGE_ATTR,
  applyCodexUsageState,
  isMobileViewport,
  resolveCodexUsageState,
  syncCodexUsageVisibility,
} from '../../src/client/codexUsageVisibility.ts'

/** Minimal `<html>` stand-in recording attributes. */
function stubDocument(): { doc: Document; attrs: Record<string, string> } {
  const attrs: Record<string, string> = {}
  const doc = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attrs[name] = value
      },
      removeAttribute: (name: string) => {
        delete attrs[name]
      },
    },
  }
  return { doc: doc as unknown as Document, attrs }
}

/** Minimal window stand-in for one viewport shape. */
function stubWindow(matchesCoarse: boolean, innerWidth: number): Window {
  return {
    innerWidth,
    matchMedia: (query: string) => ({ matches: query.includes('coarse') ? matchesCoarse : false }),
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Window
}

describe('codex usage visibility gate', () => {
  it('shows Codex on mobile, hides anything else, clears on desktop', () => {
    expect(resolveCodexUsageState(true, 'codex')).toBe('shown')
    expect(resolveCodexUsageState(true, 'deepseek-official')).toBe('hidden')
    expect(resolveCodexUsageState(true, null)).toBe('hidden')
    expect(resolveCodexUsageState(true, undefined)).toBe('hidden')
    expect(resolveCodexUsageState(false, 'deepseek-official')).toBe('shown')
  })

  it('treats only coarse narrow viewports as mobile', () => {
    expect(isMobileViewport(stubWindow(true, 390))).toBe(true)
    expect(isMobileViewport(stubWindow(true, 1400))).toBe(false)
    expect(isMobileViewport(stubWindow(false, 390))).toBe(false)
  })

  it('marks hidden on mobile for a non-Codex route', () => {
    const { doc, attrs } = stubDocument()
    syncCodexUsageVisibility(doc, stubWindow(true, 390), 'deepseek-official')
    expect(attrs[CODEX_USAGE_ATTR]).toBe('hidden')
  })

  it('marks shown on mobile for a Codex route', () => {
    const { doc, attrs } = stubDocument()
    syncCodexUsageVisibility(doc, stubWindow(true, 390), 'codex')
    expect(attrs[CODEX_USAGE_ATTR]).toBe('shown')
  })

  it('removes the marker on desktop so the layout is untouched', () => {
    const { doc, attrs } = stubDocument()
    applyCodexUsageState(doc, 'hidden')
    syncCodexUsageVisibility(doc, stubWindow(false, 1400), 'deepseek-official')
    expect(CODEX_USAGE_ATTR in attrs).toBe(false)
  })
})
