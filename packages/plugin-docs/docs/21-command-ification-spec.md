# 21 — Command-ification Spec (so AI, keybindings and the Command Palette all take one road)

> 2026-09-28 · **In one line**: **everything a user can do in your UI should be a command.**
> A command is not "a shortcut for power users" — it is the **single entry point for an action**: the Command Palette, keybindings,
> context menus, automation and AI all come in through the same road.
> This doc is the **spec + author checklist**; field-level details live in [03-contributes-spec](03-contributes-spec.md) §3.1,
> and the runtime signature in [01-plugin-api-contract](01-plugin-api-contract.md) (the `commands` namespace).

---

## 1. Why (the shell only knows commands)

**The shell has zero knowledge about your plugin.** It doesn't know whether you are a serial monitor or a note board — it only knows
"**some plugin registered these commands**".

So "let AI operate my plugin" is not an application or an integration — it is **register a command and you are supported automatically**:

| What you do | What appears for free |
|:--|:--|
| `contributes.commands` + a pool-side `registerCommand` | One more item in the Command Palette · bindable to a key · referenceable from context menus/title bar/section buttons · **one more callable command on the AI surface (the command list)** |

**The flip side**: actions that live only in the UI (buttons that appear on hover, context-menu items, double-clicking a row) have
**no command at all**. That is fine for a human (they have hands), but for keybindings, for automation and for AI they **do not exist** —
the only option left is to fake mouse input, and faked mouse input depends on movement thresholds, timing and coordinates, so it can
silently fail on another machine or another resolution. **A command is one line of JSON; a mouse simulation is a stretch of unreliable code.**

---

## 2. Two legs (both are required)

| Leg | Where it is written | What it carries |
|:--:|:--|:--|
| ① **Metadata** | `plugin.json` → `contributes.commands` | id / title / category / when / **description** / **params** / **activation** / **risk** / **returns** / **example** — this is the **manifest**; it is what AI reads |
| ② **The real handler** | Pool-side code (when the view component mounts) | `window.linkdesk.commands.registerCommand(id, handler, meta)` — this is the **execution**; it lives only in the pool renderer |

```json
{
  "contributes": {
    "commands": [
      {
        "id": "demo-notes.addNote",
        "title": "New Note",
        "category": "Notes",
        "description": "Create a note and return its id",
        "activation": "entry",
        "risk": "R1",
        "params": [
          { "name": "title", "type": "string", "description": "Note title (omitted = untitled)" }
        ],
        "returns": [{ "name": "id", "type": "string", "description": "The new note's id" }],
        "example": { "title": "Shopping list" }
      }
    ]
  }
}
```

```typescript
// entry-level: registered at the **module top level** (on-command activation imports the entry,
// so this top-level side effect is the only registration moment)
window.linkdesk.commands.registerCommand(
  "demo-notes.addNote",
  (title?: string) => createNote(title), // ← the *same* action function the UI button calls
  { description: "Create a note and return its id" },
);

// view-level (`activation:"view"`): put it in the component's useEffect; the scope is removed
// automatically when the view unmounts — ⛔ do not unregisterCommands(pluginId) wholesale.
```

> ⚠️ **Declaring without registering a handler**: `entry` commands trigger **lazy activation** on invocation (the entry is imported and its top-level side effects register the handler); `view` commands with no view in place return `EVIEWREQUIRED` (the hint says "open-tab first"). ⛔ No more silent no-op.
> The declaration side contributes **metadata** (a placeholder); the handler is what actually runs.
>
> ⚠️ **View-state commands must be declared too**, with `activation:"view"`. The manifest is the only **advance** discoverability source: `describe` reports the declared `activation` for inactive commands, so AI does not have to "crash once → guess a view is needed → retry".

### 2.1 Calling a **host** command—never hard-code its id

The host also exposes commands of its own (`workbench.action.*`): opening a file, opening the "Open With"
picker, and so on. Your plugin may call them; the contract for doing so is deliberately narrow:

```ts
import { SHELL_COMMANDS, openWith } from "@linkdesk/plugin-sdk/shell-commands";
//                            ↑ the subpath, not the root entry — see the red note below

// ✅ preferred: the helper takes the request object and returns nothing to remember
openWith({ uri: "/path/to/file.pdf" });   // or { ext: "pdf" } when you only know the type

// ✅ equivalent, if you need the raw command face
window.linkdesk.commands.executeCommand(SHELL_COMMANDS.openWith, { uri });
```

