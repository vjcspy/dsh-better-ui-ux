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
 * The mobile composer override, gated on the conditions remote's own mobile
 * layer keys on (`orientation: portrait` + `pointer: coarse` + a viewport
 * narrower than {@link MOBILE_MAX_WIDTH}) rather than on remote's active-state
 * body class, which 0.4.5 renamed. The `html body` prefix is a defensive
 * tiebreaker against a future remote rule, not a precedence requirement: no rule
 * in either sheet sets `box-sizing` on `_trailing` today, so the declaration
 * already wins. No `!important`.
 */
const MOBILE_COMPOSER_OVERRIDE = `@media (orientation:portrait) and (pointer:coarse) and (max-width:${MOBILE_MAX_WIDTH - 0.02}px){html body [class$="_composerSeat"] [class$="_trailing"]{box-sizing:border-box}}`

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
:root[${CODEX_USAGE_ATTR}="hidden"] [data-composer-stats] button[aria-haspopup="dialog"] {
  display: none !important;
}
@supports selector(:has(*)) {
  :root[${CODEX_USAGE_ATTR}="hidden"] [data-composer-stats] span:has(> button[aria-haspopup="dialog"]) {
    display: none !important;
  }
}
${COMPACT_PICKER_CONTROLS_SHEET}${MOBILE_COMPOSER_OVERRIDE}`

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
