/**
 * Header model badge stylesheet.
 *
 * Injected as one `<style data-plugin="dsh-better-ui-ux">` element rather than
 * shipped as a CSS Module: a dynamic plugin bundle has no static stylesheet edge,
 * and the shell's bundler never sees this package. The element is appended to
 * `document.head`, so the semantic `--dsw-*` aliases resolve against whichever
 * palette class is active on the theme root at read time, and every value
 * here is one of those aliases rather than a literal colour.
 *
 * The hook is idempotent: two activations (an HMR reload, or a second mount in the
 * same document) share the one element instead of stacking copies.
 *
 * The sheet also owns the mobile gate for the subscription usage pill. That pill
 * (from `dsh-plugin-subscriptions`) renders into the host stats row
 * (`[data-composer-stats]`) as a `button[aria-haspopup="dialog"]` with no stable
 * class, so the rule keys on the global `data-dsh-codex-usage` attribute this
 * plugin maintains: `hidden` hides the pill, any other state (or desktop, where
 * the attribute is removed) leaves it untouched.
 *
 * The sheet also carries the compact-picker `_standardControls` anchor, moved
 * here from the `vjcspy/dsh-web` fork of `@linxin666/dsh-remote-web-ui`
 * (fork commit `5ad72861`): see `compactPickerControls.ts` for the rule text,
 * its coupling to remote's private geometry, and the re-measure guidance.
 *
 * The sheet also owns the mobile composer's measurement fix. Remote's mobile
 * layer sizes `_trailing` from the row's content width (`flex-basis:100%`) and
 * then adds 38px + 78px of padding, while core pins `flex-shrink:0`
 * (`InputBar.module.css`) — a 116px overhang, resolved by the transcript's own
 * scroll body as a horizontal scroll. Switching that one box to `border-box`
 * keeps remote's intent (a full-width trailing line reserving the send button's
 * corner) and changes only how the box is measured. Its keydown twin is
 * `mobileComposerEnter.ts`, under the same `MOBILE_MAX_WIDTH` bound.
 *
 * The sheet lastly owns the two-tier title-row shed (`TITLE_ROW_SHED`), which is
 * what keeps the Session name readable on a phone. Why a container query: on a
 * phone the box that runs out of width is the header's title row, not the
 * viewport, so both tiers are `@container` blocks keyed on core's own
 * `[class$="_titleRow"]` — an anonymous `inline-size` container
 * (`ConversationRoot.module.css`) that already carries core's parallel rule for
 * its own occupant, `AgentPresetLabel.module.css` hiding a 180px passive label at
 * `@container (max-width: 540px)` under the doctrine "the preset is passive
 * chrome, so it yields before any interactive header action loses its label".
 * Our badges sit inside that same container (`.headerActions` is a child of the
 * row), and `@linxin666/dsh-remote-web-ui` declares no container of its own (zero
 * `container-type`, zero `@container` over its installed source), so the nearest
 * query container for them is core's row. Keying on the row rather than on
 * viewport conditions is also what survives that layer's per-session
 * force-desktop escape (`mobile-adapt.ts`), where a media query would still fire.
 *
 * Measured phone budget, which is where the two thresholds come from. `.header`'s
 * second grid column is `minmax(0, 1fr)` with `padding: 10px 28px 0 20px`, so a
 * 390px viewport leaves the title row 342px; remote's mobile layer removes another
 * 52px of left padding whenever the sidebar rail is collapsed — the normal phone
 * state — leaving 290px. On a phone in portrait {@link MOBILE_HEADER_OVERRIDE}
 * lowers that padding from 52px to 28px (the rail button sits in a 28px gutter), so
 * the row is viewport − 76px there: 314px at 390 and 354px at 430, the largest
 * mainstream phone class. The ends reachable outside that override stay
 * viewport − 100px with remote's rule active (290px at 390, 330px at 430) and
 * viewport − 48px wherever it is not in force (the layer's own force-desktop
 * escape, or the layer disabled): 342px at 390 and 382px at 430.
 * That last figure is why the hide threshold is 460px and not 380px — a 380px
 * threshold would miss 382px by 2px and silently drop the whole phone fix in that
 * state — while 460px still sits far below the 540px where core sheds its own
 * occupant. The thresholds are unchanged by the override: its 314px and 354px rows
 * are still under both 620px and 460px, so both tiers keep firing on a phone.
 *
 * Two Session states, one fix. With a single tab our badges are `flex: none`
 * siblings of the name, and one 234px badge (220 content + 12 padding + 2 border,
 * the plugin default content-box) leaves the name ~26px of a 290px row: the
 * reported "tên không hiện đủ". With several tabs remote takes that same actions
 * box out of flow, paints it over the tabs row and reserves its measured width
 * there, which instead leaves core's own 220px `.crumb` cap as the only thing
 * truncating the name. On a phone in portrait that seat is now neutralized by
 * {@link MOBILE_HEADER_OVERRIDE}, so the multi-tab state behaves like the single-tab
 * one: the actions box stays in flow inside the title row. The hide tier removes our width from both states: it gives
 * the name back core's cap in the single-tab state (and the crumb rule below
 * releases that cap), and it empties the painted box, so the tabs row's reserve
 * falls from ~242px to the empty box's ~8px.
 *
 * Truncation lives on an inner element. Both badges are `inline-flex` whose only
 * content was a bare text node — an anonymous flex item — and `text-overflow` is
 * defined for block containers, so a capped badge hard-clipped mid-token with no
 * ellipsis. A flex item is blockified, so `MODEL_BADGE_TEXT_CLASS` and
 * `SUBAGENT_TYPE_BADGE_TEXT_CLASS` are real block containers and own the ellipsis
 * while the badge keeps its cap.
 *
 * The provider yields before the model. Once the badge is narrower than the route
 * an end-ellipsis would print `dsh-opencode-go/deep…` — the provider is the
 * constant half of the text and the model id is the half that identifies the route
 * — so every tier that caps the badge hides the provider element, including its
 * `/` separator. `title` and `aria-label` keep the full route in every tier.
 *
 * A child keeps a compact badge. An addressed child's composer renders no model
 * control (`ui-model-selection`: `available = sessions.subagentAddress(sessionId)
 * === undefined`, and `ModelSelect` returns null without it), so this header badge
 * is the only place that child's route is visible; it therefore survives the phone
 * tier as a 128px content box — 142px border-box of a ~290px row, leaving the
 * child's own title ~118px — marked by `data-dsh-child` on our own element. The
 * subagent-type badge yields instead, because the fact it shows is also on the
 * lineage slot's own UI.
 *
 * The crumb rule lists ONE suffix and governs root Sessions only.
 * `[class$="_crumbCurrent"]` is unconditional and last in the current crumb's class
 * list (`ConversationSession.tsx`), so its attribute always ends there, while
 * `[class$="_crumb"]` and `[class$="_crumbSubagent"]` can only ever match the
 * ancestor navigation buttons, which stay capped. For a child Session the visible
 * title is the lineage switcher and its own `max-width`, not this crumb. Above the
 * phone tier core's 220px cap still applies; raising it there is a core change and
 * a separate task.
 *
 * Accepted noise: the cluster's 10px gap survives an empty actions box on a phone
 * row, because our badges are hidden with CSS and stay DOM children while
 * `.headerActions` has no `:empty` rule. Reshaping a seat other plugins also
 * occupy would be the worse trade for ~3% of the row.
 *
 * The sheet also owns the phone-portrait header fix ({@link MOBILE_HEADER_OVERRIDE}).
 * `@linxin666/dsh-remote-web-ui` 0.4.8 seats the whole `_headerActions` box with
 * `position:absolute` plus an additive inline `translate`: its `alignActionsText`
 * parses the current translate and adds the difference to a text bottom measured
 * against core's agent-preset label, which core hides at a narrow row, so the
 * measurement is 0 and every header mutation (the chevron flip on a tap included)
 * pushes the box down again; the "N subagents" trigger floated over the transcript
 * and jumped on tap. The fix puts the box back in flow (`position:static`,
 * `transform:none`), hides the Chat/Trajectory tabs row while the FIRST tab is the
 * selected one (a non-first view reveals it again, so a phone user is never stranded
 * in Trajectory, whose view is persisted per conversation), drops core's 76px header
 * floor in that state, and pins remote's floating "Open sidebar" button (the whale)
 * into the title-row gutter as the same 28px ghost panel-icon button the right
 * sidebar toggle uses. Exactly three declarations are `!important`, because remote
 * writes them as inline styles and only an author `!important` beats inline: the
 * `transform` on `_headerActions`, and `left` and `top` on the whale (remote writes
 * them on every `pointermove`). Everything else wins on specificity, and the whale's
 * `display` is deliberately NOT important so remote's inline `display:none` while the
 * sidebar is open still hides it. The gate is the media query that mirrors remote's
 * `isMobilePortrait()` rather than its body classes (renamed once already); only the
 * rail-padding rule keys on `dsh-remote-rail-hidden`, because it overrides remote's
 * rule of that very class. `:has()` cannot nest inside `:has()`, hence the top-level
 * `:not(:has(...))` forms.
 *
 * Recheck duty: every number here is measured geometry, not a constant of nature.
 * A `@linxin666/dsh-remote-web-ui` bump must re-check its 52px rail padding, its
 * re-seat of `_headerActions` (the `dsh-remote-header-seated` gate) and the
 * `--dsh-remote-header-actions-reserve` it applies to the tabs row, the whale's id
 * `#dshRemoteWhale` and its inline `left`/`top` writes, and the first-tab selector
 * (`[role="tab"][aria-selected="true"]:not(:first-child)`), alongside the
 * outstanding compact-picker item of 2026-10-12.
 */