> 🔴 **Runtime code must use the `/shell-commands` subpath**: the SDK's root entry also re-exports its build
> tooling (`vite.config.ts` → `vite`), so pulling these two values from the **root entry** drags the whole build
> chain into your plugin bundle — and **fails outright on Windows** (rollup tries to resolve `fsevents`, which
> only exists on macOS). Types (`OpenWithRequest` etc.) are unaffected: those are `import type`, erased at compile
> time, so the root entry or the subpath is equally fine.

| Rule | Why |
|:--|:--|
| ⛔ **Never write the host command id as a string literal** in your plugin | The id is owned by the host and can be unified/renamed; use `SHELL_COMMANDS.*` (the two literal sites—host constant + SDK constant—are reconciled by a gate, your plugin is not a third one) |
| ✅ **Probe before you show an affordance** | Feature-detect with `commands.getCommands()`; if the command is not registered, **hide the entry** — ⛔ no dead buttons (an item that is visible but does nothing is worse than one that is absent) |
| ⛔ **Do not use `placeholder` as an existence test** | Every command a plugin declares carries `placeholder: true` (that is the "metadata registered, execution routed to the pool" marker, not an implementation check)—it cannot tell you whether the host command really works |

```ts
// Feature-detect a host command before rendering the entry that calls it
const list = await window.linkdesk.commands?.getCommands?.();
setCanOpenWith(!!list?.some((c) => c?.id === SHELL_COMMANDS.openWith));
```

### 2.2 The third leg: container entry command (`iconCommand`, 0.2.60+)

What happens when someone clicks your icon in the icon bar is **declared by the plugin** — the shell no longer guesses
(it used to open a tab through the implicit `tab type == pluginId` convention).

```json
{
  "contributes": {
    "viewsContainers": {
      "demo-market": { "title": "Demo Market", "location": "sidebar", "iconCommand": "demo.openStore" }
    },
    "commands": [
      { "id": "demo.openStore", "title": "Open Demo Market", "description": "Open (or focus) the main page and reset it to home" }
    ]
  }
}
```

Once declared, **clicking the icon = switch the sidebar container + execute `demo.openStore`**; the "Enter …" button in the
sidebar and an AI call to `commands.execute("demo.openStore")` all take **the same command**. "Open my main page" therefore
has one implementation and one behaviour — AI does not have to fake mouse input, and you do not need a second road for AI.

| Situation | Shell behaviour |
|:--|:--|
| `iconCommand` declared and the command is registered | Switch the container + execute the command (exactly the same action as your button/AI) |
| Declared, but the command is not registered (typo / only registered when a view mounts and that view never opened) | Diagnostic warn + **fall back to legacy behaviour** (no silent no-op) |
| Not declared | Legacy behaviour, unchanged (tabOnly opens its tab / the `{pluginId}.openTabOnIcon` config) |

> The selection rule for multiple containers and the `main`-container exclusion are in
> [08-view-container-api](08-view-container-api.md) §2.

---

## 3. Eight things every command should get right

1. **`id` carries your own prefix**: `<pluginId>.<action>` (e.g. `demo-notes.addNote`).
   Both AI and users list "what can this plugin do" by **prefix** — an id without one gets attributed to somebody else.
2. **`description` states the intent; do not restate the id.** That single sentence is **how AI picks a command**: write
   "Delete every message logged in the current session", not "the clearSession command". Without it your command is just an id to AI.
3. **`params` written position by position** (`name` / `type` / `required` / `description`).
   Callers build `executeCommand(id, ...params)` straight from it and **never have to read your source to guess arguments**.
   The same declaration also carries **`returns`** (a receipt field table, not a JSON Schema; first-level keys only, `[]` when nothing is returned) and **`example`** (one request body that can run as-is, `{}` when there are no parameters) — so AI can compose calls and judge the response shape without trial and error.
4. **State must be readable back.** Once a command changes state, provide a separate read path (a list/query command, or
   `configuration.get()`) — "do it, then verify" is basic behaviour for automation and AI, and with no read path it can only retry blindly.
