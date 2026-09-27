# dsh-better-ui-ux

External [Cordis](https://deepseek-harness.github.io/deepseek-harness/) plugin for **DSH Web** that shows the
effective model route (**`provider/model`**) of the Session being viewed in the conversation header — for the main
Session and for every subagent child opened in the main view. It also anchors the composer's
`conversation.input.right` / `conversation.input.model` controls inside the card while
`@linxin666/dsh-remote-web-ui` is in compact-picker mode (see "Compact-picker controls anchor" below), a fix moved
here from the `vjcspy/dsh-web` fork so the fork can retire.

The requirement it answers: clicking into a subagent in the DSH host showed *what it was doing* but never *what it
was running on*. The header now names the route, and the composer keeps owning the switch.

## What it renders and why from where

The badge reads one fact — the shown Session's own **`modelSelection` projection** — through the standard session
seat (`useProjection('modelSelection')`). No RPC, no store, no service, no new extension point in core.

| Projection state | Badge |
| --- | --- |
| `lastUsed` non-null | `provider/model` of the route the latest recorded request consumed |
| `lastUsed` null, `next` non-null | `provider/model` of the `next` route, followed by the localized `next` marker |
| `lastUsed` and `next` both null | nothing (a Session that never selected a route) |
| `useProjection` returns `undefined` | nothing (capability absent, or no baseline/frame yet) |

`next` is the host's `pending ?? lastUsed`, so a **non-null `lastUsed` always wins**: a later selection that no
request has consumed is not what the Session is running. That is the whole point of the surface, and it is why the
badge is not simply a second copy of the composer's label.

The projection is seeded for **every listed Session** and kept current by the control frames the host already
pushes, which is what makes one registrant enough for all four cases: main Session, continuable child, one-shot
child, and Agent Team teammate. The seat is `conversation.session.header.actions` at `order: 0` — after the
subagent catalog (`-30`), Agent Team (`-20`) and the agent-preset label (`-10`), before background jobs (`+20`).

Nothing is switched from the badge, and nothing is read from the model directory: the badge shows the **raw route**,
not a catalog display name (see Known limitations).

## Model Experience

The plugin adds no model-visible input: it reads a projection the host already computes and renders nothing into
the transcript, so prompts, tool results, and KV cache behaviour are unchanged. It costs the page one small
stylesheet and one read-only `<span>` per shown Session.

## Compact-picker controls anchor

`@linxin666/dsh-remote-web-ui` collapses the composer's trailing box to zero width in compact-picker mode
(`body.dsh-remote-compact-picker`: portrait + coarse pointer + `innerWidth < 1100`) and re-anchors only its own ring
and send button. Every other `conversation.input.right` / `conversation.input.model` occupant host renders inside
`_standardControls` — the OpenCode Go usage pill, the model selector, any other plugin control — stayed
`position:static` inside that zero-width box, which is the defect this plugin now fixes.

Two CSS rules, injected as part of the plugin's one `<style id="dsh-better-ui-ux-styles">` element
(`src/client/compactPickerControls.ts`, wired in `src/client/styles.ts`), absolutely position `_standardControls`
clear of send (`right:48px`), or clear of a ring when one sits directly inside the trailing box (`right:80px`). Both
are verbatim from the `vjcspy/dsh-web` fork (commit `5ad72861`) — moved here rather than kept in a fork of a
third-party package, since nothing else in either stylesheet contests the four properties they set. Both rules are
inert without remote's `dsh-remote-compact-picker` body class: desktop and landscape layouts are untouched.

Verified in a container running the **pristine npm** `@linxin666/dsh-remote-web-ui@0.4.3` (no fork), against a live
session's real `conversation.input.right` occupant (OpenCode Go usage pill, `Unavailable` state, no credential
needed):

| Width | Without this rule | With this rule |
| --- | --- | --- |
| 393px portrait touch | `_standardControls` collapses to 0 width, `position:static` | span ≈ [192,322], `position:absolute`, `right:48px` |
| 375px portrait touch | (same collapse) | span ≈ [174,304] |
| 320px portrait touch | (same collapse) | span ≈ [119,249] |
| 1280px desktop | `position:static`, span unchanged | unchanged from without-rule (rule inert) |

Rotation (portrait → landscape → portrait) reproduces the same fixed-state numbers, so the fix does not depend on
remote's sheet re-append order. See "Known limitations" for the coupling this creates and what to re-check on a
`@linxin666/dsh-remote-web-ui` bump.

