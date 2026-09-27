/**
 * Compact-picker `_standardControls` anchor.
 *
 * `@linxin666/dsh-remote-web-ui`'s compact-picker mode
 * (`body.dsh-remote-compact-picker`, set on portrait + coarse pointer +
 * `innerWidth < 1100`) collapses the composer's `_trailing` box to zero width
 * and re-anchors only its own ring and send button (remote `mobile-adapt.ts`
 * compact rules: send sits at `right:8px`, the ring at `right:44px`). Every
 * other `conversation.input.right` occupant that host renders inside
 * `_standardControls` — the OpenCode Go usage pill, or any other plugin
 * control — stays `position:static` inside that zero-width box and overflows
 * past the composer card.
 *
 * These two rules absolutely position `_standardControls` clear of send
 * (`right:48px`), or clear of the ring when a ring sits directly inside
 * `_trailing` (`right:80px`, the `:has()` branch below). They are inert
 * without remote's body class: on desktop, in landscape, or with remote
 * absent/disabled, neither selector matches and layout is untouched.
 *
 * Provenance: verbatim from `vjcspy/dsh-web` fork commit `5ad72861`
 * (`packages/dsh-remote-web-ui/src/client/mobile-adapt.ts:229-230` on
 * `develop`). Moved here so the fix ships with our own plugin instead of a
 * fork of a third-party package — see
 * `resources/workspaces/k/dsh/dsh-better-ui-ux/_plans/260927-compact-picker-controls-anchor.md`.
 *
 * Coupling — these selectors key on remote's *private* CSS-module suffixes
 * (`_composerSeat`, `_trailing`, `_standardControls`, `_root`, `_track`) and on
 * geometry remote owns, not on a published contract. A `@linxin666/dsh-remote-web-ui`
 * version bump can change either silently. Re-measure at 393px and 375px
 * portrait touch (occupant span clear of send and tools; `_standardControls`
 * computed `position:absolute`) whenever that package is bumped — see this
 * plugin's README "Known limitations" entry.
 *
 * The `right:80px` ring-in-trailing branch is dormant on the current host: the
 * only ring (`ContextMeter`'s `_root` wrapping a `_track` circle) renders in
 * the composer dock, a sibling of `_trailing`, not a direct child of it. The
 * branch is kept verbatim for fork parity and is covered by a DOM-fixture
 * selector test only, not by measurement. It stays outside `@supports`, like
 * the fork: an engine without `:has()` support simply drops that one rule.
 */

/** The two compact-picker `_standardControls` anchor rules, verbatim from fork `5ad72861`. */
export const COMPACT_PICKER_CONTROLS_SHEET = `
body.dsh-remote-compact-picker [class$="_composerSeat"] [class$="_trailing"] > [class$="_standardControls"]{position:absolute;right:48px;top:50%;transform:translateY(-50%)}
body.dsh-remote-compact-picker [class$="_composerSeat"] [class$="_trailing"]:has(> [class$="_root"]:has([class$="_track"])) > [class$="_standardControls"]{right:80px}
`