import { CODEX_USAGE_ATTR, MOBILE_MAX_WIDTH } from './codexUsageVisibility.ts'
import { COMPACT_PICKER_CONTROLS_SHEET } from './compactPickerControls.ts'

/** Element id of the injected stylesheet. */
const STYLE_ELEMENT_ID = 'dsh-better-ui-ux-styles'

/** Badge root class. Its position also anchors the injected rules. */
export const MODEL_BADGE_CLASS = 'dsh-model-badge'

/** Pending-marker class, for the part of the label the badge adds itself. */
export const MODEL_BADGE_MARKER_CLASS = 'dsh-model-badge-marker'

/**
 * Subagent-type badge class.
 *
 * It shares the badge chrome with {@link MODEL_BADGE_CLASS} through the shared
 * selector list below rather than by reusing that class name: two registrations
 * on one seat must stay independently addressable, and the pair reads as one
 * visual family because it is literally one rule.
 */
export const SUBAGENT_TYPE_BADGE_CLASS = 'dsh-subagent-type-badge'

/**
 * Inner text element of {@link MODEL_BADGE_CLASS}.
 *
 * It exists so a cap can ellipsize: the badge's content used to be a bare text
 * node, i.e. an anonymous flex item, and `text-overflow` is defined for block
 * containers — a capped badge hard-clipped mid-token with no ellipsis. A flex item
 * is blockified, so this element is a real block container and owns the
 * truncation, while the badge keeps its own cap.
 */