## Local build

```bash
pnpm install
pnpm run check     # tsc --noEmit across the host, client, and test faces
pnpm test          # builds both halves, then vitest
pnpm run build     # tsc (host) + tsc declarations + tsdown (dynamic client bundle)
```

`pnpm test` builds before it runs, because `test/client/client-bundle.spec.ts` reads the **built** `lib/client.js`
and `lib/index.js` and asserts the artifact contract.

Artifacts: `lib/index.js` (Host half, ESM, built by `tsc`) and `lib/client.js` (dynamic browser bundle, built by
`tsdown`). The client bundle hands its factory to the shell's module loader —
`window.__ModuleLoader__.load({ id: 'dsh-better-ui-ux', factory: (require) => { … } })` — and keeps React's JSX
runtime external, because that row is a `PLATFORM_MODULES` entry (`packages/client/web/src/platform.ts`) the shell
seeds once; a second inlined copy would break hooks. `tsdown.config.ts` states the baseline list explicitly, because
it is hand-rolled and cannot import `PLATFORM_MODULES`. **No `dsh.client.external` and no `dsh.client.inject` entry
exists**: every other input of this plugin is either a type-only import (erased before emit) or its own source.

The Host half is a stub with no configuration: a client bundle is served only for a loader entry with a live Host
fiber, so the half exists to keep the entry real, and the bundle patch ships a row with no `config:` block.

## Install into a DSH profile

```bash
# from the DSH checkout, with the target profile's process stopped
pnpm dsh plugin --profile web add /absolute/path/to/dsh-better-ui-ux
```

The package declares `dsh.bundle.patch` → `cordis.patch.yml`, and that patch's single `insert` row registers the
plugin. Back up the profile's `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml` first, and never hand-edit
the profile manifest.

Verify on a **fresh** process — an already-running host cannot compose a newly installed bundle:

```bash
pnpm dsh web --port 3180 --no-open
```

## Verification

Measured on 2026-09-26 against a second instance (`dsh web --port 3180`) booted on the linked harness checkout
(`0.1.7-rc.2-803e01c`), with the badge read out of the live DOM:

| Case | Observed |
| --- | --- |
| Main Session (route `deepseek-v4.1-flash`) | header renders `opencode-go/deepseek-v4.1-flash`, `aria-label="Current model route: …"` |
| One-shot subagent child opened in the main view | header renders `opencode-go/muse-spark-1.3-contributor` — **a different route from the parent it was opened from**, so the badge follows the *shown* Session, not the opener |
| Switching parent ⇄ child | badge text follows the selection with no reload |
| Cold reload with a child shown | badge restores the same child route from the persisted projection |
| Fresh blank Session | no badge at all (no header yet), and no error in the instance log |
| Second-instance log | no plugin error, no failed-bundle line |

The plugin's client entry was present in the served boot manifest (`__DSH_BOOT__` → `dsh-better-ui-ux`,
`plugins/??dsh-better-ui-ux/client.js`), which is independent evidence that the bundle was mounted rather than
silently dropped.

### Container run (the domain's required verification environment)

The `k/dsh` domain requires plugin verification inside the Docker uplift container, not on the live host
(`resources/workspaces/k/dsh/OVERVIEW.md` § "Verification Environment"). Re-run there on 2026-09-26, in a throwaway
container started from `dsh-uplift:latest` at `-p 3182:3181`:

| Step | Result |
| --- | --- |
| `pnpm run check` (host + client + test faces) | green on Linux arm64 against the same rc.2 checkout |
| `pnpm run build` | `lib/client.js` emitted, **5457 bytes — byte-identical in size to the macOS build** |
| `pnpm run test` | 17/17 green, same two spec files |
| `import('dsh-better-ui-ux')` from the container profile | resolves and exports `{ apply, name }`, so the Host half loads |

Three container facts are worth recording, because each looked like a plugin defect and is not one:

* **The container clone has no built `lib/` trees.** `pnpm install` alone leaves every linked workspace package
  without types, so `tsc` reports `Cannot find module '@deepseek-ai/cordis'`. Run the harness build first
  (`node ./node_modules/typescript/bin/tsc -b tsconfig.client.json`).
* **`link:` devDependencies get no `.bin` entry there**, so `tsdown` is `not found` and `pnpm run build:client`
  fails. The in-repo harness reaches tsdown through its own `node_modules/.bin`; the plugin can do the same
  (`node ../deepseek-harness/node_modules/tsdown/dist/run.mjs`).
