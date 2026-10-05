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
| ① **Metadata** | `plugin.json` → `contributes.commands` | id / title / category / when / **description** / **params** — this is the **manifest**; it is what AI reads |
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
        "params": [
          { "name": "title", "type": "string", "description": "Note title (omitted = untitled)" }
        ]
      }
    ]
  }
}
```

```typescript
// Pool side: the real handler (registered when the component mounts; unregisterCommands(pluginId) on unmount)
useEffect(() => {
  window.linkdesk.commands.registerCommand(
    "demo-notes.addNote",
    (title?: string) => createNote(title), // ← the *same* action function the UI button calls
    { description: "Create a note and return its id" },
  );
}, []);
```

> ⚠️ **Declaring without registering a handler** = the palette shows it, nothing happens when clicked (no-op + a diagnostic warning).
> The declaration side contributes **metadata** (a placeholder); the handler is what actually runs.

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

---

## 3. Five things every command should get right

1. **`id` carries your own prefix**: `<pluginId>.<action>` (e.g. `demo-notes.addNote`).
   Both AI and users list "what can this plugin do" by **prefix** — an id without one gets attributed to somebody else.
2. **`description` states the intent; do not restate the id.** That single sentence is **how AI picks a command**: write
   "Delete every message logged in the current session", not "the clearSession command". Without it your command is just an id to AI.
3. **`params` written position by position** (`name` / `type` / `required` / `description`).
   Callers build `executeCommand(id, ...params)` straight from it and **never have to read your source to guess arguments**.
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

---

## 4. Four things not to do (each one has actually bitten us)

1. **⛔ Don't let the caller bypass your plugin.** The command handler must go through **your plugin's own state chain** (your existing
   store/service). Calling a lower-level API directly behind its back produces "the command ran but the UI doesn't know" — the sidebar
   lamp doesn't change, the list doesn't refresh.
2. **⛔ Don't write the command as a copy of the UI function.** Extract one shared action function and have the button's `onClick` call
   **the same one** as the command handler. Two copies drift apart over time, and no light turns on when they do.
3. **⛔ Don't leave gestures as the only path.** Hover buttons, context menus and double-clicks **all stay** (they feel good to use), but
   each one needs a command behind it: gestures are **feel**, commands are **entry points**. They coexist; this is not a replacement.
4. **⛔ Don't bury implicit preconditions in the command.** Express preconditions with `when` and spell them out in `description`
   ("requires an open serial port"), instead of relying on "some view happens to be selected right now" — the caller cannot see your focus.

---

## 5. Author checklist (tick as you go)

- [ ] I listed every action **a user can perform** in my plugin (including the ones that only live on hover buttons / context menus / double-clicked rows)
- [ ] Each has a `contributes.commands` entry (`id` + `title` required, `id` carries my prefix)
- [ ] Each has a `description` (one plain sentence, intent first — it is how AI picks the command)
- [ ] Anything with parameters has `params` (`name` matching the handler's parameter name, one of the four `type` values, `required` marked)
- [ ] Each has a real handler registered pool-side (`registerCommand`), with `unregisterCommands(pluginId)` on `unmount`
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
  1. **Registration timing** — if you only `registerCommand` when the **view component mounts**, an external AI
     **cannot see your commands** in the command list when the view was never opened (invoking one raises `EUNKNOWN`)
     ⇒ if you can register at activate time, do not defer it to mount.
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

**Related:** [03-contributes-spec](03-contributes-spec.md) §3.1 (every `contributes.commands` field) ·
[07-plugin-to-plugin-communication](07-plugin-to-plugin-communication.md) (calling another plugin's command) ·
[14-data-pipeline-command-conventions](14-data-pipeline-command-conventions.md) (naming conventions for data pipeline commands)