export const MODEL_BADGE_TEXT_CLASS = 'dsh-model-badge-text'

/**
 * The provider half of the route, inside {@link MODEL_BADGE_TEXT_CLASS}.
 *
 * It carries the `/` separator too, so hiding it leaves the model id alone: once
 * the badge is narrower than the route, the provider is the constant half of the
 * text and the model is the half that identifies the route. Every tier that caps
 * the badge hides this element; `title` and `aria-label` keep the full route.
 */
export const MODEL_BADGE_PROVIDER_CLASS = 'dsh-model-badge-provider'

/**
 * Inner text element of {@link SUBAGENT_TYPE_BADGE_CLASS}, for the same reason as
 * {@link MODEL_BADGE_TEXT_CLASS}.
 */
export const SUBAGENT_TYPE_BADGE_TEXT_CLASS = 'dsh-subagent-type-badge-text'

/**
 * Title-row width at which both badges drop to {@link BADGE_SHRINK_MAX_WIDTH}.
 *
 * Between this and core's own 540px shed, the worst-case occupant set is a 180px
 * preset label + 8px + 142px badge + 8px + 142px badge = ~480px, leaving the name
 * ~140px on a wide row instead of the 0px a 234px badge would leave. Above the
 * tier nothing changes.
 */
const TITLE_ROW_SHRINK_MAX_WIDTH = 620

/**
 * Title-row width at which the badges leave the row (a child keeps a compact
 * model-only box).
 *
 * Set by the largest mainstream phone class, 430px, in the configuration where
 * remote's 52px rail padding is not in force: 430 − 48 = 382px. A 380px threshold
 * would miss that by 2px, and a 540px one would leave the 220px badge on every
 * phone narrower than 540px — the reported case.
 */
const TITLE_ROW_HIDE_MAX_WIDTH = 460