5. **Read streams back by pulling, with a cursor** (serial receive / logs / progress) — ⛔ never hand the caller a subscription.
   External callers (`linkdeskctl` / MCP) are **request/response**: a `onData(cb)` is something they cannot hold — the callback would have
   to live across process boundaries, nobody reconnects it after a drop, and whatever was missed is silently gone. The right shape is a
   **pull** (example: the `serial-monitor` plugin's `readSince` / `receiveStatus`):

   - **Signature**: `<plugin>.<area>Since(since, limit, …filters)` — `since` is the **cursor** ("how far I have read"), returning
     `{ items, cursor, lost }`: `cursor` is the seq of the **last item returned**, to be passed back verbatim on the next call;
     `lost` is how many items have already rolled out of your retention buffer. ⚠️ The cursor is a **global position**, not "the Nth
     item" — a filter narrows the **returned items** only, while the cursor still advances; otherwise switching filters would make the
     caller re-read or starve.
   - **Keep a retention buffer — not just the one behind the UI.** The UI chain is usually **drain-on-consume** (thrown away after
     render) and tied to the **view lifetime**, while the caller's first leg often happens with **no view open** ⇒ stand up a
     **module-level** sink (subscribe at entry top level, keep an N-item ring log). ⚠️ Shell events give **each subscriber its own
     channel** (`events.on` registers one `ipcRenderer.on` per subscriber), so your module-level subscription does **not** steal the
     view's events — both chains coexist safely; say so in a comment for whoever reads the code next.
   - **Add a water-level read** (`<plugin>.<area>Status()`: cursor / oldest seq / count / capacity / per-source counts) so the caller can
     tell "not open" from "open but silent" from "you fell behind (`lost > 0`)" before deciding whether to pull.
   - **Receipts, per the house rules**: no new data is not a failure — `{ ok: true, noop: true, reason: "no-new-data" }`; bad arguments,
     or a cursor past the end (e.g. the UI reloaded and seq restarted at 0 while the caller still holds an old cursor) ⇒
     `{ ok: false, noop: true, reason: … }`, handing back a **usable cursor**. ⛔ Never lump every case into "empty array + `ok:true`".

6. **`activation` says where the handler lives**: `entry` (registered at the entry's top level — callable with no view) or `view` (registered inside a view component — needs that view). It must match the **actual registration site**: the host records the runtime truth at registration, and the declaration is only the "tell AI before activation" hint; a conflict resolves to the runtime truth (+ a diagnostic). ⛔ Never register after `setTimeout` / `await` (the context is read wrong).
7. **`risk` is required**: `R0` read / `R1` reversible write / `R2` side-effecting write / `R3` irreversible or physical (reset, continuous sending, interrupting a connection, deleting data, replacing running code). To skip confirmation, declare `"risk": "R0"` **explicitly**; missing or invalid ⇒ fallback **R2** (it asks once). ⛔ Never guess from verbs (`send`/`list`) — a second-language name breaks it instantly.
8. **Write commands must be safe to retry**: a successful receipt carries the **post-change state** (the readable value after the change, or a `hint` pointing at the state command) — ⛔ never just `{}`/`true`. Optionally declare **`idempotencyKey`** (`string`) in `params`: on retry with the same key the **host** replays the first **successful** result (the second receipt carries `replayed:true`) — ⛔ do not build replay yourself; failures are not cached (changing arguments really re-runs). Guard concurrent writes with `expectedVersion`: a mismatch yields `ECONFLICT` (`details.stateVersion` = current version) — ⛔ never overwrite silently.

   **Long-running (async) commands**: put `{ async: true }` in the **meta** of `registerCommand` (type `AsyncCommandMeta`, imported from `@linkdesk/plugin-sdk/runtime`). The shell answers `{ commandId, pending: true, opId, startedAt }` immediately, runs the handler in the background, and records the op + emits `op.completed` on completion; callers query `opStatus` for `running|done|failed|expired`, and an expired handle yields `EOPEXPIRED`. ⛔ Do not build your own state machine or cache — and **there is no `runAsync` API**. The manifest may also declare `contributes.commands[].async` (an **advance hint**, purely additive); the runtime `meta.async` overrides the declaration (same as `activation`).

---

## 4. Five things not to do (each one has actually bitten us)

1. **⛔ Don't let the caller bypass your plugin.** The command handler must go through **your plugin's own state chain** (your existing
   store/service). Calling a lower-level API directly behind its back produces "the command ran but the UI doesn't know" — the sidebar
   lamp doesn't change, the list doesn't refresh.
2. **⛔ Don't write the command as a copy of the UI function.** Extract one shared action function and have the button's `onClick` call
   **the same one** as the command handler. Two copies drift apart over time, and no light turns on when they do.
3. **⛔ Don't leave gestures as the only path.** Hover buttons, context menus and double-clicks **all stay** (they feel good to use), but
   each one needs a command behind it: gestures are **feel**, commands are **entry points**. They coexist; this is not a replacement.
4. **⛔ Don't bury implicit preconditions in the command.** Express preconditions with `when` and spell them out in `description`
   ("requires an open serial port"), instead of relying on "some view happens to be selected right now" — the caller cannot see your focus.
5. **⛔ Never store display copy as a value**: configuration / persistence / command arguments keep an **ASCII id** (e.g. `"auto"`, `"utf-8"`); only the display layer calls `t("Auto")`. Storing the Chinese source string as the value means every language switch, copy edit or migration has to chase stored data.

---

## 5. Author checklist (tick as you go)

- [ ] I listed every action **a user can perform** in my plugin (including the ones that only live on hover buttons / context menus / double-clicked rows)
- [ ] Each has a `contributes.commands` entry (`id` + `title` required, `id` carries my prefix)
- [ ] Each has a `description` (one plain sentence, intent first — it is how AI picks the command)
- [ ] Anything with parameters has `params` (`name` matching the handler's parameter name, one of the four `type` values, `required` marked)
- [ ] Every command declares `risk` (`R0` explicitly); `returns` matches the real receipt; `example` executes as-is
- [ ] The same `commandId` is not registered in two scopes (reopening a view never changes the winner)
- [ ] Each has a real handler registered pool-side (entry: at the entry top level; view: inside the component), and `activation` matches the registration site
- [ ] Buttons/menu items and the command handler call **the same** action function (not two implementations)
- [ ] Anything that changes state also has a **read-back** path (list/query)
- [ ] The reply **distinguishes three states**: done / not done but not a failure / the call itself is wrong (`reason` is a distinguishable literal)
- [ ] An **addressed command** (one taking a target id) that cannot find its target **refuses honestly and lists what exists** — ⛔ it never falls back to "the active one / the first one"
- [ ] A **read command** reports "empty" and "could not read" **separately** (⛔ never report "unknown" as an empty array)
- [ ] A toggle/flip command's reply carries the **value read back after the change** (`field` / `previous` / `value`)
- [ ] Streams have a **pull** read-back path (cursor-based — ⛔ not a subscription) plus a water-level read
- [ ] Self-test: install it → findable in the Command Palette → `description`/`params` visible in the command list → invoking it works **and the UI reflects it**
- [ ] I walked these actions through **without a mouse** (keyboard / Command Palette) and every step was reachable

---

## 6. Scope (how far this spec reaches)

- **This doc governs new plugins**; existing plugins are not retrofitted: whether and how thoroughly to add commands is
  **each author's own call**.
- Whether a plugin command-ifies its business actions is **up to the author** — what this spec guarantees is that
  "**when you do want to be operable by AI, there is a standard way**", not that "every plugin must be command-ified".
- The scaffolder **ships a command-registration template** with new plugins (see the three tiers in
  [13-development-guide](13-development-guide.md)); this spec is the reasoning behind it. The two are complementary:
  one is **default-by-construction**, the other is **knowing what to write**.
- `when` only decides **whether a command shows up in menus/the palette** (and whether its keybinding fires); it does **not** block API
  calls — never use `when` as permission control.

---

## 7. Standing discipline (established 2026-09-29)

- 🔴 **This is not a one-off delivery**: from here on, **every new feature / new plugin** must satisfy
  "**① every user action has at least one non-mouse path; ② business actions are registered as commands, and the
  registration meta carries `description` + `params`**". The same sentence is hard constraint 26 in the shell repo
  (internal engineering rule, not linked here). Why: **holes grow back with each iteration** — the whole AI-friendliness
  effort started from a hidden gate in an old feature that blocked an AI.
- **Two mechanical self-checks** (run them, ⛔ do not eyeball it): `npm run audit:plugin-commands`
  (**reports, never blocks** — flags "a view is declared but there are zero commands" and "a whole batch lacks
  `description`") · `npm run manual:build` (byte-for-byte drift gate on the host-command manual index; plugin commands
  **do not** need to enter it — being visible to `getCommands()` at runtime is enough).
- **Verification is equally pointer-independent**: test commands through commands / APIs (or CLI / MCP), ⛔ never
  "screenshot → guess coordinates → click"; for faces that exist **only under the pointer** (hover buttons), use
  element anchoring ("grab the element, then act on the element itself") — ⛔ do not derive coordinates from window
  position (those coordinates break under a different window layout).
- ⚠️ **Three pitfalls from real runs** (hit during acceptance on 2026-09-29, written down to save the next person a round):
  1. **Registration timing** — if a command is only registered when the **view component mounts**, an external AI can see only the declaration while the view has never been opened; invoking it yields `EVIEWREQUIRED` (`ENOTACTIVE` when the plugin is disabled or failed to load) ⇒ register at the entry top level whenever possible; if it truly needs the view, declare `activation:"view"`.
  2. **Parameter shape** — `params` are **named**, while the execution face **originally** passed arguments **positionally**
     ⇒ a caller following the named-object form **silently did nothing** (`ok=true` with no effect). **Fixed**
     (2026-09-29): the command bridge seam (shared by `exec` and pool-side `executeCommand`) now expands a **single
     named object** in declared `params` order — positional spreading still works; both forms are correct. ⚠️ The
     narrowing: **exactly one object argument** + the command **declares ≥2 `params`** + at least one key **matches**;
     commands with ≤1 `params` are not expanded (that object is legitimately its argument).
  3. **Return value** — when the handler **returns nothing**, an outside caller only sees the envelope's `ok:true`, so
     "**ran but did nothing**" (target missing / precondition unmet / argument missing) and "**actually did it**" look
     **identical** to an AI, which then has to guess via screenshots and retries. **Rule**: if a command does work,
     **return a receipt** — done: `{ ok: true }`; **not done but not a failure**: `{ ok: true, noop: true, reason: "<literal>" }`
     (e.g. `"single-tab"` / `"max-depth"` / target missing); **this call itself is wrong**:
     `{ ok: false, noop: true, reason }` (e.g. missing argument / host not registered). `reason` must be a
     **distinguishable literal**, ⛔ never a catch-all "other". The two built-in split commands already set the example —
     **your handler's return value is the answer the AI reads**.

- 🔴 **Failure and addressing shapes** (established 2026-09-29; a standing convention alongside the three
  pitfalls above, with precedents from the host config-write command and the serial plugin's session addressing):
  1. **Read commands, and write commands that an outside caller addresses: bad arguments report in the payload, ⛔ never
     by throwing.** A throw travels through the shell's `runCommand` catch → `reportError` → a **user-visible red toast**,
     and "the caller wrote a bad argument" is something **the user can do nothing about** right then (a slap in the face
     helps nobody). The uniform shape is `{ ok: false, noop: true, reason: "<literal>", error: "<one sentence for humans>" }`
     — `reason` for code to branch on, `error` for humans/AI to read; when reporting "not found", **list what exists**
     (⛔ do not make the caller ask again). ⚠️ **Be honest about the split, do not flatten it**: the older batch of
     commands that "a human can click in a menu / context menu" (arguments filled in by the UI, so a bad argument can
     only be a real bug) **keep throwing**. Both shapes coexisting is **intentional**: ⛔ do not convert old commands to
     payloads, and do not write new ones as throws.
  2. **If you name it, you must know the name**: a command taking a target id (`sessionId` / `tabId` / `key` / `uri` …)
     **must hit when given one** — on a miss return `{ ok: false, noop: true, reason: "bad-…", error }` and list the
     **available** candidates, ⛔ **never silently fall back** to "the active one / the first one": that produces
     "**the books look fine, but a different object was changed**" — exactly the shape this effort keeps eradicating
     (and the hardest to debug when several objects coexist). Only the default (no id given) uses the old
     "active → first" semantics.
  3. **Read commands: empty ≠ failure, and "cannot read" ≠ empty.** An empty read honestly returns
     `{ ok: true, count: 0, … }`; an unreadable one (underlying error / that face not registered) returns
     `{ ok: false, noop: true, reason: "read-failed" }` with the cause. "There is none" and "I do not know" call for
     **opposite** responses (plug a device / change arguments vs. check drivers / permissions); blending them is the
     "answered nothing but looked like an answer" defect — the very shape this effort keeps eradicating.
  4. **Toggle/flip commands return the value read back**: `{ field, previous, value }` (`value` read **after** the change).
     ⛔ Do not let the caller infer state from the command title, the schema default, or its own intent — especially since
     **titles change with state** (dynamic titles); using one as a reading is **guaranteed wrong** (that is precisely how
     the external AI misjudged the 0.2.25 retest).

---


## 8. AI permission tiers (2026-11-24 · what an outside AI may do is the user's call)

An outside AI (MCP / CLI / scripts) can call your commands, but it is bound by the **permission tier the user picked**.
The same command surface behaves like this under the four tiers:

| Tier | Read | Reversible write (open tab / change settings) | Side-effecting write (persist / install) | Irreversible (update / delete data) |
|:--|:--:|:--:|:--:|:--:|
| Read-only | ✅ | ⛔ denied | ⛔ denied | ⛔ denied |
| Ask every time | ✅ | ask | ask | ask |
| Auto (default) | ✅ | ✅ | ✅ | ask |
| Full access | ✅ | ✅ | ✅ | ✅ |

- **A plugin command's risk comes only from your declaration**: `contributes.commands[].risk` (`R0`–`R3`) is **required**;
  the host built-in table covers shell commands only and **never overrides** your declaration. Missing or invalid ⇒ fallback **R2**
  (conservative: ask once, ⛔ never treat as read-only).
  - `R0` read / `R1` reversible write / `R2` side-effecting write / `R3` irreversible or **physical** (reset, continuous sending, interrupting a connection, deleting data, replacing running code).
  - To skip confirmation, declare `"risk": "R0"` **explicitly**; ⛔ never guess from verbs (`send`/`list`).
  - `describe` reports `risk` together with `riskSource` (`declared` / `shell` / `fallback`) so AI can judge whether the value is trustworthy.
  - The default tier is **`auto`**; `R3` still asks under `auto`.
  - During the internal test period the loader does **not** reject a plugin for a missing declaration (deferred); it falls back to R2.
- **`userOnly` is host metadata, not a manifest field**: host commands carrying it always answer `EPROTECTED` to the AI
  gateway (only the user can trigger them from the UI). ⛔ Do not look for this field in plugin.json — it governs commands
  that "change the door itself".
- **AI-side error codes** (clients branch on the code, ⛔ never treat them as `EERROR`):
  `EPOLICYDENIED` (current tier forbids it; the AI may request elevation) · `EPROTECTED` (userOnly, never callable) ·
  `EUSERDENIED` (the user said no) · `ESHELLTIMEOUT` (nobody answered = it never happened) ·
  `EVIEWREQUIRED` (view-state command but no view in place; open the tab first) · `ENOTACTIVE` (plugin disabled / failed to load) ·
  `EUNKNOWNCOMMAND` (not even declared) · `EOPEXPIRED` (async op handle expired) ·
  `ECONFLICT` (write conflict; `details.stateVersion` = current version — re-read the snapshot and retry).
- **Return `pluginError({ code, message, hint?, details? })` for expected business errors** (import from `@linkdesk/plugin-sdk/runtime`):
  🔴 **`return`, do not `throw`**: the handler crosses a `contextBridge` — a **thrown** value keeps `message` only, so `code`/`hint`/`details` are lost and the outside AI sees `EUNKNOWN`; a returned object is structured-cloned intact and the shell/CLI passes your `code` through verbatim. Reserve `throw` for genuinely unexpected failures.
  `code` is required and non-empty (an `E` prefix is a recommendation, not enforced); `details` passes through verbatim (`--json` only — ⛔ never in the CLI human-readable output).
  The shell codes above are produced by the shell — plugins ⛔ must not mint variants.
- **How a settings UI reads the tier**: call the `aiPolicy.getState` command (read-only) — it returns the current tier,
  the four-tier decision matrix, the risk table and the protected commands. ⛔ Do not read `settings.json` yourself and
  do not judge risk yourself (a replacement settings UI uses the same command).
- **Elevation**: the AI can only `requestElevation` (a dialog; it takes effect only when the user clicks "Allow" and lasts

  External AIs that hit `EPOLICYDENIED` use this path: CLI `linkdeskctl request-elevation <mode> <reason>`, MCP `linkdesk_request_elevation`; plugin authors do not implement elevation UI.
  until the user changes it back). ⛔ No plugin ever gets an "approve" entry point.

---

**Related:** [03-contributes-spec](03-contributes-spec.md) §3.1 (every `contributes.commands` field) ·
[07-plugin-to-plugin-communication](07-plugin-to-plugin-communication.md) (calling another plugin's command) ·
[14-data-pipeline-command-conventions](14-data-pipeline-command-conventions.md) (naming conventions for data pipeline commands)