* **The container profile's `file:` installs are stale macOS hardlink trees** — their `lib/index.js` does not exist —
  under every profile plugin (`dsh-chat-wide`, `dsh-project-context`, `dsh-debate-bridge`, `dsh-opencode-go`), and the
  web frontend `dist` is not built, so a full container browser run is not reachable without repairing the image.
  This plugin is not among the failing rows; the browser-level acceptance evidence above stands on the second
  instance, and the container run establishes cross-platform build, check, test, and module-load parity.

## Layout

```text
src/
  index.ts             Host half: the stub fiber that keeps the client bundle served
  constants.ts         PLUGIN_ID, the seat name, the order, the locale namespace
  client/
    index.ts           Browser half: dictionary + stylesheet + the header-action registration
    ModelBadge.tsx     The badge: one projection read, one read-only span
    locales.ts         English dictionary and the namespace's key set
    styles.ts          The badge's owned, scoped <style> element (data-plugin)
    compactPickerControls.ts  The compact-picker _standardControls anchor rules (moved from the dsh-web fork)
test/
  client/client-bundle.spec.ts  Bundle identity, baseline-only requests, stylesheet, seat registration
  client/ModelBadge.spec.ts     null / never-selected / lastUsed / next-marker / frame advance / effort passthrough
  client/compactPickerControls.spec.ts  Rule text, sheet membership, and selector-shape coverage
```

## Known limitations

* **The badge and the composer disagree on purpose, right after a switch.** The badge reports `lastUsed` (what is
  running); the composer's control reports the selection for the *next* request. After switching models and before
  sending, the two surfaces show different routes, and the composer is the one that is ahead. The badge adds its
  `next` marker only for a Session that has never consumed a request, so it never claims "running" for a route that
  was merely selected.
* **The route is shown raw, not as a catalog display name.** The composer resolves a friendly name through the model
  directory, which is deployment-scoped and refuses an addressed child Session (`assertAvailable`); the badge
  therefore renders `provider/model` verbatim for every Session, including one the directory could have named.
* **Reasoning effort is deliberately not shown.** The projection carries `reasoningEffort` verbatim, including an
  effort the host applied as an adapter default while restoring a selection, so rendering it would sometimes name an
  effort nobody chose. The route itself is rendered untouched. Showing the effort needs a source that distinguishes
  a chosen effort from a restored default — a follow-up, not a tweak here.
* **A child opened in the sidebar's aside chat has no header, so it has no badge.** The aside renders
  `conversation.session` without `conversation.session.header`; the badge appears only in the main view, which is
  where the request that produced this plugin was made.
* **Out-of-process subagents are out of scope.** `subagent-acp`, `subagent-codex`, `subagent-claude-code` and
  `subagent-dsh-sdk` do not create a clickable in-process child Session, so there is no header to put a badge on.
* **A child Session that has sent no request shows no badge.** Cold child Sessions are seeded into the projection
  baseline, but a route the Session never used is not a fact worth showing — the badge stays away rather than
  guessing from the parent's route.
* **The compact-picker controls anchor is coupled to remote's private surface, not a public contract.** The
  selectors key on `@linxin666/dsh-remote-web-ui`'s body class (`dsh-remote-compact-picker`) and CSS-module suffixes
  (`_composerSeat`, `_trailing`, `_standardControls`, `_root`, `_track`), and the offsets are derived from remote's
  own geometry (send at `right:8px`, ring at `right:44px` in compact mode). A `@linxin666/dsh-remote-web-ui` version
  bump can change either silently; re-measure at 393px and 375px portrait touch (occupant span clear of send and
  tools; `_standardControls` computed `position:absolute`) whenever that package is bumped. This recheck duty moves
  here from the retired `dsh-web` fork's own change register.
* **The `right:80px` ring-in-trailing branch is dormant on the current host.** It matches only when a ring
  (`_root` containing `_track`) is a direct child of `_trailing`; the current host's only ring (`ContextMeter`)
  renders in the composer dock, a sibling of `_trailing`, not inside it. The branch is kept for fork parity, covered
  by a DOM-fixture selector test only (`test/client/compactPickerControls.spec.ts`), and needs a browser recheck the
  day a host or remote bump puts a ring directly under `_trailing`.
* **A 320px residual is inherited from the fork era.** At the narrowest tested width the fork register recorded a
  small overlap with the effort control under some pill copy lengths; this plugin carries the same rules verbatim,
  so the same residual can recur depending on occupant content width.