/** Content-width cap for a badge inside the shrink tier (142px border-box). */
const BADGE_SHRINK_MAX_WIDTH = 132

/** Content-width cap for the compact child badge inside the hide tier (142px border-box). */
const BADGE_CHILD_MAX_WIDTH = 128

/**
 * The mobile composer override, gated on the conditions remote's own mobile
 * layer keys on (`orientation: portrait` + `pointer: coarse` + a viewport
 * narrower than {@link MOBILE_MAX_WIDTH}) rather than on remote's active-state
 * body class, which 0.4.5 renamed. The `html body` prefix is a defensive
 * tiebreaker against a future remote rule, not a precedence requirement: no rule
 * in either sheet sets `box-sizing` on `_trailing` today, so the declaration
 * already wins. No `!important`.
 */
const MOBILE_COMPOSER_OVERRIDE = `@media (orientation:portrait) and (pointer:coarse) and (max-width:${MOBILE_MAX_WIDTH - 0.02}px){html body [class$="_composerSeat"] [class$="_trailing"]{box-sizing:border-box}}`

/**
 * Core's right-sidebar toggle icon (a 16px panel outline with a left rail), measured on
 * the live page, URL-encoded for the CSS mask of the whale button.
 */
const PANEL_ICON = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#000" stroke-width="1"><path d="M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z"/><path d="M5.5 1.5V14.5"/></svg>',
)

/**
 * The phone-portrait header fix; see the file header for what remote does and why.
 *
 * Gated on the same three conditions as {@link MOBILE_COMPOSER_OVERRIDE}. Compact
 * formatting, one rule per line. The three `!important` declarations are the minimum
 * inline-style forces: remote writes `transform` on `_headerActions` and `left`/`top`
 * on the whale as inline styles, which beat any selector. The remaining rules win by
 * specificity over remote's: (0,4,2) over its (0,4,1) seat, (0,3,2) over its (0,3,1)
 * tabs cap and (0,2,1) rail padding, (1,0,2)/(1,0,3) over its whale rules, so the
 * fragment needs no ordering help. The whale's `display` carries no `!important`: remote hides
 * it with an inline `display:none` while the sidebar is open.
 */
const MOBILE_HEADER_OVERRIDE = `@media (orientation:portrait) and (pointer:coarse) and (max-width:${MOBILE_MAX_WIDTH - 0.02}px){
html body [class$="_header"] [class$="_titleRow"] > [class$="_titleCluster"] > [class$="_headerActions"]{position:static;transform:none !important}
html body [class$="_header"] [class$="_tabs"][role="tablist"]{max-width:none}
html body [class$="_header"] [class$="_tabs"][role="tablist"]:not(:has(> [role="tab"][aria-selected="true"]:not(:first-child))){display:none}
html body [class$="_header"]:has(> * > [class$="_titleRow"]):not(:has([role="tab"][aria-selected="true"]:not(:first-child))){min-height:0;padding-bottom:10px}
html body.dsh-remote-rail-hidden [class$="_header"] [class$="_titleRow"]{padding-left:28px}
html body #dshRemoteWhale{left:calc(12px + env(safe-area-inset-left)) !important;top:calc(11px + env(safe-area-inset-top)) !important;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;min-width:28px;border:0;border-radius:8px;background:transparent;box-shadow:none;color:var(--dsw-alias-label-secondary)}
html body #dshRemoteWhale > svg{display:none}
html body #dshRemoteWhale::before{content:"";width:16px;height:16px;background-color:currentColor;-webkit-mask:url("data:image/svg+xml,${PANEL_ICON}") center/16px 16px no-repeat;mask:url("data:image/svg+xml,${PANEL_ICON}") center/16px 16px no-repeat}
}`

/**
 * The two-tier title-row shed.
 *
 * Compact formatting mirroring {@link MOBILE_COMPOSER_OVERRIDE}; the numeric
 * thresholds are the named constants above, and the class names are spelled out so
 * the emitted text is greppable in the built artifact. `html body` is the same
 * defensive tiebreaker the override uses, never a specificity requirement: the
 * tier-1 cap ties with the base `max-width: 220px` rule, so this fragment must stay
 * AFTER those base badge rules inside {@link SHEET} — it is appended last, which
 * also puts it after the compact-picker and composer fragments. The child rule
 * needs no order help, because `[data-dsh-child]` out-specifies the plain class.
 *
 * Tier 1 (≤ 620px): both badges cap, and the model badge drops the provider half so
 * what is ellipsized is the model id. Tier 2 (≤ 460px): the badges leave the row,
 * except a child Session's model badge, which stays as a compact model-only box;
 * and core's 220px crumb cap is released for the current crumb, which is the only
 * thing truncating the name whenever the tabs row already exists.
 */
