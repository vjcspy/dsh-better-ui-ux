# dsh-better-ui-ux

External [Cordis](https://deepseek-harness.github.io/deepseek-harness/) plugin for **DSH Web** that shows, in the
conversation header of the Session being viewed, (a) the effective model route (**`provider/model`**) and (b) the
**delegating tool name** of a subagent child (`agent_analyst`, `subagent`, `subagent_fork`, `spawn_teammate`, …)
— for the main Session and for every subagent child opened in the main view. It also anchors the composer's
`conversation.input.right` / `conversation.input.model` controls inside the card while
`@linxin666/dsh-remote-web-ui` is in compact-picker mode (see "Compact-picker controls anchor" below), a fix moved
here from the `vjcspy/dsh-web` fork so the fork can retire.

The requirement it answers: clicking into a subagent in the DSH host showed *what it was doing* but never *what it
was running on* or *which kind of subagent it is*. The header now names both, and the composer keeps owning the
route switch.

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
The subagent-type badge is a **second, independent registration** on the same seat at `order: -10` (it ties with
the agent-preset label; slot sorting is stable and ties keep registration sequence, so it lands between that label
and the model badge). The model badge itself keeps `order: 0` and is untouched.

Nothing is switched from the badge, and nothing is read from the model directory: the badge shows the **raw route**,
not a catalog display name (see Known limitations).

## Subagent-type badge

The header also renders the **raw delegating tool name** of the shown Session, immediately before the model badge:
`[ agent_analyst ] [ opencode-go/deepseek-v4.1-flash ]`.

DSH exposes no subagent type to the Web client, so the plugin derives it. The delegating tool name exists in exactly
one durable place — the **parent's** `tool/call.name` — and a projection's `apply` sees only its own Session's
events, so the plugin registers its **own session projection on the parent** (`subagentType`, key
`subagentType`, `stateVersion: 0`) whose value is a map `childSessionId → tool name`, and the badge walks one hop
up: shown child → its parent (the child's own subagent address first, then the list row's `parentId`) → the
parent's value for the shown id.

Correlation is conservative by design, because `subagent/catalog` carries no `callId`:

* **Admission** is by tool **name** — `subagent`, `subagent_fork`, `spawn_teammate`, or any `agent_*` — not by
  argument shape (`bash` also declares a required `description`).
* **Exact key** — a continuable delegation's result reads `started subagent <childId>`, which names both the call
  (`message.toolCallId`) and the child, so it binds them outright. The catalog is committed *before* that result
  exists, so the exact key is also applied on the result fold and outranks a provisional label match. The background
  arm's `started background subagent job <jobId>` is deliberately **not** matched: that id is a job, not a Session.
* **Label match** — otherwise the catalog's `label` (the delegation `description`) is matched against the parsed
  `arguments.description` of every unclaimed, non-errored admitted call preceding it, whether still open or already
  closed by a background start. It resolves only when **exactly one** candidate remains.
* **Everything ambiguous renders nothing.** Two same-label siblings (in any foreground/background mix) are hidden
  rather than swapped, and unclaimed calls expire by `turn` so one never-cataloged call cannot hide every later
  same-label delegation.

Ordering is expressed in `event.seq` everywhere (an array index does not survive a cold restore), the fold ignores a
fork child's `inheritedEventCount` prefix so a `subagent_fork` child never adopts its parent's delegations, and the
resolved map is replaced copy-on-write so a fold that binds nothing publishes no control frame.

| Case | Badge |
| --- | --- |
| Main Session (no parent link) | nothing |
| One-shot `agent_*` child, foreground or background | the tool name, e.g. `agent_analyst` |
| Continuable child | the tool name (exact key) |
| Generic `subagent` / `subagent_fork` child | `subagent` / `subagent_fork` |
| Agent Team teammate | `spawn_teammate` |
| Two same-label siblings, or a catalog with no label | nothing |
| Out-of-process child (no `subagent/catalog`) | nothing |
| Parent projection absent (plugin unloaded) | nothing, no error |

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

The Host half registers the session projection described above; it has **no configuration**, and the bundle patch
ships a row with no `config:` block. A client bundle is also served only for a loader entry with a live Host fiber,
so the half has to exist either way.

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
| `pnpm run test` | 17/17 green, same two spec files (the count at that run; the suite is now 6 files / 72 cases) |
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

### Container run for the subagent-type badge (2026-09-27)

Re-run in `dsh-uplift:latest` (container `dsh-subagent-type-badge`, published `127.0.0.1:3185`), on the linked
harness checkout and the pristine npm `@linxin666/dsh-remote-web-ui@0.4.2`, with `agent-browser` driving the page
from the host:

| Step | Result |
| --- | --- |
| `pnpm run check` (host + client + test faces) | green |
| `pnpm run test` | **6 spec files / 72 cases green** (pre-change baseline: 3 files / 22 cases) |
| `pnpm run build` | `lib/client.js` 17.87 kB, `lib/index.js` emitted |
| Boot manifest | `dsh-better-ui-ux/client.js` present; no `failed to import` line |

Badge behaviour, read from the live DOM of a real session (`opencode-go/muse-spark-1.3-contributor`) whose parent
made one delegation per tool:

| Case | Observed |
| --- | --- |
| Main Session | no type badge, model badge only |
| Foreground one-shot `agent_analyst` child | `agent_analyst` |
| Background one-shot `agent_scout` child (`run_in_background: true`, result `started background subagent job subagent-1`) | `agent_scout` |
| Continuable `subagent` child (result `started subagent <id>`) | `subagent` |
| `subagent_fork` child | `subagent_fork` |
| That fork child's own child | `agent_scout` — the fork child's own delegation, with `inheritedEventCount: 95` and its parent's seven bindings absent from its own value |
| Agent Team teammate | `spawn_teammate` |
| Two same-label siblings (one foreground, one background, one step) | **both hidden** |
| Header band order | `[Agent Team] [agent_analyst] [Standard mode] [opencode-go/deepseek-v4.1-flash]` |
| Cold reload with a child shown | badge restored, unchanged |
| Plugin removed from the profile | no badge, no page error, no crash |
| Control-frame churn, delegation-free turn | 38 control frames received, **0** carrying `subagentType` |
| Control-frame churn, delegating turn (positive control) | 112 frames, **5** carrying `subagentType` (incl. a `type: "projection"` item for the key) |

**Reachability is better than the plan assumed.** The plan predicted that a parent last live *before* the plugin was
installed would never carry the key, and that a `stateVersion` bump would re-orphan every cold row. Neither holds:
the projection-cache's `coldSnapshot` folds a session's **complete log** on a cold read and writes the refreshed
checkpoint back (`packages/session/session-projection-cache/src/index.ts`, `coldSnapshot`), and the client requests
exactly that for the sessions in its list and for every opened child's parent
(`packages/api/session-controller/src/client/sessions/manager.ts`, `handleConnected`). Measured: a parent created
with the plugin absent had no `subagentType` row; after installing the plugin and merely loading the page, its row
existed with all bindings, and a row left at a stale `ver` was rewritten at the registration's current version. So
pre-existing sessions are not stranded, and a future `stateVersion` bump self-heals on the next read.

## Layout

```text
src/
  index.ts             Host half: registers the subagent-type session projection
  projection.ts        The parent-owned fold: admission, expiry, exact key, label tier, wire view
  projection-types.ts  The two declaration merges that make the key addressable on both faces
  constants.ts         PLUGIN_ID, the seat names and orders, the locale namespaces, the projection key
  client/
    index.ts           Browser half: dictionaries + stylesheet + both header-action registrations
    ModelBadge.tsx     The model badge: one projection read, one read-only span
    SubagentTypeBadge.tsx  The type badge: child → parent → the parent's value for that child
    locales.ts         English dictionaries and both namespaces' key sets
    styles.ts          The badges' owned, scoped <style> element (data-plugin)
    compactPickerControls.ts  The compact-picker _standardControls anchor rules (moved from the dsh-web fork)
test/
  host/projection.spec.ts       Admission, label tier, exact key, malformed JSON, fork prefix, expiry, wire stability
  client/client-bundle.spec.ts  Bundle identity, baseline-only requests, stylesheet, both seat registrations
  client/ModelBadge.spec.ts     null / never-selected / lastUsed / next-marker / frame advance / effort passthrough
  client/SubagentTypeBadge.spec.ts  Parent resolution, hidden cases, primitive selector, accessible name
  client/compactPickerControls.spec.ts  Rule text, sheet membership, and selector-shape coverage
```

## Known limitations

* **The subagent-type badge renders nothing when the delegation is unresolved.** The correlation rule prefers
  silence to a guess, so two same-label siblings (in any foreground/background mix), a catalog whose label matches no
  admitted call, a catalog with no label, and a trimmed teammate label that fails its exact match all hide the badge.
* **Out-of-process subagent providers cannot be resolved at all.** A provider that sets `localAgent: undefined`
  (`subagent-acp`, `subagent-codex`, `subagent-claude-code`, `subagent-dsh-sdk`) emits no `subagent/catalog`, so
  those children have no anchor and render nothing. They also do not create a clickable in-process child to badge.
* **A profile that overrides `config.toolName` is not admitted.** Admission matches the literal names `subagent`,
  `subagent_fork`, `spawn_teammate` and the `agent_` prefix; a renamed delegating tool resolves to *hidden*, never to
  a wrong name.
* **The badge shows the delegating tool name, not a role.** `agent_analyst` is the invoked tool; the agent markdown's
  front-matter `name:` is never read, and no effort/route enrichment is shown.
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
