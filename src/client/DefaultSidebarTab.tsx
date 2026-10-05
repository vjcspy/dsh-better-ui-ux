/**
 * The new-Session default for the right sidebar: open the Files panel.
 *
 * Renders nothing. It is an effect carrier, not a surface: the right column has
 * no configuration key that selects a default panel, and the host only chooses
 * a page on the column's **first expansion**, where a deployment holding more
 * than one guide entry always lands on the guide page. Opening the page is
 * therefore the only route to the requested default, and `openTab` reveals the
 * column and activates the page in the same step — so no expand call is made
 * beside it, which would risk collapsing the column again.
 *
 * The seat is a composer overlay, not the conversation header, and that is
 * load-bearing rather than incidental: the header's actions seat renders only
 * inside the conversation chrome, and the chrome is suppressed for exactly the
 * Session this targets — a blank one. On the header seat the effect would fire
 * on the first prompt submit instead of when the Session opens, and could lose
 * that race to the host accepting the prompt.
 *
 * Blank, parentless and non-subagent is the client layer's own definition of a
 * New Session, so no heuristic re-derives it; the layout guard on top covers
 * the reuse case, where New Session lands on an existing blank row whose column
 * the Human may already have opened or collapsed.
 *
 * The decision is taken in the render pass and carried out in a microtask of the
 * same commit. That is what the host's own timing contract asks for — `mounted`
 * moves before React renders the session change, and the Session's sidebar store
 * is minted in that same commit — and it is the only form available here: this
 * half must request nothing but the shell's JSX runtime, whose module table holds
 * no hook, so an effect hook cannot be imported (see `tsdown.config.ts` and the
 * baseline-specifier case in `test/client/client-bundle.spec.ts`). The microtask
 * runs after the commit that rendered it, never during the render.
 *
 * Nothing is remembered between renders, deliberately: the opener re-reads the
 * column's own state inside the microtask and the host dedupes a page that is
 * already open, so a second scheduled open is a no-op rather than a duplicate.
 * The per-Session mark that used to stand here had to hold a Session id, and a
 * Session id is a branded string at run time — a value no `WeakSet` can hold and
 * a `Set` could only grow with. A deployment where the open keeps failing
 * therefore warns once per render rather than once per Session, which is the
 * honest signal: the panel is still not open.
 *
 * Every guard fails towards doing nothing: a cosmetic default must never break
 * the composer. The warning in the open callback is deliberate rather than
 * noise — it is the only runtime signal that separates a throwing call from a
 * guard that skipped.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { PropsRuntime, SessionStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: declares the `sidebarRight` navigation face this effect drives.
import type { ISidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
// Type-only: pulls the session standard seats (`sessionId`, the list hook) and
// the session list row table into this program.
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the ui-conversation SlotMap merge (the composer overlay seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'

import { FILES_TAB_KIND, NARROW_VIEWPORT_PX, PLUGIN_ID } from '../constants.ts'

/** Registration-side business face. */
export interface DefaultSidebarTabInjected {
  /**
   * Resolve the opener for one Session, or nothing when it must stay untouched.
   *
   * Built by the registration over the sidebar service the scoped child context
   * resolves, so this module never reads that service off a context and never
   * names it at run time.
   */
  readonly resolveFilesOpener: (sessionId: SessionId) => (() => void) | undefined
}

/** Full component props. */
export type DefaultSidebarTabProps =
  PropsRuntime<'conversation.input.overlay'>
  & SessionStandardProps
  & DefaultSidebarTabInjected

/**
 * Build the opener over the sidebar face one resolved context carries.
 *
 * The sidebar guards live here rather than at the call site, because this is
 * where the face is readable: a composer seat renders for whatever Session it is
 * given, not only the one on screen, and opening a page acts on the on-screen
 * Session alone.
 * @param ctx - the scoped client context owning the resolved sidebar service.
 * @returns a resolver yielding the opener for an accepted Session.
 */
export function createOpenFilesByDefault(ctx: ClientContext): (sessionId: SessionId) => (() => void) | undefined {
  return (sessionId) => {
    const sidebarRight: ISidebarRight | undefined = ctx.sidebarRight
    if (sidebarRight === undefined) {
      console.warn(`${PLUGIN_ID}: the right sidebar is absent, so the ${FILES_TAB_KIND} panel was not opened by default`)
      return undefined
    }
    // A composer seat renders for whatever Session it is given, not only the one
    // on screen, and opening a page acts on the on-screen Session alone.
    if (sidebarRight.mounted.getSnapshot() !== sessionId) return undefined
    // Any remembered layout — expanded, or collapsed while holding tabs — is the
    // Human's, and stays untouched.
    if (sidebarRight.isExpanded() || sidebarRight.active() !== undefined) return undefined
    return () => {
      // Re-read rather than trust the render-time answer: the column can be
      // opened or collapsed by anyone between the render and this microtask.
      if (sidebarRight.mounted.getSnapshot() !== sessionId) return
      if (sidebarRight.isExpanded() || sidebarRight.active() !== undefined) return
      try {
        sidebarRight.openTab(FILES_TAB_KIND)
      } catch (error: unknown) {
        // A deployment with no `files` page, or a Session whose sidebar store was
        // never adopted, must leave the composer working; this line is what makes
        // that case visible instead of silent.
        console.warn(`${PLUGIN_ID}: could not open the ${FILES_TAB_KIND} panel by default`, error)
      }
    }
  }
}

/**
 * Keep a new Session's right column on its default page.
 *
 * The decision reads both the shown Session and the derived new-Session flag
 * together, so a row that only lands after the Hero's first render still
 * triggers it. The sidebar handle reaches this component only through the
 * injected resolver, which closes over the scoped child context that resolved it.
 * @param props - composed slot props, including the session list selector seat.
 * @returns nothing; this component has no surface.
 */
export function DefaultSidebarTab({ useSessions, sessionId, resolveFilesOpener }: DefaultSidebarTabProps): ReactNode {
  const isNewTopLevelSession = useSessions((state) => {
    const row = state.byId[sessionId]
    return row !== undefined && row.blank && row.parentId === undefined && row.origin !== 'subagent'
  })

  // Below this width the column is a full-width drawer, where forcing it open is
  // a regression rather than a default.
  const wideEnough = typeof window === 'undefined' ? false : window.innerWidth >= NARROW_VIEWPORT_PX
  if (isNewTopLevelSession && wideEnough) {
    const open = resolveFilesOpener(sessionId)
    if (open !== undefined) {
      // Deferred out of the render pass: the caller acts on another store, and a
      // render-phase write there would re-enter React's own render. No mark is
      // kept: a second microtask for the same Session re-reads the column's own
      // state and finds the page already open.
      queueMicrotask(open)
    }
  }

  return null
}