const TITLE_ROW_SHED = `@container (max-width:${TITLE_ROW_SHRINK_MAX_WIDTH}px){html body .dsh-model-badge,html body .dsh-subagent-type-badge{max-width:${BADGE_SHRINK_MAX_WIDTH}px}html body .dsh-model-badge .dsh-model-badge-provider{display:none}}
@container (max-width:${TITLE_ROW_HIDE_MAX_WIDTH}px){html body .dsh-subagent-type-badge{display:none}html body .dsh-model-badge{display:none}html body .dsh-model-badge[data-dsh-child]{display:inline-flex;max-width:${BADGE_CHILD_MAX_WIDTH}px}html body [class$="_crumbs"] [class$="_crumbCurrent"]{max-width:none}}`

/**
 * The deployment's brand-mark suppression.
 *
 * A local build renders the shell's own fish mark in three places — the expanded
 * sidebar brand row (`.brandMark`, whose slot falls back to `FishLogo`), the
 * collapsed rail's resting swap inside the toggle (`.railMark`) and the
 * blank-Session hero headline (`.fishHitbox`, the animated `HeroFish`) — and this
 * deployment shows none of them. Hiding the WRAPPER elements, not only emptying
 * the slots, is what the layout needs: a slot's wrapper stays mounted when its
 * component renders nothing, and `display: none` also drops the box out of the
 * flex line's gap distribution, so the brand text moves to the row's leading edge
 * instead of leaving an 8px / 10px hole.
 *
 * The panel icon is the one rule that ADDS behaviour. `SidebarRoot.module.css`
 * keeps the collapsed toggle's `.panelIcon` at `display: none` and reveals it only
 * on `:hover`, because at rest the rail shows the whale mark instead — so
 * removing that mark has to put the icon back on its own, or the collapsed
 * sidebar's expand affordance disappears until the pointer arrives. The
 * `html body` prefixes carry the specificity to win over the module's
 * `.collapsed .toggle .panelIcon` pair without `!important`, exactly like
 * {@link MOBILE_COMPOSER_OVERRIDE} and {@link TITLE_ROW_SHED}.
 */
const BRAND_LOGO_OVERRIDE = `
html body [class$="_brandIdentity"] [class$="_brandMark"]{display:none}
html body [class$="_toggle"] [class$="_railMark"]{display:none}
html body [class$="_collapsed"] [class$="_toggle"] [class$="_panelIcon"]{display:inline}
html body [class$="_headline"] [class$="_fishHitbox"]{display:none}`

/** The stylesheet text. One rule block per class, no nesting. */
const SHEET = `
.${MODEL_BADGE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 220px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-fill-tsp-secondary);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 22px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.${SUBAGENT_TYPE_BADGE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 220px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-fill-tsp-secondary);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 22px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.${MODEL_BADGE_MARKER_CLASS} {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}
.${MODEL_BADGE_TEXT_CLASS} {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${SUBAGENT_TYPE_BADGE_TEXT_CLASS} {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:root[${CODEX_USAGE_ATTR}="hidden"] [data-composer-stats] button[aria-haspopup="dialog"] {
  display: none !important;
}
@supports selector(:has(*)) {
  :root[${CODEX_USAGE_ATTR}="hidden"] [data-composer-stats] span:has(> button[aria-haspopup="dialog"]) {
    display: none !important;
  }
}
${COMPACT_PICKER_CONTROLS_SHEET}${MOBILE_COMPOSER_OVERRIDE}${TITLE_ROW_SHED}${BRAND_LOGO_OVERRIDE}${MOBILE_HEADER_OVERRIDE}`

/**
 * Append the badge stylesheet once per document.
 * @param doc - document to install into.
 */
export function installModelBadgeStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ELEMENT_ID) !== null) return
  const element = doc.createElement('style')
  element.id = STYLE_ELEMENT_ID
  element.setAttribute('data-plugin', 'dsh-better-ui-ux')
  element.textContent = SHEET
  doc.head.append(element)
}
